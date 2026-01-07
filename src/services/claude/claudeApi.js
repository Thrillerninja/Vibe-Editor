/**
 * Claude API Service
 * Main entry point for Claude API interactions
 */

import Anthropic from '@anthropic-ai/sdk';
import { findDirtyRootNodes, buildDirtySubtrees, findSentencesInNode } from './dirtyNodeFinder.js';
import { buildDirtyRestructurePrompt } from './promptBuilder.js';
import { parseDirtyRestructureResponse } from './responseValidator.js';
import { EMOTIONS, EMOTION_AXES } from '../../utils/constants.js';
import {
    normalizeEmotionProfile,
    deriveLegacyFromProfile,
    profileFromLegacy,
    describeEmotionProfile,
} from '../../utils/emotionProfiles.js';

// Initialize the Anthropic client
const getClient = () => {
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;

    if (!apiKey || apiKey === 'your_api_key_here') {
        throw new Error(
            'Claude API key not configured. Please set VITE_CLAUDE_API_KEY in your .env file.\n' +
            'Get your API key from https://console.anthropic.com/'
        );
    }

    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
    });
};

/**
 * Restructure dirty portions of the hierarchy
 * Allows Claude to add/remove/reorganize nodes for dirty sentences
 * @param {Array} sentences - Array of sentence objects
 * @param {Object} hierarchyMeta - Existing hierarchy metadata
 * @param {Array} dirtyNodeIds - IDs of nodes affected by changes
 * @param {Array} dirtySentenceIds - IDs of sentences that were modified
 * @param {number} maxDepth - Maximum depth of hierarchy
 * @returns {Promise<Object>} Updated hierarchy structure
 */
export async function updateDirtyNodes(sentences, hierarchyMeta, dirtyNodeIds, dirtySentenceIds, maxDepth) {
    const client = getClient();

    console.log('[Claude Service] Restructuring dirty portions of hierarchy');
    console.log('[Claude Service] Dirty nodes:', dirtyNodeIds.length);
    console.log('[Claude Service] Dirty sentences:', dirtySentenceIds.length);

    // Check if root node is dirty
    const isRootDirty = dirtyNodeIds.includes('root');
    if (isRootDirty) {
        console.log('[Claude Service] Root node is dirty - will regenerate document title');
    }

    // Find the highest-level dirty nodes (roots of dirty subtrees)
    const dirtyRootNodes = findDirtyRootNodes(dirtyNodeIds, hierarchyMeta);

    console.log('[Claude Service] Dirty root nodes to restructure:', dirtyRootNodes.length);
    console.log('[Claude Service] Dirty root node IDs:', dirtyRootNodes.map(n => n.id).join(', '));

    // Build subtree information for each dirty root
    const dirtySubtrees = buildDirtySubtrees(dirtyRootNodes, hierarchyMeta, sentences, dirtySentenceIds);

    // Build the prompt
    const prompt = buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty);

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = message.content[0].text;
        console.log('[Claude Service] Received dirty subtree restructure:', responseText);

        // Parse and validate the response
        const { restructuredSubtrees, newRootTitle, newRootEmotion, newRootIntensity, newRootEmotions } = parseDirtyRestructureResponse(responseText, maxDepth, dirtySubtrees, isRootDirty);
        // Derive legacy fields if only profile was provided
        let resolvedRootEmotion = newRootEmotion;
        let resolvedRootIntensity = newRootIntensity;
        let resolvedRootEmotions = newRootEmotions;
        if (newRootEmotions && (newRootEmotion === undefined || newRootIntensity === undefined)) {
            const legacy = deriveLegacyFromProfile(newRootEmotions);
            resolvedRootEmotion = legacy.emotion;
            resolvedRootIntensity = legacy.intensity;
            resolvedRootEmotions = legacy.profile;
        }
        console.log('[TEST] ROOTPROPS:', { newRootTitle, newRootEmotion: resolvedRootEmotion, newRootIntensity: resolvedRootIntensity, newRootEmotions: resolvedRootEmotions });
        console.log('[Claude Service] Parsed response - subtrees:', restructuredSubtrees?.length, 'newRootTitle:', newRootTitle);

        return {
            dirtyRootNodes: dirtyRootNodes.map(n => n.id),
            restructuredSubtrees,
            newRootTitle,
            newRootEmotion: resolvedRootEmotion,
            newRootIntensity: resolvedRootIntensity,
            newRootEmotions: resolvedRootEmotions,
        };
    } catch (error) {
        console.error('[Claude Service] Error restructuring dirty nodes:', error);
        console.error('[Claude Service] Error stack:', error.stack);
        throw new Error(`Failed to restructure dirty nodes: ${error.message}`);
    }
}


