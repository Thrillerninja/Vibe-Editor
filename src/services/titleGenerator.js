/**
 * @fileoverview Generate descriptive titles for grouping nodes
 * 
 * Analyzes the actual content under each node and generates
 * 3-8 word descriptive titles via Claude.
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

/**
 * Collect all sentence content under a node (recursively)
 * @param {Object} node - The group node
 * @param {Array} allNodes - All nodes in the hierarchy
 * @param {Array} sentences - Original sentence data
 * @returns {string[]} Array of sentence contents
 */
function collectContentUnderNode(node, allNodes, sentences) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const sentenceIds = sentences.map(s => s.id);
  const content = [];

  function traverse(nodeId) {
    const n = nodeMap.get(nodeId);
    if (!n) return;

    for (const childId of n.childIds || []) {
      // If child is a sentence, collect it
      if (sentenceIds.includes(childId)) {
        const sentence = sentences.find(s => s.id === childId);
        if (sentence) {
          content.push(sentence.content);
        }
      } else {
        // If child is a node, recurse
        traverse(childId);
      }
    }
  }

  traverse(node.id);
  return content;
}

/**
 * Generate a single title for a node based on its content
 * @param {Object} node - Node to title
 * @param {Array} allNodes - All nodes
 * @param {Array} sentences - Sentences
 * @returns {Promise<string>} Generated title
 */
async function generateSingleTitle(node, allNodes, sentences) {
  const client = getClient();
  const content = collectContentUnderNode(node, allNodes, sentences);

  if (content.length === 0) {
    return `Group ${node.id.substring(0, 8)}`;
  }

  // Get dominant emotion if available
  const emotionContext = node.emotions
    ? Object.entries(node.emotions)
        .filter(([, v]) => v > 50)
        .map(([k]) => k)
        .join(', ')
    : 'neutral';

  const contentSample = content.join(' ').substring(0, 400);
  const sentenceCount = content.length;

  const prompt = `Generate a concise, specific title for a document section.

Section details:
- Number of sentences: ${sentenceCount}
- Dominant emotions: ${emotionContext}
- Content: "${contentSample}${contentSample.length < 400 ? '' : '...'}"

Requirements:
- Be specific to this section's actual content (not generic)
- 3-8 words
- Reflect the main theme or topic
- Use active voice when possible
- Examples: "Market Recovery and Economic Growth", "Authentication System Implementation", "Climate Crisis and Policy Solutions"

Return ONLY the title.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
    });

    return message.content[0].text.trim();
  } catch (error) {
    console.error(`Failed to generate title:`, error);
    return `Group (${sentenceCount} items)`;
  }
}

/**
 * Generate titles for all nodes in a hierarchy
 * Does them in parallel but with rate limiting
 * 
 * @param {Array} nodes - Hierarchy nodes
 * @param {Array} sentences - Original sentences
 * @returns {Promise<Map<string, string>>} Map of nodeId -> title
 */
export async function generateTitlesForAllNodes(nodes, sentences) {
  console.log(`[titleGenerator] Generating titles for ${nodes.length} nodes`);

  // Sort by level so parents are titled after children
  // (in case we want to use child titles to inform parent titles)
  const sortedNodes = [...nodes].sort((a, b) => a.level - b.level);

  const titleMap = new Map();
  const allNodes = nodes; // Keep full list for recursive traversal

  // Generate in batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < sortedNodes.length; i += batchSize) {
    const batch = sortedNodes.slice(i, i + batchSize);

    const titles = await Promise.all(
      batch.map(node => generateSingleTitle(node, allNodes, sentences))
    );

    batch.forEach((node, idx) => {
      titleMap.set(node.id, titles[idx]);
      console.log(`[titleGenerator] Generated: "${titles[idx]}" for level-${node.level} node`);
    });

    // Small delay between batches
    if (i + batchSize < sortedNodes.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return titleMap;
}

/**
 * Apply generated titles to nodes
 * @param {Array} nodes - Hierarchy nodes to update
 * @param {Map<string, string>} titleMap - nodeId -> title mapping
 * @returns {Array} Updated nodes with new titles
 */
export function applyTitlesToNodes(nodes, titleMap) {
  return nodes.map(node => {
    const title = titleMap.get(node.id);
    if (title && title !== node.title) {
      return {
        ...node,
        title,
      };
    }
    return node;
  });
}

export default {
  generateTitlesForAllNodes,
  applyTitlesToNodes,
  generateSingleTitle,
};