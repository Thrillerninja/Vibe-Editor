/**
 * @fileoverview AI operations using lightweight projections
 * 
 * UPDATED: Uses aiPrompt projections to reduce token usage
 * 
 * All operations:
 * - Send minimal data to Claude
 * - Use type-safe projections
 * - Validate responses before applying
 */

import Anthropic from '@anthropic-ai/sdk';
import * as AiPrompt from '../../types/aiPrompt.js';
import * as NodeOps from '../../utils/nodeOperations.js';
import * as DirtyTracking from '../../utils/dirtyTracking.js';
import { EMOTION_AXES } from '../../types/node.js';

/**
 * Initialize Claude client
 */
function getClient() {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error(
      'Claude API key not configured. Set VITE_CLAUDE_API_KEY in .env'
    );
  }

  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

// ==================== ORDERING OPERATIONS ====================

/**
 * Reorder nodes based on criteria
 * Token cost: ~500-1000 tokens for 100 nodes
 * 
 * @param {import('../../types/node.js').Node[]} nodes
 * @param {string} criteria - How to reorder (e.g., "chronological", "importance")
 * @returns {Promise<{ok: boolean, data?: any, error?: Error}>}
 */
export async function reorderNodesByCriteria(nodes, criteria) {
  const client = getClient();

  // Project to minimal representation
  const minimal = AiPrompt.projectArrayForOrdering(nodes);

  const prompt = `Reorder these text nodes by: ${criteria}

Current order:
${AiPrompt.formatNodesForPrompt(minimal)}

Return ONLY valid JSON array:
[
  {"nodeId": "id-1", "newIndex": 0},
  {"nodeId": "id-2", "newIndex": 1}
]

Rules:
- Each nodeId appears exactly once
- Indices are 0 to ${minimal.length - 1}
- No extra fields or text`;

  try {
    console.log(`[Claude] Reordering ${nodes.length} nodes by: ${criteria}`);

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const ordering = JSON.parse(responseText);

    // Validate
    const validation = NodeOps.validateOrdering(nodes, ordering);
    if (!validation.valid) {
      return {
        ok: false,
        error: new Error(`Invalid ordering: ${validation.errors.join(', ')}`),
      };
    }

    console.log(`[Claude] ✓ Reordering complete`);
    return { ok: true, data: ordering };
  } catch (error) {
    console.error('[Claude] Reordering failed:', error);
    return { ok: false, error };
  }
}

// ==================== EMOTION OPERATIONS ====================

/**
 * Analyze and assign emotions to nodes
 * Token cost: ~1000-2000 tokens for 100 nodes
 * 
 * @param {import('../../types/node.js').Node[]} nodes
 * @param {boolean} [preserveExisting=true] - Keep current emotions?
 * @returns {Promise<{ok: boolean, data?: any, error?: Error}>}
 */
export async function analyzeEmotions(nodes, preserveExisting = true) {
  const client = getClient();

  const minimal = AiPrompt.projectArrayForEmotion(nodes);

  const prompt = `Analyze emotional tone using DES (Differential Emotions Scale).

Emotions to rate (0-100 each):
${EMOTION_AXES.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Texts to analyze:
${minimal
  .map(n => {
    let line = `[${n.id.substring(0, 8)}] ${n.content}`;
    if (preserveExisting && n.currentEmotion) {
      const active = EMOTION_AXES.filter(a => n.currentEmotion[a] > 10)
        .map(a => \`\${a}:\${n.currentEmotion[a]}\`)
        .join(', ');
      if (active) line += \` (current: \${active})\`;
    }
    return line;
  })
  .join('\n')}

Return ONLY valid JSON:
[
  {
    "nodeId": "...",
    "emotions": {
      "interest": 0-100,
      "joy": 0-100,
      "surprise": 0-100,
      "sadness": 0-100,
      "anger": 0-100,
      "disgust": 0-100,
      "contempt": 0-100,
      "fear": 0-100,
      "shame": 0-100,
      "guilt": 0-100
    }
  }
]

Rules:
- All 10 emotions required
- Clamp to 0-100
- Multiple emotions can be present
- No extra fields`;

  try {
    console.log(`[Claude] Analyzing emotions for ${nodes.length} nodes`);

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const changes = JSON.parse(responseText);

    // Validate
    const validation = NodeOps.validateEmotionChanges(nodes, changes);
    if (!validation.valid) {
      return {
        ok: false,
        error: new Error(`Invalid emotions: ${validation.errors.join(', ')}`),
      };
    }

    console.log(`[Claude] ✓ Emotion analysis complete`);
    return { ok: true, data: changes };
  } catch (error) {
    console.error('[Claude] Emotion analysis failed:', error);
    return { ok: false, error };
  }
}

