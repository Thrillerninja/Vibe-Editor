/**
 * Topic Boundary Detection - Phase 1 of hierarchy generation
 * Claude identifies WHERE topics change (simpler than grouping)
 * This is fundamentally easier for Claude and guarantees contiguity
 */

import Anthropic from '@anthropic-ai/sdk';

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

function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error(`Expected string, got ${typeof text}`);
  }

  let json = text.trim();
  if (json.startsWith('```')) {
    const match = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      json = match[1];
    }
  }

  return json.trim();
}

/**
 * Detect topic BOUNDARIES (where topics change) - much simpler than grouping
 * Returns indices where boundaries occur
 * 
 * Example:
 * - Sentences 0-1: "Dogs" topic
 * - Boundary at index 2
 * - Sentences 2-4: "Cats" topic
 * - Boundary at index 5
 * - Sentences 5-6: "Birds" topic
 * 
 * This creates contiguous groups automatically!
 */
export async function detectTopicBoundaries(sentences, targetGroupCount = 3) {
  if (!Array.isArray(sentences)) {
    throw new Error(`sentences must be an array, got ${typeof sentences}`);
  }

  if (sentences.length === 0) {
    throw new Error('Cannot detect boundaries for empty sentence list');
  }

  if (sentences.length === 1) {
    // Single sentence = one group
    return { boundaryIndices: [] };
  }

  console.log(
    `[Claude Boundary Detection] Starting with ${sentences.length} sentences`
  );

  const client = getClient();

  // Much simpler prompt: just mark boundaries, not grouping
  const prompt = `You are analyzing a text with ${sentences.length} sentences. Identify where the topics change.

For each sentence, decide if a BOUNDARY (topic change) occurs AFTER it.

Sentences:
${sentences
  .map((s, i) => `${i}: "${s.content?.substring(0, 80) || '(empty)'}"`)
  .join('\n')}

Return ONLY valid JSON with boundary indices (where the next sentence starts a new topic):

{
  "boundaries": [2, 5, 8]
}

Rules:
- Boundaries are indices where a new topic STARTS (not ends)
- Create ${targetGroupCount} topics (approximately ${Math.ceil(sentences.length / targetGroupCount)} sentences each)
- Leave array empty if only 1 topic
- Never include 0 or ${sentences.length}
- Indices must be in ascending order: [2, 5, 8]
- Each boundary starts a NEW contiguous group`;

  try {
    console.log('[Claude Boundary Detection] Sending request...');

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
    console.log('[Claude Boundary Detection] Raw response:', responseText);

    let json;
    try {
      json = extractJSON(responseText);
    } catch (e) {
      console.error('[Claude Boundary Detection] JSON extraction failed:', e);
      throw e;
    }

    let result;
    try {
      result = JSON.parse(json);
    } catch (e) {
      console.error('[Claude Boundary Detection] JSON parse failed');
      console.error('[Claude Boundary Detection] Invalid JSON:', json);
      throw new Error(`Invalid JSON from Claude: ${e.message}`);
    }

    // Validate boundaries
    const boundaries = result.boundaries || [];
    if (!Array.isArray(boundaries)) {
      throw new Error(`"boundaries" must be an array, got ${typeof boundaries}`);
    }

    // Validate boundary indices
    for (const idx of boundaries) {
      if (!Number.isInteger(idx) || idx < 1 || idx >= sentences.length) {
        throw new Error(
          `Invalid boundary index ${idx} (must be 1-${sentences.length - 1})`
        );
      }
    }

    // Check sorted
    for (let i = 1; i < boundaries.length; i++) {
      if (boundaries[i] <= boundaries[i - 1]) {
        throw new Error(`Boundaries not sorted: ${boundaries}`);
      }
    }

    console.log(
      `[Claude Boundary Detection] ✓ Detected ${boundaries.length} boundaries`
    );
    return { boundaryIndices: boundaries };
  } catch (error) {
    console.error('[Claude Boundary Detection] ✗ Failed:', error.message);
    
    // Fallback: evenly spaced boundaries
    console.warn('[Claude Boundary Detection] Returning fallback boundaries');
    const fallbackBoundaries = [];
    const groupSize = Math.ceil(sentences.length / targetGroupCount);
    for (let i = groupSize; i < sentences.length; i += groupSize) {
      fallbackBoundaries.push(i);
    }

    return { boundaryIndices: fallbackBoundaries };
  }
}

/**
 * Convert boundary indices to topics
 * Boundaries [2, 5] creates groups: [0-1], [2-4], [5+]
 */
export function boundariesToTopics(boundaries, sentences) {
  const topics = [];
  let startIdx = 0;

  for (const boundaryIdx of boundaries) {
    topics.push({
      id: `topic-${topics.length}`,
      name: `Topic ${topics.length + 1}`,
      sentenceIndices: Array.from(
        { length: boundaryIdx - startIdx },
        (_, i) => startIdx + i
      ),
    });
    startIdx = boundaryIdx;
  }

  // Final group
  topics.push({
    id: `topic-${topics.length}`,
    name: `Topic ${topics.length + 1}`,
    sentenceIndices: Array.from(
      { length: sentences.length - startIdx },
      (_, i) => startIdx + i
    ),
  });

  return topics;
}

export default {
  detectTopicBoundaries,
  boundariesToTopics,
};