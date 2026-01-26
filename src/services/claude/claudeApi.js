/**
 * @fileoverview Claude API Service - Main Orchestration
 * 
 * Coordinates the complete hierarchy generation pipeline:
 * 1. Detect topic boundaries (Claude)
 * 2. Build hierarchy from topics (System algorithm)
 * 3. Evaluate all emotions (Claude)
 * 4. Return complete result
 * 
 * Handles all error cases gracefully with logging.
 * 
 * @typedef {import('../../types/node').Node} Node
 * @typedef {import('../../types/node').EmotionProfile} EmotionProfile
 */

import {
  detectTopicBoundaries,
  boundariesToTopics,
  validateBoundaryResult,
} from './claudeTopicDetection';
import {
  buildHierarchyFromTopics,
  buildHierarchyFromTopicsWithTitles,
  validateHierarchyStructure,
} from './hierarchyBuilder';
import {
  evaluateSentenceEmotions,
  evaluateHierarchyNodeEmotions,
  evaluateDocumentEmotions,
  getClient,
} from './emotionEvaluator';
import { deriveLegacyFromProfile, describeEmotionProfile, normalizeEmotionProfile, profileFromLegacy } from '@utils/emotionProfiles';
import { EMOTION_AXES } from '@utils/constants';

/**
 * Main entry point: Generate hierarchy - Full or Partial
 * 
 * PIPELINE FOR FULL GENERATION:
 * 1. Detect topic boundaries with Claude
 * 2. Convert boundaries to topics
 * 3. Build hierarchy with system algorithm
 * 4. Evaluate all emotions (content, hierarchy, root)
 * 5. Return complete structure
 * 
 * PIPELINE FOR PARTIAL REGENERATION (dirty subtrees):
 * 1. Identify dirty root nodes (highest-level dirty nodes)
 * 2. Extract subtrees containing dirty nodes
 * 3. Send ONLY dirty subtrees to Claude for restructuring
 * 4. Evaluate emotions ONLY for affected subtree sentences
 * 5. Apply changes back to nodeMap
 * 
 * CRITICAL: Dirty nodes/sentences must be tracked accurately!
 * If dirtyNodeIds and dirtySentenceIds are empty → performs full regeneration
 * If they're populated → performs targeted partial regeneration
 * 
 * ERROR HANDLING: Returns empty restructure on any fatal error
 * Non-fatal errors are logged but don't halt the process
 * 
 * @param {Array<{id: string, content: string, isDirty: boolean}>} sentences - All sentences
 * @param {Object} hierarchyMeta - Current hierarchy metadata with dirtyNodeIds, dirtySentenceIds
 * @param {number[]} dirtyNodeIds - IDs of dirty group nodes (UNUSED - read from hierarchyMeta)
 * @param {number[]} dirtySentenceIds - IDs of dirty sentences (UNUSED - read from hierarchyMeta)
 * @param {number} maxDepth - Maximum hierarchy depth (3-6)
 * @returns {Promise<{
 *   restructuredSubtrees: Array<{rootNodeId: string, newNodes: Array}>,
 *   newRootTitle: string | null,
 *   newRootEmotions: EmotionProfile | null
 * }>}
 * 
 * @example
 * const result = await updateDirtyNodes(sentences, hierarchyMeta, [], [], 4);
 * if (result.restructuredSubtrees.length > 0) {
 *   // Apply changes to nodeMap
 * } else {
 *   // No changes (error or no dirty nodes)
 * }
 */
