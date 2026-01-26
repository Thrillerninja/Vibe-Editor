/**
 * @fileoverview Emotion Evaluation Module
 * 
 * Handles all emotion-related Claude API calls:
 * - Evaluating content emotions
 * - Evaluating hierarchy node emotions
 * - Evaluating document (root) emotions
 * 
 * Uses DES (Differential Emotions Scale) 10-axis model consistently.
 * 
 * @typedef {import('../types/node').Node} Node
 * @typedef {import('../types/node').EmotionProfile} EmotionProfile
 */

import Anthropic from '@anthropic-ai/sdk';
import { EMOTION_AXES } from '@utils/constants';
import { normalizeEmotionProfile } from '@utils/emotionProfiles';

/**
 * Get Anthropic client
 * @private
 * @returns {Anthropic}
 * @throws {Error} If API key not configured
 */
function getClient() {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error(
      'Claude API key not configured. Please set VITE_CLAUDE_API_KEY in your .env file.\n' +
      'Get your API key from https://console.anthropic.com/'
    );
  }
  
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * Build DES emotion evaluation prompt
 * @private
 * @returns {string}
 */
function getEmotionPromptHeader() {
  return `For each input, assign a 10-axis emotion profile using the Differential Emotions Scale (DES) by Izard (1997).

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

Rate each emotion independently based on the content's tone and implied emotional state.
Multiple emotions can be present simultaneously with varying intensities.`;
}

/**
 * Validate emotion response from Claude
 * @private
 * @param {any} emotionData - Parsed emotion object
 * @throws {Error} If validation fails
 * @returns {boolean}
 */