export async function evaluateSentenceEmotions(sentences) {
    const client = getClient();

    console.log('[Claude Service] Evaluating emotions for sentences');
    const prompt = `For each input sentence, assign a 10-axis emotion profile using the Differential Emotions Scale (DES) by Izard (1997).

The DES measures these 10 fundamental, distinct emotions:
1. INTEREST (0-100): Curiosity, excitement, fascination, engagement with content
2. JOY (0-100): Happiness, delight, pleasure, enjoyment, contentment
3. SURPRISE (0-100): Amazement, astonishment, unexpectedness
4. SADNESS (0-100): Sorrow, melancholy, distress, downheartedness, grief
5. ANGER (0-100): Hostility, rage, frustration, irritation
6. DISGUST (0-100): Revulsion, repugnance, distaste, aversion
7. CONTEMPT (0-100): Scorn, disdain, disrespect, superiority
8. FEAR (0-100): Anxiety, worry, terror, nervousness, apprehension
9. SHAME (0-100): Embarrassment, humiliation, feeling exposed or inadequate
10. GUILT (0-100): Remorse, regret, self-blame, moral distress

Rate each emotion independently based on the sentence's content, tone, and implied emotional state.
Multiple emotions can be present simultaneously with varying intensities.

Return ONLY valid JSON: an array where each item is { "id": "<sentence-id>", "emotions": { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 } }.
- Use all ten DES emotion keys exactly: ${EMOTION_AXES.join(', ')}.
- Clamp every value to 0-100.
- Do not add extra fields or prose.

Sentences:\n${sentences.map(s => `- (${s.id}) ${s.content}`).join('\n')}`;

    console.log('[Claude Service] Emotion evaluation prompt constructed', prompt);
    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = message.content[0].text;
        console.log('[Claude Service] Received emotion evaluation:', responseText);

        // Parse the JSON response
        const emotionData = JSON.parse(responseText);
        console.log('[Claude Service] Parsed emotion data:', emotionData);

        return applyEmotionsToSentences(sentences, emotionData); // Array with emotion profiles
    } catch (error) {
        console.error('[Claude Service] Error evaluating sentence emotions:', error);
        console.error('[Claude Service] Error stack:', error.stack);
        throw new Error(`Failed to evaluate sentence emotions: ${error.message}`);
    }
}

export async function evaluateHierarchyNodeEmotions(sentences, hierarchyMeta, nodeIds) {
  const client = getClient();

  if (!hierarchyMeta?.nodes?.length || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    return { updatedHierarchyMeta: hierarchyMeta };
  }

  const nodesById = new Map(hierarchyMeta.nodes.map(n => [n.id, n]));
  const targets = nodeIds.map(id => nodesById.get(id)).filter(Boolean);

  if (targets.length === 0) {
    return { updatedHierarchyMeta: hierarchyMeta };
  }

  const nodeTextBlocks = targets.map((node) => {
    const descendantSentences = findSentencesInNode(node, hierarchyMeta, sentences);
    const text = descendantSentences.map(s => s.content).join(' ');
    return `- (${node.id}) TITLE: ${node.label}\n  TEXT: ${text}`;
  }).join('\n');

  const prompt = `For each input NODE, assign a 10-axis emotion profile using the Differential Emotions Scale (DES) by Izard (1997).

The DES measures these 10 fundamental, distinct emotions (0-100):
${EMOTION_AXES.map((a, i) => `${i + 1}. ${a.toUpperCase()}`).join('\n')}

Rate each emotion independently based on the node's title and the combined text of its descendant sentences.

Return ONLY valid JSON: an array where each item is { "id": "<node-id>", "emotions": { ${EMOTION_AXES.map(k => `"${k}": 0-100`).join(', ')} } }.
- Use all ten DES emotion keys exactly: ${EMOTION_AXES.join(', ')}.
- Clamp every value to 0-100.
- Do not add extra fields or prose.

Nodes:\n${nodeTextBlocks}`;

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].text;
    const emotionData = JSON.parse(responseText);

    const emotionMap = new Map();
    for (const item of emotionData) {
      const profile = normalizeEmotionProfile(
        item.emotions ?? profileFromLegacy(item.emotion, item.intensity)
      );
      emotionMap.set(item.id, profile);
    }

    const updatedNodes = hierarchyMeta.nodes.map((n) => {
      if (!emotionMap.has(n.id)) return n;
      const profile = emotionMap.get(n.id);
      const legacy = deriveLegacyFromProfile(profile);
      return {
        ...n,
        emotions: profile,
        emotion: legacy.emotion,
        intensity: legacy.intensity,
      };
    });

    return {
      updatedHierarchyMeta: {
        ...hierarchyMeta,
        nodes: updatedNodes,
      }
    };
  } catch (error) {
    console.error('[Claude Service] Error evaluating hierarchy node emotions:', error);
    throw new Error(`Failed to evaluate hierarchy node emotions: ${error.message}`);
  }
}


function applyEmotionsToSentences(sentences, emotionData) {
    const hierarchy = sentences._hierarchyMeta;
    const emotionMap = new Map();
    for (const item of emotionData) {
        const profile = normalizeEmotionProfile(
            item.emotions ?? profileFromLegacy(item.emotion, item.intensity)
        );
        emotionMap.set(item.id, profile);
    }

    const newSentences = sentences.map(s => {
        if (emotionMap.has(s.id)) {
            const profile = emotionMap.get(s.id);
            const legacy = deriveLegacyFromProfile(profile);
            return { ...s, emotions: profile, emotion: legacy.emotion, intensity: legacy.intensity };
        }
        return s;
    });
    newSentences._hierarchyMeta = hierarchy; // Preserve hierarchy meta
    return newSentences;
}