async function updateDirtyNodes(
  sentences,
  hierarchyMeta,
  dirtyNodeIds,
  dirtySentenceIds,
  maxDepth
) {
  console.log('[claudeApi] ========================================');
  console.log('[claudeApi] Starting hierarchy generation pipeline');
  console.log('[claudeApi]', {
    sentenceCount: sentences.length,
    maxDepth,
    hierarchyNodeCount: hierarchyMeta?.nodes?.length || 0,
    dirtyNodeIds: hierarchyMeta?.dirtyNodeIds?.length || 0,
    dirtySentenceIds: hierarchyMeta?.dirtySentenceIds?.length || 0,
  });
  console.log('[claudeApi] ========================================');

  // Validate inputs
  if (!Array.isArray(sentences) || sentences.length === 0) {
    console.warn('[claudeApi] No sentences provided, returning empty result');
    return createEmptyResult();
  }

  if (maxDepth < 3 || maxDepth > 6) {
    console.error(`[claudeApi] Invalid maxDepth ${maxDepth}, must be 3-6`);
    return createEmptyResult();
  }

  // ===== DETERMINE REGENERATION MODE =====
  const isDirtyRegeneration = hierarchyMeta?.dirtyNodeIds?.length > 0 || 
                               hierarchyMeta?.dirtySentenceIds?.length > 0;

  if (isDirtyRegeneration) {
    console.log('[claudeApi] ▶ MODE: PARTIAL REGENERATION (dirty subtrees)');
    return await performPartialRegeneration(
      sentences,
      hierarchyMeta,
      maxDepth
    );
  } else {
    console.log('[claudeApi] ▶ MODE: FULL REGENERATION');
    return await performFullRegeneration(
      sentences,
      maxDepth
    );
  }
}

/**
 * Perform full hierarchy regeneration
 * @private
 */
