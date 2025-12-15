import Anthropic from '@anthropic-ai/sdk';
import { LEAF_NODE_LEVEL, EMOTIONS } from '../utils/constants';

// Allowed emotions come from shared constants; enforce uppercase tokens for Claude
const ALLOWED_EMOTIONS = Object.keys(EMOTIONS).map(k => k.toUpperCase());

function buildPrompt(sentences, layers) {
  return `
You will receive an array of sentences and must build a hierarchical tree according to the following rules:

INPUT SENTENCES:
${sentences.map((sentence, i) => `${i + 1}. ${sentence}`).join("\n")}

REQUESTED NUMBER OF LAYERS: ${layers}
REPO_LEAF_NODE_LEVEL: ${LEAF_NODE_LEVEL}

------------------ TREE CREATION RULES ------------------
0) OVERVIEW
    - Keep the sentence order in the tree at ALL COSTS.
    - Build a hierarchical tree with the specified number of layers.
    - Use semantic grouping to cluster related sentences under topic nodes.
    - The deepest layer (${LEAF_NODE_LEVEL}) MUST contain the original sentences as leaf nodes.
    - Every node MUST cintain the aggregated text of its children in the "content" attribute. Meaning you please concatenate all child contents for parent nodes.

1) SENTENCES → LEAF NODES
   - Every sentence from the input array MUST become exactly one leaf node.
   - Each leaf node MUST include these attributes:
     id, level, type, label, content, emotion, children.
   - Leaf nodes must use level = ${LEAF_NODE_LEVEL}.

   Leaf node example:
   {
     "id": 1,
     "level": ${LEAF_NODE_LEVEL},
     "type": "leaf",
     "label": "Short label",
     "content": "Full sentence text here.",
     "emotion": "NEUTRAL",
     "children": []
   }

2) TOPIC NODES (regular internal nodes)
   - Group semantically related sentences into topic nodes.
   - Each topic node must include the same attributes (id, level, type, label, content, emotion, children).
   - Topic node children are the leaf nodes (or other topic nodes depending on depth).

3) ROOT NODE
   - Root must contain all top-level topic nodes as its children.
   - Root must be:
     {
       "id": "root",
       "level": 0,
       "type": "root",
       "label": "Document",
       "content": "",
       "emotion": "NEUTRAL",
       "children": [ ...topic nodes... ]
     }

4) ATTRIBUTE REQUIREMENTS
   - EVERY node must have: id, level, type, label, content, emotion, children.
   - Node ids should be integers (unique), but your response will be re-mapped to "s-<n>" ids by the client.
  - Choose emotion for each node from: [${ALLOWED_EMOTIONS.join(', ')}].

5) TREE DEPTH
   - The number of layers requested (${layers}) determines the depth.
    level = 0 → root
    level = 1 → topic nodes
    level = ${LEAF_NODE_LEVEL} → leaf nodes

6) OUTPUT FORMAT
   - Output a SINGLE JSON object representing the ROOT node.
   - Do NOT output any explanation or extra text. Only valid JSON.

------------------ BEGIN OUTPUT NOW ------------------
`;
}

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

function extractFirstJson(text) {
  console.log('[ClaudeALTERNATIVE Service] Extracting JSON from response text...', text);
  if (!text || typeof text !== 'string') throw new Error('No text to parse');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in model response');
  const jsonText = text.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    // Try to be a bit more permissive: remove trailing commas
    const cleaned = jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    return JSON.parse(cleaned);
  }
}

// Build a prompt to restructure a subtree while preserving ids and levels
function buildRestructurePrompt(subtreeRoot) {
  const inputJson = JSON.stringify(subtreeRoot, null, 2);
  return `
You will receive a JSON object representing the ROOT of a subtree. Your job is to RESTRUCTURE the subtree while strictly preserving these constraints:

HARD CONSTRAINTS (do not violate):
1) Preserve every node's id EXACTLY as provided.
2) Preserve every node's level EXACTLY as provided.
3) Preserve the exact set of nodes (no new nodes, no missing nodes).
4) Preserve leaf node contents EXACTLY (content strings must be unchanged).
5) Do not change any string in the 'content' fields for ANY node.
6) Return a SINGLE JSON object representing the NEW subtree rooted at the same root id.

Things you should change if necessary:
  - Choose emotion for each node from: [${ALLOWED_EMOTIONS.join(', ')}].
  - Restructure the tree to improve semantic grouping and hierarchy, while respecting the constraints above.
  - You MAY update 'label' fields to better summarize, but DO NOT change any 'content' values.


ADDITIONAL REQUIREMENTS:
- Ensure the result is a valid tree (no cycles) and levels are consistent with parent/child relations.
- Children arrays must only contain valid nodes at level = parent.level + 1 (except leaves at the fixed leaf level ${LEAF_NODE_LEVEL}).
- The root of the returned subtree MUST have the same id and level as the input root.

INPUT SUBTREE (JSON):
${inputJson}

OUTPUT FORMAT:
- Output ONLY a single JSON object representing the restructured subtree (no extra commentary).
`;
}