function validateEmotionData(emotionData) {
  if (!emotionData || typeof emotionData !== 'object') {
    throw new Error('Emotion data must be an object');
  }
  
  for (const axis of EMOTION_AXES) {
    if (!(axis in emotionData)) {
      throw new Error(`Missing emotion axis: ${axis}`);
    }
    
    const value = emotionData[axis];
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${axis} must be a number, got ${typeof value}`);
    }
    
    if (value < 0 || value > 100) {
      throw new Error(`${axis} = ${value} out of range 0-100`);
    }
  }
  
  return true;
}

/**
 * Evaluate emotions for individual content nodes (sentences, headings, etc.)
 * 
 * INPUT: Array of {id, content} objects
 * OUTPUT: Array of {id, emotions: EmotionProfile}
 * 
 * @param {Array<{id: string, content: string}>} sentences - Sentences to evaluate
 * @returns {Promise<Array<{id: string, emotions: EmotionProfile}>>}
 * @throws {Error} If Claude API fails or response is invalid
 * 
 * @example
 * const result = await evaluateSentenceEmotions([
 *   { id: 's1', content: 'Hello world!' },
 *   { id: 's2', content: 'Goodbye cruel world.' }
 * ]);
 * // Returns: [
 * //   { id: 's1', emotions: {interest: 50, joy: 70, ...all 10 axes...} },
 * //   { id: 's2', emotions: {interest: 30, sadness: 60, ...all 10 axes...} }
 * // ]
 */
export async function evaluateSentenceEmotions(sentences) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error('Sentences must be non-empty array');
  }
  
  const client = getClient();
  
  console.log(`[emotionEvaluator] Evaluating emotions for ${sentences.length} sentences`);
  
  const prompt = `${getEmotionPromptHeader()}

Return ONLY valid JSON. DO NOT wrap in markdown code fences (no \`\`\`json).
Start directly with opening bracket [ and end with closing bracket ].

Format: array where each item is { "id": "<sentence-id>", "emotions": { ${EMOTION_AXES.map(k => `"${k}": 0-100`).join(', ')} } }

Rules:
- Use all ten DES emotion keys exactly: ${EMOTION_AXES.join(', ')}
- Clamp every value to 0-100
- Do not add extra fields or prose

Sentences:
${sentences.map(s => `- (${s.id}) ${s.content}`).join('\n')}`;
  
  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const responseText = message.content[0].text;
    console.log(`[emotionEvaluator] Received response (${responseText.length} chars)`);
    
    // Parse JSON response
    let emotionData;
    try {
      emotionData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Failed to parse Claude response as JSON: ${parseError.message}`);
    }
    
    if (!Array.isArray(emotionData)) {
      throw new Error(`Expected array, got ${typeof emotionData}`);
    }
    
    // Validate and normalize each emotion entry
    const validated = [];
    for (const item of emotionData) {
      if (!item.id) {
        console.warn('[emotionEvaluator] Skipping entry without id');
        continue;
      }
      
      if (!item.emotions) {
        throw new Error(`Entry ${item.id} missing emotions`);
      }
      
      try {
        validateEmotionData(item.emotions);
      } catch (e) {
        throw new Error(`Entry ${item.id}: ${e.message}`);
      }
      
      // Normalize profile
      const normalized = normalizeEmotionProfile(item.emotions);
      
      validated.push({
        id: item.id,
        emotions: normalized
      });
    }
    
    console.log(`[emotionEvaluator] ✓ Evaluated ${validated.length} sentences`);
    return validated;
    
  } catch (error) {
    console.error('[emotionEvaluator] ✗ Evaluation failed:', error.message);
    throw new Error(`Failed to evaluate sentence emotions: ${error.message}`);
  }
}

/**
 * Evaluate emotions for hierarchy nodes
 * Considers both node title and descendant content
 * 
 * @param {Array<{id: string, label: string, childIds: string[]}>} hierarchyNodes - Nodes to evaluate
 * @param {Array<{id: string, content: string}>} sentences - All sentences for context
 * @returns {Promise<Array<{id: string, emotions: EmotionProfile}>>}
 * @throws {Error} If evaluation fails
 * 
 * @example
 * const nodeEmotions = await evaluateHierarchyNodeEmotions(
 *   [{ id: 'g1', label: 'Happy Chapter', childIds: ['s1', 's2'] }],
 *   [{ id: 's1', content: '...' }]
 * );
 */
export async function evaluateHierarchyNodeEmotions(hierarchyNodes, sentences) {
  if (!Array.isArray(hierarchyNodes) || hierarchyNodes.length === 0) {
    throw new Error('Hierarchy nodes must be non-empty array');
  }
  
  const client = getClient();
  const sentenceMap = new Map(sentences.map(s => [s.id, s]));
  
  console.log(`[emotionEvaluator] Evaluating emotions for ${hierarchyNodes.length} hierarchy nodes`);
  
  // Build text blocks for each node (label + descendant sentences)
  const nodeTextBlocks = hierarchyNodes.map(node => {
    // Get all descendant sentence content
    const descendantContent = (node.childIds || [])
      .map(id => sentenceMap.get(id)?.content || '')
      .filter(Boolean)
      .join(' ');
    
    const fullText = [node.label, descendantContent]
      .filter(Boolean)
      .join(': ');
    
    return `- (${node.id}) ${fullText.substring(0, 500)}`;
  }).join('\n');
  
  const prompt = `${getEmotionPromptHeader()}

Return ONLY valid JSON. DO NOT wrap in markdown code fences.
Start directly with opening bracket [ and end with closing bracket ].

Format: array where each item is { "id": "<node-id>", "emotions": { ${EMOTION_AXES.map(k => `"${k}": 0-100`).join(', ')} } }

Hierarchy Nodes:
${nodeTextBlocks}`;
  
  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const responseText = message.content[0].text;
    let emotionData = JSON.parse(responseText);
    
    if (!Array.isArray(emotionData)) {
      throw new Error(`Expected array, got ${typeof emotionData}`);
    }
    
    const validated = [];
    for (const item of emotionData) {
      if (!item.id) continue;
      
      if (!item.emotions) {
        throw new Error(`Node ${item.id} missing emotions`);
      }
      
      validateEmotionData(item.emotions);
      const normalized = normalizeEmotionProfile(item.emotions);
      
      validated.push({
        id: item.id,
        emotions: normalized
      });
    }
    
    console.log(`[emotionEvaluator] ✓ Evaluated ${validated.length} hierarchy nodes`);
    return validated;
    
  } catch (error) {
    console.error('[emotionEvaluator] ✗ Hierarchy node evaluation failed:', error.message);
    throw new Error(`Failed to evaluate hierarchy node emotions: ${error.message}`);
  }
}

/**
 * Evaluate emotions for entire document (root node)
 * Based on overall document content and themes
 * 
 * @param {string[]} allSentenceContent - All document sentences
 * @param {number} [maxChars=2000] - Max characters to include in evaluation
 * @returns {Promise<EmotionProfile>}
 * @throws {Error} If evaluation fails
 * 
 * @example
 * const rootEmotions = await evaluateDocumentEmotions(
 *   ['The story begins...', 'A happy ending.', '...'],
 *   2000
 * );
 */
export async function evaluateDocumentEmotions(allSentenceContent, maxChars = 2000) {
  if (!Array.isArray(allSentenceContent) || allSentenceContent.length === 0) {
    throw new Error('Must provide at least one sentence');
  }
  
  const client = getClient();
  
  console.log(`[emotionEvaluator] Evaluating root document emotions (${allSentenceContent.length} sentences)`);
  
  // Combine all content, up to maxChars
  let fullText = '';
  for (const sentence of allSentenceContent) {
    if (fullText.length >= maxChars) break;
    fullText += sentence + ' ';
  }
  fullText = fullText.trim();
  
  const prompt = `${getEmotionPromptHeader()}

Evaluate the OVERALL emotional tone of this entire document based on all its content.

Return ONLY valid JSON (no markdown code fences, no extra text).
Format: { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 }

Document (${allSentenceContent.length} sentences, ${fullText.length} chars):
"${fullText}"`;
  
  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const responseText = message.content[0].text;
    
    // Extract JSON more carefully
    let emotionData;
    try {
      // Try direct parse first
      emotionData = JSON.parse(responseText);
    } catch (e1) {
      // Try extracting JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      emotionData = JSON.parse(jsonMatch[0]);
    }
    
    validateEmotionData(emotionData);
    const normalized = normalizeEmotionProfile(emotionData);
    
    console.log(`[emotionEvaluator] ✓ Evaluated root document emotions`);
    return normalized;
    
  } catch (error) {
    console.error('[emotionEvaluator] ✗ Document emotion evaluation failed:', error.message);
    // Return default profile instead of throwing
    return createEmotionProfile();
  }
}

// Add this helper at the top of emotionEvaluator.js
function createEmotionProfile(overrides = {}) {
  const EMOTION_AXES = [
    'interest', 'joy', 'surprise', 'sadness', 'anger',
    'disgust', 'contempt', 'fear', 'shame', 'guilt'
  ];
  
  const profile = {};
  EMOTION_AXES.forEach(axis => {
    profile[axis] = overrides[axis] ?? 50;
  });
  
  return profile;
}

export default {
  evaluateSentenceEmotions,
  evaluateHierarchyNodeEmotions,
  evaluateDocumentEmotions,
};