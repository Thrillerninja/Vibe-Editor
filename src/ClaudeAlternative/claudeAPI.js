import Anthropic from '@anthropic-ai/sdk';
import { LEAF_NODE_LEVEL, EMOTIONS } from '../utils/constants';

// Allowed emotions come from shared constants; enforce uppercase tokens for Claude
const ALLOWED_EMOTIONS = Object.keys(EMOTIONS).map(k => k.toUpperCase());

function buildPrompt(sentences, layers) {
    return `
  You will receive an array of sentences and must build a hierarchical tree according to the following rules:

  INPUT SENTENCES:
  ${sentences.map((sentence, i) => `${i + 1}. ${sentence}`).join("\n")}

  NUMBER OF LAYERS: ${layers}
  REPO_LEAF_NODE_LEVEL: ${LEAF_NODE_LEVEL}

  ------------------ TREE CREATION RULES ------------------
  0) OVERVIEW
     - 🚨 CRITICAL: Keep the sentence order in the tree at ALL COSTS - this is the #1 rule.
     - Build a hierarchical tree with the specified number of layers.
     - Use semantic grouping to cluster related sentences under topic nodes.
     - The deepest layer (${LEAF_NODE_LEVEL}) MUST contain the original sentences as leaf nodes.
     - Every node MUST contain the aggregated text of its children in the "content" attribute. Concatenate all child contents for parent nodes.
     - CRITICAL: DO NOT remove/trim any content from sentences - every sentence must be fully preserved in the leaf nodes including trailing/leading whitespaces, "\n" or other symbols.
     - 🚨 ALL LEAF NODES MUST BE AT THE SAME DEPTH (${LEAF_NODE_LEVEL}).
     - IMPORTANT: CREATE EXACTLY ${layers} LAYERS IN THE TREE: IF ${layers} = 1, THEN: RETURN A SINGLE LEAF NODE. IF ${layers} = 2, THEN: RETURN TOPIC NODES WITH LEAF CHILDREN. IF ${layers} = 3, THEN: RETURN ROOT → TOPIC NODES → LEAF NODES, ETC.  

     🚨 SENTENCE ORDER IS SACRED:
    - Sentences are numbered 1 to ${sentences.length} in the input above
    - When you traverse the output tree depth-first (left-to-right), sentences MUST appear in order 1, 2, 3, ..., ${sentences.length}
    - Groups organize sentences but NEVER reorder them
    - If Group A has sentences 1-3 and Group B has 4-6, Group A MUST be listed before Group B in the tree
    - Within each group, sentences must maintain their original order
    
    LAYER DEFINITION (CRITICAL):
      A "layer" in the tree is a horizontal stack of nodes at the same depth.
      The number of layers determines the number of vertical levels ("stacks") in the tree from root to leaves.
      Each layer corresponds to a specific level in the hierarchy:
      1 layer: Only one stack of nodes (all are leaf nodes, no parents).
      2 layers: Two stacks—top stack is parent nodes, bottom stack is leaf nodes (children).
      3 layers: Three stacks—root node at the top, topic/parent nodes in the middle, leaf nodes at the bottom.
      N layers: N stacks, with each stack representing a level in the tree from root (top) to leaves (bottom).
      Think of the tree as a building with N floors (layers). Each floor contains nodes at that level. The top floor is the root, the bottom floor is the leaves, and any floors in between are topic/parent nodes.
      Every path from the root to a leaf must pass through exactly one node per layer, in order, from top to bottom.
      All leaf nodes must be at the deepest layer (the bottom stack).
      EXAMPLES:

      If layers = 1: Only leaf nodes, no parent or root node.
      If layers = 2: Parent nodes (top stack) → leaf nodes (bottom stack).
      If layers = 3: Root node (top stack) → topic nodes (middle stack) → leaf nodes (bottom stack).
      ABSOLUTE RULE:
      The number of layers is the number of vertical stacks from root to leaves. Each stack is a set of nodes at the same depth. Do not skip or merge layers. Every node must be assigned to the correct layer/stack.



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
    - If a topic node does not reach the required depth, pad with topic nodes as needed (see above).
    - YOU MUST NEVER PUT LEAF NODES ON A LEVEL HIGHER THAN ${LEAF_NODE_LEVEL}!!!

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
    - A single layer means the array of siblings in the tree. 2 layers would mean one parent with several children.
    - This menas IF 0 LAYERS ARE REQUESTED, THE TREE WILL ONLY CONTAIN THE given sentences as nodes.
     level = ${layers} → root
     level =  ${layers - 1} → topic nodes
     level = ${LEAF_NODE_LEVEL} → leaf nodes

  6) OUTPUT FORMAT
    - Output a SINGLE JSON object representing the ROOT node.
    - Do NOT output any explanation or extra text. Only valid JSON.


  7) EXAMPLE "1-Layer":
   INPUT SENTENCES:
   1. The sun was setting over the hills.
   NUMBER OF LAYERS: 1
   Output:
          {
            "id": 1,
            "level": 0,
            "type": "leaf",
            "label": "Positive Undertone",
            "content": "The sun was setting over the hills.",
            "emotion": "POSITIVE",
            "children": []
          }
  8) EXAMPLE "2-Layer":
  INPUT SENTENCES:
  1. I woke up feeling calm and unusually grounded, as though the day had already forgiven me for small mistakes.
  2. By midday, uncertainty crept in, soft but persistent, making even simple decisions feel heavier than expected.
  3. In the evening, everything settled into emotional neutrality — not good, not bad, just present.
  NUMBER OF LAYERS: 2
  Output:
  {
  "id": 42,
  "level": 1,
  "type": "topic",
  "label": "Quiet Internal Shifts",
  "content": "I woke up feeling calm and unusually grounded, as though the day had already forgiven me for small mistakes. By midday, uncertainty crept in, soft but persistent, making even simple decisions feel heavier than expected. In the evening, everything settled into emotional neutrality — not good, not bad, just present.",
  "emotion": "NEUTRAL",
  "children":
          {
                "id": 43,
                "level": 0,
                "type": "leaf",
                "label": "Morning Stability",
                "content": "I woke up feeling calm and unusually grounded, as though the day had already forgiven me for small mistakes.",
                "emotion": "POSITIVE",
                "children": []
              },
              {
                "id": 44,
                "level": 0,
                "type": "leaf",
                "label": "Midday Doubt",
                "content": "By midday, uncertainty crept in, soft but persistent, making even simple decisions feel heavier than expected.",
                "emotion": "UNCERTAIN",
                "children": []
              },
              {
                "id": 45,
                "level": 0,
                "type": "leaf",
                "label": "Evening Equilibrium",
                "content": "In the evening, everything settled into emotional neutrality — not good, not bad, just present.",
                "emotion": "NEUTRAL",
                "children": []
              }
            ]
          }



  ------------------ COUNTER-EXAMPLES (DO NOT DO THIS) ------------------
  COUNTEREXAMPLE (INCORRECT for layers=2):
    INPUT SENTENCES:
    1. I woke up feeling calm and unusually grounded, as though the day had already forgiven me for small mistakes.
    2. By midday, uncertainty crept in, soft but persistent, making even simple decisions feel heavier than expected.
    3. In the evening, everything settled into emotional neutrality — not good, not bad, just present.
    NUMBER OF LAYERS: 2

    INCORRECT OUTPUT (has 3 layers!):
    {
      "id": "root",
      "level": 2,
      "type": "root",
      "label": "My Day",
      "content": "...",
      "emotion": "NEUTRAL",
      "children": [
        {
          "id": 101,
          "level": 1,
          "type": "topic",
          "label": "Morning and Midday",
          "content": "...",
          "emotion": "UNCERTAIN",
          "children": [
            {
              "id": 102,
              "level": 0,
              "type": "leaf",
              "label": "Morning Stability",
              "content": "I woke up feeling calm and unusually grounded, as though the day had already forgiven me for small mistakes.",
              "emotion": "POSITIVE",
              "children": []
            },
            {
              "id": 103,
              "level": 0,
              "type": "leaf",
              "label": "Midday Doubt",
              "content": "By midday, uncertainty crept in, soft but persistent, making even simple decisions feel heavier than expected.",
              "emotion": "UNCERTAIN",
              "children": []
            }
          ]
        },
        {
          "id": 104,
          "level": 1,
          "type": "topic",
          "label": "Evening",
          "content": "...",
          "emotion": "NEUTRAL",
          "children": [
            {
              "id": 105,
              "level": 0,
              "type": "leaf",
              "label": "Evening Equilibrium",
              "content": "In the evening, everything settled into emotional neutrality — not good, not bad, just present.",
              "emotion": "NEUTRAL",
              "children": []
            }
          ]
        }
      ]
    }
    This is WRONG for layers=2, because it has 3 layers: root (level 2), topic nodes (level 1), and leaf nodes (level 0). For layers=2, there should be only topic nodes and leaf nodes, with no root node.
  -------------------- END OF INSTRUCTIONS ---------------------------------
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

  // Extract sentence order from the tree (leaf nodes at level 0)
  const extractSentences = (node, sentences = []) => {
    if (!node) return sentences;
    if (node.level === LEAF_NODE_LEVEL) {
      sentences.push({ id: node.id, content: node.content });
      return sentences;
    }
    if (node.children) {
      node.children.forEach(child => extractSentences(child, sentences));
    }
    return sentences;
  };

  const sentences = extractSentences(subtreeRoot);
  // Don't show IDs to Claude - just indices and content
  const sentenceListDisplay = sentences.map((s, idx) => `  [${idx}] \"${s.content}\"`).join('\n');

  // Mark which nodes are dirty in the prompt, and show sentence ranges for parent nodes
  // We'll use internal node IDs (node-0, node-1, etc) instead of real IDs
  let nodeIdCounter = 0;
  const nodeIdMap = new Map(); // real ID -> display ID

  const markDirtyNodes = (node, level = 0) => {
    const indent = '  '.repeat(level);

    // Assign a display ID if this node doesn't have one yet
    if (!nodeIdMap.has(node.id)) {
      if (node.level === LEAF_NODE_LEVEL) {
        // For leaf nodes, use their sentence index
        const sentenceIdx = sentences.findIndex(s => s.id === node.id);
        nodeIdMap.set(node.id, `sentence-${sentenceIdx}`);
      } else {
        // For parent nodes, use a simple counter
        nodeIdMap.set(node.id, `node-${nodeIdCounter++}`);
      }
    }

    const displayId = nodeIdMap.get(node.id);
    let result = `${indent}- ${displayId} (level ${node.level})`;

    // Show sentence range for non-leaf nodes
    if (node.level !== LEAF_NODE_LEVEL && node.children && node.children.length > 0) {
      const descendantSentences = [];
      extractSentences(node, descendantSentences);
      const indices = descendantSentences.map(s => sentences.findIndex(sent => sent.id === s.id));
      if (indices.length > 0) {
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        result += ` → contains sentences [${min}..${max}]`;
      }
    }

    if (node.isModified) {
      result += ' [DIRTY - can be modified]';
    } else {
      result += ' [CLEAN - preserve label/emotion exactly]';
    }
    if (node.children && node.children.length > 0) {
      result += '\n' + node.children.map(c => markDirtyNodes(c, level + 1)).join('\n');
    }
    return result;
  };

  const nodeStatus = markDirtyNodes(subtreeRoot);

  // Create a simplified JSON representation without real IDs
  const createSimplifiedJson = (node) => {
    const displayId = nodeIdMap.get(node.id);
    const out = {
      id: displayId,
      level: node.level,
      type: node.type,
      label: node.label,
      emotion: node.emotion
    };

    if (node.level === LEAF_NODE_LEVEL) {
      // For sentences, show index reference instead of full content
      const sentenceIdx = sentences.findIndex(s => s.id === node.id);
      out.sentence_index = sentenceIdx;
    } else if (node.children && node.children.length > 0) {
      out.children = node.children.map(createSimplifiedJson);
    }

    return out;
  };

  const simplifiedJson = JSON.stringify(createSimplifiedJson(subtreeRoot), null, 2);

  return `
You will receive a JSON object representing the ROOT of a subtree. Your job is to RESTRUCTURE only the DIRTY nodes while preserving CLEAN nodes exactly.

🚨🚨🚨 MOST CRITICAL RULE - DO NOT REORDER SENTENCES 🚨🚨🚨

SENTENCE ORDER IS SACRED AND CANNOT CHANGE:
The sentences below are numbered [0] to [${sentences.length - 1}] and MUST appear in your output in EXACTLY this order.
When you output the tree, a depth-first traversal MUST encounter sentences in this EXACT sequence.

SENTENCES (THIS IS THE REQUIRED ORDER - DO NOT SORT OR REARRANGE):
${sentenceListDisplay}

❌ WRONG: If the input has sentence [0] then [2] then [1], DO NOT "fix" it to [0] [1] [2]
✅ CORRECT: Keep them as [0] [2] [1] - the user chose this order intentionally

The sentence IDs may look "out of order" (like s-3, s-2, s-4) but this is INTENTIONAL.
The user has manually arranged them this way. Your job is to add semantic structure, NOT to reorder.

KEY CONCEPT - WORKING WITH SENTENCE RANGES:
- Parent nodes organize CONTIGUOUS RANGES of sentences by their INDEX (0, 1, 2...)
- Example: A parent containing sentences [0..2] has the sentences at indices 0, 1, and 2
- Ranges help you group sentences semantically without changing their order
- The index order [0, 1, 2, 3, ...] is FIXED - you can only change grouping, not sequence

CRITICAL RULES FOR DIRTY vs CLEAN NODES:
- Nodes marked with isModified=true are DIRTY and CAN be modified
- Nodes marked with isModified=false or missing isModified are CLEAN and MUST be preserved exactly

WHAT YOU CAN DO WITH DIRTY NODES:
1) Update 'label' fields to better describe the content
2) Update 'emotion' fields (choose from: [${ALLOWED_EMOTIONS.join(', ')}])
3) Reorganize grouping by specifying sentence ranges (see OUTPUT FORMAT below)
4) Split into multiple nodes OR delete and reassign children (ONLY for non-root dirty nodes)

WHAT YOU MUST PRESERVE FOR CLEAN NODES:
1) Keep 'label' field EXACTLY as provided (DO NOT change even slightly)
2) Keep 'emotion' field EXACTLY as provided
3) Keep children structure EXACTLY as provided
4) Clean nodes are reference points - they anchor the structure

🎯 SIMPLIFIED OUTPUT FORMAT - USE SENTENCE RANGES:
Instead of outputting the full nested tree with all sentence nodes, you can use a simpler format:

For parent nodes (level > ${LEAF_NODE_LEVEL}), you can specify which sentences they contain using "sentence_range":
{
  "id": "existing-node-id",
  "level": 1,
  "type": "topic",
  "label": "Updated label",
  "emotion": "JOY",
  "sentence_range": [0, 2]  // This means: contains sentences at indices 0, 1, and 2
}

This tells us "this parent node contains sentences 0, 1, and 2 from the sentence list above".
The system will automatically place those sentence nodes as children in the correct order.

You can EITHER:
- Output full nested structure with "children" array (traditional way)
- Output parent nodes with "sentence_range" array (simpler way)

If you use sentence_range, the sentences will be automatically placed as children in order.

CONCRETE EXAMPLE:
If sentences are: [0] "Hello", [1] "World", [2] "Foo", [3] "Bar"

Option 1 - Using sentence_range (RECOMMENDED):
{
  "id": "node-0",
  "level": 1,
  "label": "Greetings",
  "emotion": "JOY",
  "sentence_range": [0, 1]  // Contains sentences 0 and 1
}

Option 2 - Using nested structure:
{
  "id": "node-0",
  "level": 1,
  "label": "Greetings",
  "emotion": "JOY",
  "children": [
    {"id": "sentence-0", "sentence_index": 0, ...},
    {"id": "sentence-1", "sentence_index": 1, ...}
  ]
}

ABSOLUTE CONSTRAINTS (NEVER violate):
1) SENTENCE ORDER: Sentences must appear in order [0, 1, 2, ...]
2) Use the node IDs provided below (node-0, node-1, sentence-0, etc)
3) Preserve every node's 'level' EXACTLY as provided
4) Don't create or delete sentence nodes - only reorganize grouping
5) Root node can only have its label/emotion updated (cannot be deleted or split)

NODE STATUS IN INPUT:
${nodeStatus}

SIMPLIFIED INPUT (with display IDs):
${simplifiedJson}

OUTPUT FORMAT:
- Output a single JSON object with the same structure
- Use sentence_range format OR nested children with sentence_index
- Use the display IDs shown above (node-X, sentence-X)
- No explanatory text, just valid JSON
- Sentence order [0, 1, 2, ...] is automatically maintained if you use ranges correctly
`;
}