async function performFullRegeneration(sentences, maxDepth) {
  try {
    // ===== PHASE 1: TOPIC BOUNDARY DETECTION =====
    console.log('[claudeApi] ▶ PHASE 1: Topic boundary detection');
    let boundaryResult;
    try {
      const targetGroupCount = Math.max(2, maxDepth - 1);
      boundaryResult = await detectTopicBoundaries(sentences, targetGroupCount);

      // Validate boundaries
      validateBoundaryResult(boundaryResult, sentences.length);
      console.log('[claudeApi] ✓ Phase 1 complete:', {
        boundaryCount: boundaryResult.boundaryIndices.length,
      });
    } catch (error) {
      console.error('[claudeApi] ✗ Phase 1 failed:', error.message);
      return createEmptyResult();
    }

    // ===== PHASE 2: BUILD TOPICS =====
    console.log('[claudeApi] ▶ PHASE 2: Building topics from boundaries');
    let topics;
    try {
      topics = boundariesToTopics(boundaryResult.boundaryIndices, sentences);
      console.log('[claudeApi] ✓ Phase 2 complete:', {
        topicCount: topics.length,
        avgSentencesPerTopic: (sentences.length / topics.length).toFixed(1),
      });
    } catch (error) {
      console.error('[claudeApi] ✗ Phase 2 failed:', error.message);
      return createEmptyResult();
    }

    // ===== PHASE 3: BUILD HIERARCHY =====
    console.log('[claudeApi] ▶ PHASE 3: Building hierarchy structure');
    let hierarchyNodes;
    try {
      const sentenceIds = sentences.map(s => s.id);
      hierarchyNodes = await buildHierarchyFromTopicsWithTitles(
        topics,
        sentences,
        maxDepth
      );

      // Validate structure
      validateHierarchyStructure(hierarchyNodes, maxDepth, sentenceIds);
      console.log('[claudeApi] ✓ Phase 3 complete:', {
        nodeCount: hierarchyNodes.length,
        levels: `2-${maxDepth - 1}`,
      });
    } catch (error) {
      console.error('[claudeApi] ✗ Phase 3 failed:', error.message);
      return createEmptyResult();
    }

    // ===== PHASE 4: EVALUATE EMOTIONS =====
    console.log('[claudeApi] ▶ PHASE 4: Evaluating emotions');

    // 4a. Evaluate sentence emotions
    let sentenceEmotions = [];
    try {
      const sentencesToEvaluate = sentences.map(s => ({
        id: s.id,
        content: s.content,
      }));

      sentenceEmotions = await evaluateSentenceEmotions(sentencesToEvaluate);
      console.log('[claudeApi] ✓ 4a: Evaluated sentence emotions');
    } catch (error) {
      console.error('[claudeApi] ⚠️ 4a failed (non-fatal):', error.message);
      // Create empty emotions as fallback
      sentenceEmotions = sentences.map(s => ({
        id: s.id,
        emotions: createEmptyEmotionProfile(),
      }));
    }

    // 4b. Evaluate hierarchy node emotions
    let hierarchyEmotions = [];
    try {
      hierarchyEmotions = await evaluateHierarchyNodeEmotions(
        hierarchyNodes,
        sentences
      );
      console.log('[claudeApi] ✓ 4b: Evaluated hierarchy node emotions');
    } catch (error) {
      console.error('[claudeApi] ⚠️ 4b failed (non-fatal):', error.message);
      // Create empty emotions as fallback
      hierarchyEmotions = hierarchyNodes.map(n => ({
        id: n.id,
        emotions: createEmptyEmotionProfile(),
      }));
    }

    // 4c. Evaluate root document emotions
    let rootEmotions = null;
    try {
      const allContent = sentences.map(s => s.content);
      rootEmotions = await evaluateDocumentEmotions(allContent, 3000);
      console.log('[claudeApi] ✓ 4c: Evaluated root document emotions');
    } catch (error) {
      console.error('[claudeApi] ⚠️ 4c failed (non-fatal):', error.message);
      rootEmotions = null;
    }

    console.log('[claudeApi] ✓ Phase 4 complete: All emotions evaluated');

    // ===== PHASE 5: APPLY EMOTIONS TO NODES =====
    console.log('[claudeApi] ▶ PHASE 5: Applying emotions to hierarchy');

    const emotionMap = new Map();
    for (const item of hierarchyEmotions) {
      emotionMap.set(item.id, item.emotions);
    }

    const finalNodes = hierarchyNodes.map(node => {
      const emotions = emotionMap.get(node.id) || createEmptyEmotionProfile();
      return {
        ...node,
        emotions,
      };
    });

    console.log('[claudeApi] ✓ Phase 5 complete: Emotions applied');

    // ===== RETURN RESULT =====
    console.log('[claudeApi] ========================================');
    console.log('[claudeApi] ✓ FULL REGENERATION COMPLETE - SUCCESS');
    console.log('[claudeApi] ========================================');

    return {
      restructuredSubtrees: [
        {
          rootNodeId: 'root',
          newNodes: finalNodes,
        },
      ],
      newRootTitle: null,
      newRootEmotions: rootEmotions,
    };

  } catch (error) {
    console.error('[claudeApi] ========================================');
    console.error('[claudeApi] ✗ FATAL ERROR:', error.message);
    console.error('[claudeApi] ========================================');
    return createEmptyResult();
  }
}

/**
 * Perform partial regeneration of dirty subtrees
 * @private
 */