/**
 * Rewrite nodes to emphasize specific emotion
 * Token cost: ~2000-3000 tokens
 * 
 * @param {import('../../types/node.js').Node[]} nodes
 * @param {string} targetEmotion - Which emotion to emphasize
 * @param {number} intensity - How much (0-100)
 * @returns {Promise<{ok: boolean, data?: any, error?: Error}>}
 */
export async function rewriteForEmotion(nodes, targetEmotion, intensity) {
  const client = getClient();

  if (!EMOTION_AXES.includes(targetEmotion)) {
    return {
      ok: false,
      error: new Error(`Unknown emotion: ${targetEmotion}`),
    };
  }

  const minimal = nodes.map(n => ({
    id: n.id,
    content: n.content,
  }));

  const prompt = `Rewrite to emphasize ${targetEmotion} at ${intensity}% intensity.

Current texts:
${AiPrompt.formatNodesForPrompt(minimal)}

For each, return rewritten text and updated DES profile.

Return ONLY valid JSON:
[
  {
    "nodeId": "...",
    "newContent": "rewritten text",
    "emotions": {
      "interest": 0-100,
      ...all 10 emotions...
    }
  }
]

Rules:
- Keep original meaning and information
- Adjust tone and word choice only
- Don't add new information
- Preserve sentence structure where possible`;

  try {
    console.log(
      `[Claude] Rewriting ${nodes.length} nodes for ${targetEmotion}`
    );

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const changes = JSON.parse(responseText);

    console.log(`[Claude] ✓ Emotion rewrite complete`);
    return { ok: true, data: changes };
  } catch (error) {
    console.error('[Claude] Emotion rewrite failed:', error);
    return { ok: false, error };
  }
}

// ==================== HIERARCHY RESTRUCTURING ====================

/**
 * Restructure document hierarchy
 * Token cost: ~2000-4000 tokens
 * 
 * @param {import('../../types/node.js').Node[]} nodes
 * @param {number} targetDepth - Desired hierarchy depth (2-6)
 * @returns {Promise<{ok: boolean, data?: any, error?: Error}>}
 */
export async function restructureHierarchy(nodes, targetDepth) {
  const client = getClient();

  if (targetDepth < 2 || targetDepth > 6) {
    return {
      ok: false,
      error: new Error('Target depth must be 2-6'),
    };
  }

  const minimal = AiPrompt.projectArrayForHierarchy(nodes);
  const tree = AiPrompt.treeViewForPrompt(minimal, new Map(
    minimal.map(m => [m.id, m])
  ));

  const prompt = `Reorganize this content to hierarchy depth ${targetDepth}.

Current structure:
${tree}

For each node, determine:
1. What level should it be? (1=content, 2+=grouping)
2. What should be its parent node ID?

Return ONLY valid JSON:
[
  {"nodeId": "...", "parentId": "...", "level": 2}
]

Rules:
- Content nodes stay at level 1 (can't have children)
- Grouping nodes at level 2+
- Create intermediate levels as needed
- Each node except root has exactly one parent
- Root has parentId: null
- No cycles allowed`;

  try {
    console.log(`[Claude] Restructuring to depth ${targetDepth}`);

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const restructuring = JSON.parse(responseText);

    console.log(`[Claude] ✓ Hierarchy restructuring complete`);
    return { ok: true, data: restructuring };
  } catch (error) {
    console.error('[Claude] Hierarchy restructuring failed:', error);
    return { ok: false, error };
  }
}

export default {
  reorderNodesByCriteria,
  analyzeEmotions,
  rewriteForEmotion,
  restructureHierarchy,
};