// Validate that the returned subtree preserves required invariants.
function validateRestructuredSubtree(originalRoot, newRoot) {
  const flatten = (node, acc = new Map()) => {
    if (!node) return acc;
    acc.set(node.id, { level: node.level, content: node.content, type: node.type });
    (node.children || []).forEach((ch) => flatten(ch, acc));
    return acc;
  };

  const origMap = flatten(originalRoot);
  const newMap = flatten(newRoot);

  // Same set of ids
  if (origMap.size !== newMap.size) return false;
  for (const id of origMap.keys()) {
    if (!newMap.has(id)) return false;
  }

  // Same level per id, and same content for all nodes (strict per prompt)
  for (const [id, o] of origMap.entries()) {
    const n = newMap.get(id);
    if (o.level !== n.level) return false;
    if ((o.content ?? '') !== (n.content ?? '')) return false;
  }

  // Root id/level must match
  if (!newRoot || newRoot.id !== originalRoot.id || newRoot.level !== originalRoot.level) return false;

  return true;
}

export async function restructureSubtreePreservingIds(subtreeRoot) {
  const client = getClient();
  const prompt = buildRestructurePrompt(subtreeRoot);
  console.log('[ClaudeALTERNATIVE Service] Restructuring subtree with prompt:', prompt);
  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message?.content?.[0]?.text ?? (message?.content ?? '');
    const parsed = extractFirstJson(responseText);

    // Basic structure normalization: ensure children arrays and preserve originalContent
    const normalize = (node, originalNode) => {
      if (!node) return node;
      const out = {
        ...node,
        children: Array.isArray(node.children) ? node.children.map((n, i) => normalize(n, originalNode?.children?.[i])) : [],
        // Preserve originalContent from original if it exists, otherwise initialize to current content
        originalContent: originalNode?.originalContent ?? node.content ?? ''
      };
      return out;
    };
    const normalized = normalize(parsed, subtreeRoot);

    if (!validateRestructuredSubtree(subtreeRoot, normalized)) {
      throw new Error('Invalid subtree returned: ids/levels/contents not preserved');
    }

    return normalized;
  } catch (err) {
    console.error('[ClaudeALTERNATIVE Service] restructureSubtreePreservingIds failed:', err);
    throw err;
  }
}

/**
 * sanitizeNode now assigns deterministic `s-<n>` ids for EVERY node
 * and removes `order`. IDs are generated with a simple counter kept in ctx.
 */
function sanitizeNode(node, ctx) {
  if (!node || typeof node !== 'object') return null;

  const id = `s-${ctx.nextId++}`;

  const level =
    typeof node.level === 'number'
      ? node.level
      : (node.children && node.children.length ? 1 : LEAF_NODE_LEVEL);

  const type =
    typeof node.type === 'string'
      ? node.type
      : (level === 0 ? 'root' : (level === LEAF_NODE_LEVEL ? 'leaf' : 'topic'));

  const label =
    node.label != null
      ? String(node.label)
      : (node.content ? String(node.content).slice(0, 60) : '');

  const baseContent = node.content != null ? String(node.content) : '';

  let emotion =
    typeof node.emotion === 'string'
      ? node.emotion.toUpperCase()
      : 'NEUTRAL';
  if (!ALLOWED_EMOTIONS.includes(emotion)) emotion = 'NEUTRAL';

  // ⭐ Sanitize children first
  const rawChildren = Array.isArray(node.children) ? node.children : [];
  const children = rawChildren.map((ch) => sanitizeNode(ch, ctx)).filter(Boolean);

  // ⭐ NEW: if children exist, create content = concatenation of children.content
  const content =
    children.length > 0
      ? children.map((c) => c.content).join(' ')
      : baseContent;

  const isModified = false;
  
  // Initialize originalContent to current content (will be synced at tree-to-text conversion)
  const originalContent = content;
  
  return {
    id,
    level,
    type,
    label,
    content,
    emotion,
    children,
    isModified,
    originalContent
  };
}


export async function buildTree(sentences, layers) {
  const client = getClient();
  const prompt = buildPrompt(sentences, layers);
  console.log('[ClaudeALTERNATIVE Service] Sentences:', sentences);
  console.log('[ClaudeALTERNATIVE Service] layers:', layers);
  console.log('[ClaudeALTERNATIVE Service] Built prompt:', prompt);

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message?.content?.[0]?.text ?? (message?.content ?? '');
    console.log('[ClaudeALTERNATIVE Service] raw response:', responseText);

    const parsed = extractFirstJson(responseText);

    // Use a counter context so every node receives a deterministic s-id
    const ctx = { nextId: 0 };
    const sanitized = sanitizeNode(parsed, ctx);

    if (!sanitized) {
      throw new Error('Parsed tree was invalid after sanitization');
    }

    return sanitized;

  } catch (error) {
    console.error('[ClaudeALTERNATIVE Service] buildTree failed:', error);
    throw error;
  }
}

export async function rewriteTextWithEmotion(text, emotion) {
  const client = getClient();
  const prompt = `
Rewrite the following text so that it strongly reflects the emotional tone "${emotion}".

Rules:
- Only return the rewritten text wihtoud leading/trailing " signs.
- Keep the meaning.
- Keep the original text length similar.
- Do NOT mention the emotion explicitly.
- Make the emotional tone clear through word choice and phrasing.

Text:
"${text}"
`;

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }]
  });
  const output = response?.content?.[0]?.text ?? "";
  return output.trim();
}