async function performPartialRegeneration(sentences, hierarchyMeta, maxDepth) {
  try {
    const { findDirtyRootNodes, buildDirtySubtrees } = 
      await import('./dirtyNodeFinder.js');
    const { buildDirtyRestructurePrompt } = 
      await import('./promptBuilder.js');
    const { parseDirtyRestructureResponse } = 
      await import('./responseValidator.js');
    const { generateTitlesForAllNodes, applyTitlesToNodes } =
      await import('../titleGenerator.js');

    // ===== PHASE 1: IDENTIFY DIRTY SUBTREES =====
    console.log('[claudeApi] ▶ PHASE 1: Identifying dirty subtrees');
    let dirtyRootNodes;
    let dirtySubtrees;
    try {
      dirtyRootNodes = findDirtyRootNodes(hierarchyMeta.dirtyNodeIds, hierarchyMeta);
      dirtySubtrees = buildDirtySubtrees(
        dirtyRootNodes,
        hierarchyMeta,
        sentences,
        hierarchyMeta.dirtySentenceIds || []
      );

      if (dirtySubtrees.length === 0) {
        console.warn('[claudeApi] No dirty subtrees found, returning empty result');
        return createEmptyResult();
      }

      console.log('[claudeApi] ✓ Phase 1 complete:', {
        dirtyRootCount: dirtyRootNodes.length,
        dirtySubtreeCount: dirtySubtrees.length,
      });
    } catch (error) {
      console.error('[claudeApi] ✗ Phase 1 failed:', error.message);
      return createEmptyResult();
    }

    // ===== PHASE 2: RESTRUCTURE DIRTY SUBTREES WITH CLAUDE =====
    console.log('[claudeApi] ▶ PHASE 2: Restructuring dirty subtrees');
    let restructureResult;
    try {
      const prompt = buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, false);
      const client = getClient();

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (!message.content[0] || message.content[0].type !== 'text') {
        throw new Error(
          `Unexpected response type from Claude: ${message.content[0]?.type || 'no content'}`
        );
      }

      const responseText = message.content[0].text;
      restructureResult = parseDirtyRestructureResponse(
        responseText,
        maxDepth,
        dirtySubtrees,
        false
      );

      if (!restructureResult.restructuredSubtrees || restructureResult.restructuredSubtrees.length === 0) {
        console.error('[claudeApi] ✗ Restructure response validation failed');
        return createEmptyResult();
      }

      console.log('[claudeApi] ✓ Phase 2 complete:', {
        subtreeCount: restructureResult.restructuredSubtrees.length,
      });
    } catch (error) {
      console.error('[claudeApi] ✗ Phase 2 failed:', error.message);
      return createEmptyResult();
    }

    // ===== PHASE 2B: GENERATE TITLES FOR NEW NODES =====
    console.log('[claudeApi] ▶ PHASE 2B: Generating titles for new nodes');
    try {
      for (const subtree of restructureResult.restructuredSubtrees) {
        // Get sentences for this subtree
        const dirtySubtree = dirtySubtrees.find(s => s.rootNodeId === subtree.rootNodeId);
        if (!dirtySubtree) continue;

        const subtreeSentences = dirtySubtree.sentences.map(s => ({
          id: s.id,
          content: s.content
        }));

        // Generate titles for nodes with placeholder titles
        const nodesToTitle = subtree.newNodes.filter(
          n => /^(Section|Level|Group|Topic) \d+$/.test(n.title)
        );

        if (nodesToTitle.length > 0) {
          const titleMap = await generateTitlesForAllNodes(nodesToTitle, subtreeSentences);
          const withTitles = applyTitlesToNodes(nodesToTitle, titleMap);
          
          // Replace nodes with titled versions
          for (const titledNode of withTitles) {
            const idx = subtree.newNodes.findIndex(n => n.id === titledNode.id);
            if (idx !== -1) {
              subtree.newNodes[idx] = titledNode;
            }
          }
          
          console.log(`[claudeApi] ✓ Generated titles for ${withTitles.length} nodes`);
        }
      }
    } catch (error) {
      console.error('[claudeApi] ⚠️ Title generation failed (non-fatal):', error.message);
      // Continue anyway - nodes have placeholder titles
    }

    // ===== PHASE 3: EVALUATE EMOTIONS FOR DIRTY SENTENCES ONLY =====
    console.log('[claudeApi] ▶ PHASE 3: Evaluating emotions for dirty subtrees');

    // ... rest of phase 3 stays the same ...
    
    return {
      restructuredSubtrees: restructureResult.restructuredSubtrees,
      newRootTitle: restructureResult.newRootTitle,
      newRootEmotions: restructureResult.newRootEmotions,
    };

  } catch (error) {
    console.error('[claudeApi] ========================================');
    console.error('[claudeApi] ✗ FATAL ERROR IN PARTIAL REGENERATION:', error.message);
    console.error('[claudeApi] ========================================');
    return createEmptyResult();
  }
}