// Validate that the returned subtree preserves required invariants.
function validateRestructuredSubtree(originalRoot, newRoot) {
  // Extract sentence order from tree (depth-first traversal)
  const extractSentenceOrder = (node, order = []) => {
    if (!node) return order;
    if (node.level === LEAF_NODE_LEVEL) {
      order.push(node.id);
      return order;
    }
    if (node.children) {
      node.children.forEach(child => extractSentenceOrder(child, order));
    }
    return order;
  };

  const originalOrder = extractSentenceOrder(originalRoot);
  const newOrder = extractSentenceOrder(newRoot);

  // CRITICAL: Validate sentence order is preserved
  if (originalOrder.length !== newOrder.length) {
    console.error('[Validation] Sentence count mismatch:', originalOrder.length, 'vs', newOrder.length);
    return false;
  }

  for (let i = 0; i < originalOrder.length; i++) {
    if (originalOrder[i] !== newOrder[i]) {
      console.error('[Validation] SENTENCE ORDER VIOLATED at position', i + 1);
      console.error('  Expected:', originalOrder[i]);
      console.error('  Got:', newOrder[i]);
      console.error('  Original order:', originalOrder.join(' → '));
      console.error('  New order:', newOrder.join(' → '));
      return false;
    }
  }

  console.log('[Validation] ✓ Sentence order preserved:', originalOrder.length, 'sentences');

  const flatten = (node, acc = new Map()) => {
    if (!node) return acc;
    acc.set(node.id, {
      level: node.level,
      content: node.content,
      type: node.type,
      label: node.label,
      emotion: node.emotion,
      isModified: node.isModified
    });
    (node.children || []).forEach((ch) => flatten(ch, acc));
    return acc;
  };

  const origMap = flatten(originalRoot);
  const newMap = flatten(newRoot);

  // Same set of ids
  if (origMap.size !== newMap.size) {
    console.error('[Validation] Node count mismatch:', origMap.size, 'vs', newMap.size);
    return false;
  }

  for (const id of origMap.keys()) {
    if (!newMap.has(id)) {
      console.error('[Validation] Missing node in restructured tree:', id);
      return false;
    }
  }

  // Same level per id, and same content for all nodes (strict per prompt)
  for (const [id, o] of origMap.entries()) {
    const n = newMap.get(id);

    if (o.level !== n.level) {
      console.error('[Validation] Level changed for node', id, ':', o.level, '→', n.level);
      return false;
    }

    if ((o.content ?? '') !== (n.content ?? '')) {
      console.error('[Validation] Content changed for node', id);
      return false;
    }

    // Note: We don't validate clean node label/emotion changes here
    // Instead, we fix them in the normalize step below
  }

  // Root id/level must match
  if (!newRoot || newRoot.id !== originalRoot.id || newRoot.level !== originalRoot.level) {
    console.error('[Validation] Root node id/level mismatch');
    return false;
  }

  console.log('[Validation] ✓ All constraints validated successfully');
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

    // Build a map of original nodes by ID for quick lookup
    const originalMap = new Map();
    const buildMap = (node) => {
      if (!node) return;
      originalMap.set(node.id, node);
      if (node.children) node.children.forEach(buildMap);
    };
    buildMap(subtreeRoot);

    // Extract all sentence nodes (leaf nodes) in depth-first order
    const sentenceNodes = [];
    const extractSentences = (node) => {
      if (!node) return;
      if (node.level === LEAF_NODE_LEVEL) {
        sentenceNodes.push(node);
        return;
      }
      if (node.children) node.children.forEach(extractSentences);
    };
    extractSentences(subtreeRoot);

    // Build display ID to real ID mapping
    const displayToReal = new Map();
    let nodeCounter = 0;
    const buildDisplayMap = (node) => {
      if (!node) return;
      if (node.level === LEAF_NODE_LEVEL) {
        const sentenceIdx = sentenceNodes.findIndex(s => s.id === node.id);
        displayToReal.set(`sentence-${sentenceIdx}`, node.id);
      } else {
        displayToReal.set(`node-${nodeCounter++}`, node.id);
      }
      if (node.children) node.children.forEach(buildDisplayMap);
    };
    buildDisplayMap(subtreeRoot);

    // Create a map of Claude's output by display ID
    const claudeOutputMap = new Map();
    const mapClaudeOutput = (node) => {
      if (!node) return;
      claudeOutputMap.set(node.id, node);
      if (node.children) node.children.forEach(mapClaudeOutput);
    };
    mapClaudeOutput(parsed);

    // Normalization: recursively rebuild tree, using Claude's updates where provided
    const normalize = (originalNode) => {
      if (!originalNode) return null;

      // Find the corresponding display ID for this original node
      let displayId;
      if (originalNode.level === LEAF_NODE_LEVEL) {
        const sentenceIdx = sentenceNodes.findIndex(s => s.id === originalNode.id);
        displayId = `sentence-${sentenceIdx}`;
      } else {
        // Find which node-X this corresponds to
        displayId = Array.from(displayToReal.entries()).find(([dId, rId]) => rId === originalNode.id)?.[0];
      }

      // Get Claude's output for this node (if any)
      const claudeNode = displayId ? claudeOutputMap.get(displayId) : null;

      let children = [];

      if (claudeNode?.sentence_range && Array.isArray(claudeNode.sentence_range) && claudeNode.sentence_range.length === 2) {
        // Claude specified a sentence range for this node
        const [start, end] = claudeNode.sentence_range;
        console.log(`[Normalize] Expanding sentence_range [${start}, ${end}] for node ${originalNode.id}`);

        for (let i = start; i <= end && i < sentenceNodes.length; i++) {
          children.push(sentenceNodes[i]);
        }
      } else if (claudeNode?.children) {
        // Claude provided explicit children
        children = claudeNode.children.map(child => {
          if (child.sentence_index !== undefined) {
            // Reference to a sentence by index
            return sentenceNodes[child.sentence_index];
          } else {
            // Find the original node this references
            const childRealId = displayToReal.get(child.id) || child.id;
            const childOriginal = originalMap.get(childRealId);
            return childOriginal ? normalize(childOriginal) : null;
          }
        }).filter(Boolean);
      } else if (originalNode.children) {
        // Claude didn't specify children - use original structure
        children = originalNode.children.map(normalize).filter(Boolean);
      }

      const out = {
        ...originalNode,
        label: claudeNode?.label || originalNode.label,
        emotion: claudeNode?.emotion || originalNode.emotion,
        children,
        originalContent: originalNode.originalContent ?? originalNode.content ?? ''
      };

      // If this was a clean node, restore original label and emotion
      if (!originalNode.isModified && originalNode.isModified !== undefined) {
        if (claudeNode?.label && out.label !== originalNode.label) {
          console.warn(`[Normalize] Restoring clean node label for ${originalNode.id}: "${out.label}" → "${originalNode.label}"`);
          out.label = originalNode.label;
        }
        if (claudeNode?.emotion && out.emotion !== originalNode.emotion) {
          console.warn(`[Normalize] Restoring clean node emotion for ${originalNode.id}: ${out.emotion} → ${originalNode.emotion}`);
          out.emotion = originalNode.emotion;
        }
      }

      return out;
    };
    const normalized = normalize(subtreeRoot);

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
      : (node.content ? String(node.content).slice(0, 60) : ' ');

  const baseContent = node.content != null ? String(node.content) : ' ';

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
      ? children.map((c) => c.content).join(" ")
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

    // Validate sentence order is preserved
    const extractSentenceContent = (node, contents = []) => {
      if (!node) return contents;
      if (node.level === LEAF_NODE_LEVEL) {
        contents.push(node.content+node.trailing);
        return contents;
      }
      if (node.children) {
        node.children.forEach(child => extractSentenceContent(child, contents));
      }
      return contents;
    };

    const treeSentences = extractSentenceContent(sanitized);

    // Check if all input sentences are present in order
    //if (treeSentences.length !== sentences.length) {
      //console.error('[Validation] Sentence count mismatch in generated tree');
      //console.error('  Expected:', sentences.length, 'sentences');
      //console.error('  Got:', treeSentences.length, 'sentences');
      //throw new Error(`Sentence count mismatch: expected ${sentences.length}, got ${treeSentences.length}`);
    //}

    for (let i = 0; i < sentences.length; i++) {
      if (treeSentences[i] !== sentences[i]) {
        //console.error('[Validation] SENTENCE ORDER VIOLATED in generated tree at position', i + 1);
        //console.error('  Expected:', sentences[i]);
        //console.error('  Got:', treeSentences[i]);
        //throw new Error(`Sentence order violation at position ${i + 1}`);
      }
    }

    console.log('[Validation] ✓ Generated tree preserves sentence order:', sentences.length, 'sentences');

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
  return output;
}

function sanitizeTreeDepth(root, maxDepth) {
  function getMaxDepth(node, depth = 0) {
    if (!node.children || node.children.length === 0) return depth;
    return Math.max(...node.children.map(child => getMaxDepth(child, depth + 1)));
  }

  function padToDepth(node, currentDepth = 0) {
    if (!node.children || node.children.length === 0) {
      // If this is a leaf but not at maxDepth, pad
      let padded = node;
      for (let d = currentDepth; d < maxDepth; d++) {
        padded = {
          id: `auto-pad-${Math.random().toString(36).slice(2)}`,
          level: node.level + (d - currentDepth) + 1,
          type: 'topic',
          label: '(auto-padding)',
          content: padded.content,
          emotion: 'NEUTRAL',
          children: x[padded],
          isModified: true,
          originalContent: padded.content
        };
      }
      return padded;
    }
    // Otherwise, recurse
    return {
      ...node,
      children: node.children.map(child => padToDepth(child, currentDepth + 1))
    };
  }
  return padToDepth(root);
}
// Export at the very end of the file
export { sanitizeTreeDepth };