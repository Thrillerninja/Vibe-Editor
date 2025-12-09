import Anthropic from '@anthropic-ai/sdk';
import { LEAF_NODE_LEVEL } from '../utils/constants';

const ALLOWED_EMOTIONS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'EMPHASIS', 'UNCERTAIN'];

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
   - Choose emotion for each node from: [POSITIVE, NEGATIVE, NEUTRAL, EMPHASIS, UNCERTAIN].

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

  return {
    id,
    level,
    type,
    label,
    content,
    emotion,
    children,
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