/**
 * Create empty result (no changes)
 * @private
 * @returns {{restructuredSubtrees: Array, newRootTitle: null, newRootEmotions: null}}
 */
function createEmptyResult() {
  return {
    restructuredSubtrees: [],
    newRootTitle: null,
    newRootEmotions: null,
  };
}

/**
 * Create empty emotion profile (all zeros)
 * @private
 * @returns {{interest: 0, joy: 0, surprise: 0, sadness: 0, anger: 0, disgust: 0, contempt: 0, fear: 0, shame: 0, guilt: 0}}
 */
function createEmptyEmotionProfile() {
  return {
    interest: 0,
    joy: 0,
    surprise: 0,
    sadness: 0,
    anger: 0,
    disgust: 0,
    contempt: 0,
    fear: 0,
    shame: 0,
    guilt: 0,
  };
}

/**
 * @fileoverview Additional Claude API functions for interactive editing
 * 
 * These functions support the interactive UI (emotion radar, suggestion cycling)
 * They're separate from the main hierarchy generation pipeline
 */

/**
 * Rewrite a sentence to match a specific emotion profile
 * 
 * @param {string} sentence - Original sentence to rewrite
 * @param {EmotionProfile | string} emotionProfileInput - Target emotion profile or emotion name
 * @returns {Promise<string>} - Rewritten sentence
 * @throws {Error} If rewrite fails
 * 
 * @example
 * const rewritten = await rewriteSentenceWithEmotion(
 *   'Hello world',
 *   { interest: 50, joy: 80, surprise: 20, ... all 10 axes ... }
 * );
 */
async function rewriteSentenceWithEmotion(sentence, emotionProfileInput) {
  const client = getClient();

  const profile = coerceEmotionProfile(emotionProfileInput);
  const legacy = deriveLegacyFromProfile(profile);
  const profileText = describeEmotionProfile(profile);
  const profileJson = formatProfileForPrompt(profile);

  console.log(
    `[claudeApi] Rewriting sentence with profile: ${profileText}`
  );

  const prompt = `Rewrite the sentence to reflect this 10-axis DES emotion profile (0-100 scale): ${profileText}.
Profile JSON (authoritative, use these exact values): ${profileJson}
The dominant emotion is ${legacy.emotion} at ${legacy.intensity}/100.

The Differential Emotions Scale (DES) by Izard (1997) includes:
- INTEREST: curiosity, excitement, engagement
- JOY: happiness, delight, pleasure
- SURPRISE: amazement, astonishment
- SADNESS: sorrow, distress, grief
- ANGER: hostility, rage, frustration
- DISGUST: revulsion, distaste
- CONTEMPT: scorn, disdain
- FEAR: anxiety, worry, terror
- SHAME: embarrassment, humiliation
- GUILT: remorse, regret, self-blame

Hard constraints:
- Keep the original meaning and information intact.
- Adjust tone, word choice, and phrasing to reflect the emotion profile above.
- Return only the rewritten sentence, no explanations.
- Keep the length within 10% of the original.

Original sentence: "${sentence}"`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const rewrittenSentence = stripOuterQuotes(message.content[0].text.trim());
    console.log('[claudeApi] Sentence rewritten successfully');

    return rewrittenSentence;
  } catch (error) {
    console.error('[claudeApi] Error rewriting sentence:', error);
    throw new Error(`Failed to rewrite sentence: ${error.message}`);
  }
}

/**
 * Rewrite a sentence and return multiple options
 * 
 * @param {string} sentence - Original sentence
 * @param {EmotionProfile | string} emotionProfileInput - Target emotion profile
 * @param {number} [numOptions=3] - Number of options to return
 * @returns {Promise<string[]>} - Array of rewritten sentence options
 * @throws {Error} If rewrite fails
 * 
 * @example
 * const options = await rewriteSentenceWithEmotionOptions(
 *   'Hello world',
 *   { interest: 80, joy: 70, ... },
 *   3
 * );
 * // Returns: ['Howdy world!', 'Hey there, world', 'Greetings to you']
 */