/**
 * Rewrite a sentence to match a specific emotion and intensity
 * @param {string} sentence - Original sentence to rewrite
 * @param {string} emotion - Target emotion (from EMOTIONS constant)
 * @param {number} intensity - Emotional intensity (0-99)
 * @returns {Promise<string>} Rewritten sentence
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

function formatProfileForPrompt(profile) {
    // Use a deterministic order for clarity in prompts
    const ordered = {};
    EMOTION_AXES.forEach((axis) => {
        ordered[axis] = profile[axis];
    });
    return JSON.stringify(ordered);
}

export async function rewriteSentenceWithEmotion(sentence, emotionProfileInput) {
    const client = getClient();

    const profile = coerceEmotionProfile(emotionProfileInput);
    const legacy = deriveLegacyFromProfile(profile);
    const profileText = describeEmotionProfile(profile);
    const profileJson = formatProfileForPrompt(profile);

    console.log(`[Claude Service] Rewriting sentence with profile: ${profileText}`);

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
    console.log('[Claude Service] Rewrite prompt constructed', prompt);
    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const rewrittenSentence = stripOuterQuotes(message.content[0].text.trim());
        console.log('[Claude Service] Sentence rewritten successfully', rewrittenSentence);

        return rewrittenSentence;
    } catch (error) {
        console.error('[Claude Service] Error rewriting sentence:', error);
        throw new Error(`Failed to rewrite sentence: ${error.message}`);
    }
}
function stripOuterQuotes(str) {
    return str.replace(/^(['"])(.*)\1$/, "$2");
}

/**
 * Rewrite a sentence and return multiple options
 * @param {string} sentence - Original sentence
 * @param {string} emotion - Target emotion
 * @param {number} intensity - Emotional intensity (0-99)
 * @param {number} numOptions - Number of options to return (default 3)
 * @returns {Promise<string[]>} Array of rewritten sentence options
 */
export async function rewriteSentenceWithEmotionOptions(sentence, emotionProfileInput, numOptions = 3) {
    const client = getClient();

    const profile = coerceEmotionProfile(emotionProfileInput);
    const legacy = deriveLegacyFromProfile(profile);
    const profileText = describeEmotionProfile(profile);
    const profileJson = formatProfileForPrompt(profile);

    console.log(`[Claude Service] Rewriting sentence with emotion profile (multi): ${profileText}, options: ${numOptions}`);

    const prompt = `Rewrite the sentence to match this 10-axis DES emotion profile (0-100 per axis): ${profileText}.
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

CRITICAL: You must ALWAYS provide exactly ${numOptions} rewritten versions, even if the original sentence is very short, simple, or lacks context. Do NOT ask for clarification. Do NOT refuse. Just rewrite it with the specified emotion.

Return exactly ${numOptions} options as a pure JSON array of strings (no commentary, no explanations, no apologies).
Hard constraints:
- NEVER INCREASE OR DECREASE THE LENGTH OF ANY SENTENCE. THIS IS THE MOST IMPORTANT HOLY ASSIGNMENT!!!! ONLY SWITCH ADJECTIVES; PROPOSITIONS ETC: FOR MORE SUITABLE SYNONYMS AND SLIGHT REPHRASING SO THAT IT BETTER FIT THE NEW PROFILE
- Try to avoid including the names of the respective emotions in the rewritten sentences whenever possible.
- Preserve the original meaning and information.
- Use ONLY tone/phrasing to reflect the emotion profile; do NOT add new information. BASICALLY just switch words, adjectives etc. to adjust the tone
- Even for simple sentences like "Test" or "Hello", provide variations that reflect the emotion.

Original sentence: "${sentence}"

Output format: ["rewritten version 1", "rewritten version 2", "rewritten version 3"]`;

    try {
        const message = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
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
                options = parsed.map(o => stripOuterQuotes(String(o).trim())).filter(Boolean);
            } else {
                options = [stripOuterQuotes(String(parsed).trim())];
            }
        } catch (e) {
            console.warn('[Claude Service] JSON parse failed for multi rewrite, falling back to heuristics');
            // Fallback: try to split by newlines or bullet points
            const candidates = raw
                .split(/\n+/)
                .map(l => l.replace(/^[-*\d)\.\s]+/, '').trim())
                .filter(Boolean);
            options = candidates.slice(0, numOptions).map(stripOuterQuotes);
            if (options.length === 0) {
                options = [stripOuterQuotes(raw)];
            }
        }

        // Ensure we return exactly numOptions by padding or trimming
        if (options.length < numOptions) {
            const last = options[options.length - 1] || sentence;
            while (options.length < numOptions) options.push(last);
        } else if (options.length > numOptions) {
            options = options.slice(0, numOptions);
        }

        console.log('[Claude Service] Multi rewrite options ready:', options);
        return options;
    } catch (error) {
        console.error('[Claude Service] Error rewriting sentence (multi):', error);
        throw new Error(`Failed to rewrite sentence (multi): ${error.message}`);
    }
}