/**
 * @fileoverview Topic Boundary Detection - Phase 1
 * 
 * Claude detects WHERE topics change (simpler than grouping).
 * System then converts boundaries to contiguous topic groups.
 * 
 * VALIDATED: Returns only valid boundary indices within range
 * 
 * @typedef {import('../types/node').Node} Node
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Get Anthropic client
 * @private
 */
function getClient() {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
  
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('Claude API key not configured');
  }
  
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

/**
 * Extract JSON from response (handles markdown code blocks)
 * @private
 * @param {string} text
 * @returns {string}
 * @throws {Error} If JSON cannot be extracted
 */
function extractJSON(responseText) {
  let jsonText = responseText.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```')) {
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonText = match[1];
    }
  }

  // Extract JSON object or array from text (in case Claude added prose)
  const jsonMatch = jsonText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  return jsonText.trim();
}

/**
 * Validate boundary detection result
 * 
 * Ensures:
 * - indices are within valid range [1, sentenceCount-1]
 * - indices are sorted ascending
 * - no duplicates
 * 
 * @param {{boundaryIndices: number[]}} result - Result to validate
 * @param {number} sentenceCount - Total number of sentences
 * @throws {Error} If validation fails
 * @returns {boolean}
 * 
 * @example
 * validateBoundaryResult({ boundaryIndices: [2, 5] }, 10);
 * // OK: boundaries at positions 2 and 5 are valid
 */
export function validateBoundaryResult(result, sentenceCount) {
  if (!result || !Array.isArray(result.boundaryIndices)) {
    throw new Error('Result must have boundaryIndices array');
  }

  const boundaries = result.boundaryIndices;

  // Check each boundary
  for (const idx of boundaries) {
    if (!Number.isInteger(idx)) {
      throw new Error(`Boundary index must be integer, got ${idx}`);
    }

    if (idx < 1 || idx >= sentenceCount) {
      throw new Error(
        `Boundary index ${idx} out of range [1, ${sentenceCount - 1}]`
      );
    }
  }

  // Check sorted
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) {
      throw new Error(
        `Boundaries not sorted: ${boundaries}. ` +
        `Expected: [${boundaries.sort((a, b) => a - b).join(', ')}]`
      );
    }
  }

  console.log(`[topicDetection] ✓ Validated ${boundaries.length} boundaries`);
  return true;
}

/**
 * Detect topic boundaries (where topics change)
 * 
 * INPUT: Sentences
 * OUTPUT: Indices where new topics begin
 * 
 * EXAMPLE:
 * - Sentences 0-1: "Dogs" topic
 * - Boundary at index 2
 * - Sentences 2-4: "Cats" topic
 * - Boundary at index 5
 * - Sentences 5-6: "Birds" topic
 * 
 * Returns: { boundaryIndices: [2, 5] }
 * 
 * @param {Array<{id: string, content: string}>} sentences - Sentences to analyze
 * @param {number} [targetGroupCount=3] - Desired number of topics
 * @returns {Promise<{boundaryIndices: number[]}>}
 * @throws {Error} On Claude failure (uses fallback, doesn't throw)
 * 
 * @example
 * const result = await detectTopicBoundaries(sentences, 3);
 * // Returns: { boundaryIndices: [2, 5, 8] }
 */
export async function detectTopicBoundaries(sentences, targetGroupCount = 3) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error('Sentences must be non-empty array');
  }

  if (sentences.length === 1) {
    console.log('[topicDetection] Single sentence - no boundaries');
    return { boundaryIndices: [] };
  }

  const client = getClient();

  console.log(
    `[topicDetection] Detecting boundaries (target: ${targetGroupCount} topics)`
  );

  const prompt = `You are analyzing a text with ${sentences.length} sentences. 
Identify where the topics change by finding boundary indices.

Each sentence:
${sentences.map((s, i) => `${i}: "${s.content?.substring(0, 80) || '(empty)'}"`)
    .join('\n')}

Your task: Find indices where a NEW topic STARTS (not ends).

Rules:
- Create approximately ${targetGroupCount} topics
- Each topic is a contiguous group of sentences
- Boundary indices are where new topics BEGIN
- Index 0 is first sentence - never include as boundary
- Index ${sentences.length} is past last sentence - never include as boundary
- Valid range: [1, ${sentences.length - 1}]
- Return SORTED in ascending order
- Return empty array if only 1 topic

Return ONLY valid JSON (no markdown code fences):
{ "boundaries": [2, 5, 8] }

Example:
- Sentences 0-1: "Dogs and cats"
- Boundary at index 2 (new topic starts)
- Sentences 2-4: "Pet care"
- Boundary at index 5 (new topic starts)
- Sentences 5-6: "Training tips"
Result: { "boundaries": [2, 5] }`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    if (!message.content[0] || message.content[0].type !== 'text') {
      throw new Error(
        `Unexpected response type: ${message.content[0]?.type || 'no content'}`
      );
    }

    const responseText = message.content[0].text;
    console.log('[topicDetection] Claude response:', responseText.substring(0, 200));

    // Extract and parse JSON
    const json = extractJSON(responseText);
    const result = JSON.parse(json);

    // Normalize response format (Claude might return 'boundaries' or 'boundaryIndices')
    const boundaries = result.boundaries || result.boundaryIndices || [];

    const normalizedResult = { boundaryIndices: boundaries };

    // Validate result
    validateBoundaryResult(normalizedResult, sentences.length);

    console.log('[topicDetection] ✓ Detected boundaries:', boundaries);
    return normalizedResult;

  } catch (error) {
    console.error('[topicDetection] ✗ Detection failed:', error.message);
    
    // Fallback: Create evenly-spaced boundaries
    console.log('[topicDetection] Using fallback: evenly-spaced boundaries');
    const fallbackBoundaries = [];
    const groupSize = Math.ceil(sentences.length / targetGroupCount);
    
    for (let i = groupSize; i < sentences.length; i += groupSize) {
      fallbackBoundaries.push(i);
    }

    console.log('[topicDetection] Fallback boundaries:', fallbackBoundaries);
    return { boundaryIndices: fallbackBoundaries };
  }
}

/**
 * Convert boundary indices to contiguous topic groups
 * 
 * EXAMPLE:
 * - Boundaries: [2, 5]
 * - Sentences: [s0, s1, s2, s3, s4, s5, s6]
 * 
 * OUTPUT:
 * - Topic 0: indices [0, 1] → sentences [s0, s1]
 * - Topic 1: indices [2, 3, 4] → sentences [s2, s3, s4]
 * - Topic 2: indices [5, 6] → sentences [s5, s6]
 * 
 * @param {number[]} boundaries - Indices where topics begin
 * @param {Array<{id: string, content: string}>} sentences - Original sentences
 * @returns {Array<{id: string, name: string, sentenceIndices: number[]}>}
 * 
 * @example
 * const topics = boundariesToTopics([2, 5], sentences);
 * // Returns:
 * // [
 * //   { id: 'topic-0', name: 'Topic 1', sentenceIndices: [0, 1] },
 * //   { id: 'topic-1', name: 'Topic 2', sentenceIndices: [2, 3, 4] },
 * //   { id: 'topic-2', name: 'Topic 3', sentenceIndices: [5, 6] }
 * // ]
 */
export function boundariesToTopics(boundaries, sentences) {
  const topics = [];
  let startIdx = 0;

  for (const boundaryIdx of boundaries) {
    const indices = Array.from(
      { length: boundaryIdx - startIdx },
      (_, i) => startIdx + i
    );

    topics.push({
      id: `topic-${topics.length}`,
      name: `Topic ${topics.length + 1}`,
      sentenceIndices: indices,
    });

    startIdx = boundaryIdx;
  }

  // Final group
  const finalIndices = Array.from(
    { length: sentences.length - startIdx },
    (_, i) => startIdx + i
  );

  topics.push({
    id: `topic-${topics.length}`,
    name: `Topic ${topics.length + 1}`,
    sentenceIndices: finalIndices,
  });

  console.log(
    `[topicDetection] ✓ Converted to ${topics.length} topics`
  );

  return topics;
}

export default {
  detectTopicBoundaries,
  boundariesToTopics,
  validateBoundaryResult,
};