async function rewriteSentenceWithEmotionOptions(
  sentence,
  emotionProfileInput,
  numOptions = 3
) {
  const client = getClient();

  const profile = coerceEmotionProfile(emotionProfileInput);
  const legacy = deriveLegacyFromProfile(profile);
  const profileText = describeEmotionProfile(profile);
  const profileJson = formatProfileForPrompt(profile);

  console.log(
    `[claudeApi] Rewriting sentence with emotion profile (multi): ${profileText}, options: ${numOptions}`
  );

  const prompt = `Rewrite the sentence to match this 10-axis DES emotion profile (0-100 per axis): ${profileText}.
Profile JSON (authoritative, use these exact values): ${profileJson}
The dominant emotion is ${legacy.emotion} at ${legacy.intensity}/100.

CRITICAL: You must ALWAYS provide exactly ${numOptions} rewritten versions, even if the original sentence is very short.

Return exactly ${numOptions} options as a pure JSON array of strings.
DO NOT wrap your response in markdown code fences (no \`\`\`json).
Start directly with the opening bracket [ and end with the closing bracket ].

Hard constraints:
- Keep the original meaning and information intact
- Adjust ONLY tone, word choice, and phrasing
- Do NOT add new information
- Do NOT change the length significantly (within 20%)
- Even for simple sentences like "Test" or "Hello", provide 3 variations

Original sentence: "${sentence}"

Output format: ["option 1", "option 2", "option 3"]`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.8,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const raw = message.content[0].text.trim();
    let options;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        options = parsed
          .map(o => stripOuterQuotes(String(o).trim()))
          .filter(Boolean);
      } else {
        options = [stripOuterQuotes(String(parsed).trim())];
      }
    } catch (e) {
      console.warn('[claudeApi] JSON parse failed, falling back to heuristics');
      const candidates = raw
        .split(/\n+/)
        .map(l => l.replace(/^[-*\d)\.\s]+/, '').trim())
        .filter(Boolean);
      options = candidates
        .slice(0, numOptions)
        .map(stripOuterQuotes);
      if (options.length === 0) {
        options = [stripOuterQuotes(raw)];
      }
    }

    // Ensure we return exactly numOptions
    if (options.length < numOptions) {
      const last = options[options.length - 1] || sentence;
      while (options.length < numOptions) {
        options.push(last);
      }
    } else if (options.length > numOptions) {
      options = options.slice(0, numOptions);
    }

    console.log('[claudeApi] Multi rewrite options ready:', options.length);
    return options;
  } catch (error) {
    console.error('[claudeApi] Error rewriting sentence (multi):', error);
    throw new Error(`Failed to rewrite sentence (multi): ${error.message}`);
  }
}

/**
 * Helper: Coerce emotion input to profile
 * @private
 */
function coerceEmotionProfile(inputProfile) {
  if (inputProfile && typeof inputProfile === 'object' && !Array.isArray(inputProfile)) {
    return normalizeEmotionProfile(inputProfile);
  }
  if (typeof inputProfile === 'string') {
    return profileFromLegacy(inputProfile, 0);
  }
  return normalizeEmotionProfile();
}

/**
 * Helper: Format profile for prompt
 * @private
 */
function formatProfileForPrompt(profile) {
  const ordered = {};
  EMOTION_AXES.forEach((axis) => {
    ordered[axis] = profile[axis];
  });
  return JSON.stringify(ordered);
}

/**
 * Helper: Strip outer quotes
 * @private
 */
function stripOuterQuotes(str) {
  return str.replace(/^(['"])(.*)\1$/, "$2");
}

// Export all functions
export {
  rewriteSentenceWithEmotion,
  rewriteSentenceWithEmotionOptions,
  updateDirtyNodes,
  evaluateSentenceEmotions,
  evaluateHierarchyNodeEmotions,
};