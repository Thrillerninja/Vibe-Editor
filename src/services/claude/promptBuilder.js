/**
 * Prompt Builder
 * Functions for constructing prompts to send to Claude
 */

/**
 * Build a prompt for restructuring dirty subtrees
 * @param {Array} dirtySubtrees - Array of subtree information
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {boolean} isRootDirty - Whether the root node title needs regeneration
 * @returns {string} The constructed prompt
 */
export function buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty = false) {
  const minGroupLevel = 2;
  const maxGroupLevel = maxDepth - 1;

  return `You are restructuring specific portions of a document hierarchy. Some sentences have been edited, and we need to reorganize the grouping nodes in those affected areas.

**CRITICAL HIERARCHY RULES:**
- Maximum Hierarchy Depth: ${maxDepth} levels total
- Level 1: ALWAYS sentences (the leaf nodes at the bottom) - NEVER CREATE LEVEL 1 NODES
- Levels ${minGroupLevel} to ${maxGroupLevel}: Grouping nodes that organize sentences
- Your job is to create grouping nodes at levels ${minGroupLevel} to ${maxGroupLevel} that organize the given sentences

**Subtrees to Restructure:**
${JSON.stringify(dirtySubtrees, null, 2)}

**Task:**
For each subtree above, you need to create the intermediate grouping structure:
1. The "rootLevel" tells you what level the parent node is at
2. The "sentences" array contains all the sentences (level 1 nodes) that need to be organized
3. You MUST create grouping nodes at ALL levels from level 2 up to (but not including) rootLevel
4. Pay special attention to sentences marked as isDirty: true - they've been edited
5. Create a logical, meaningful hierarchy using levels ${minGroupLevel} to ${maxGroupLevel}
6. Use the "suggestedStartNodeId" as a starting point for new node IDs (e.g., if it's 10, use node-10, node-11, etc.)
7. **CRITICAL**: Sentences are provided in a SPECIFIC ORDER that MUST be preserved - you can group them, but cannot change their sequence

**IMPORTANT CONSTRAINTS:**
- Sentences are ALWAYS level 1 - you are given sentence IDs like "sentence-1", "sentence-2", etc.
- **ALL SENTENCES MUST BE INCLUDED**: Every single sentence from the "sentences" array MUST appear exactly once in the final structure - you cannot skip, omit, or duplicate any sentence
- **SENTENCE ORDER IS FIXED**: The sentences are in document order and this order CANNOT be changed
- You can ONLY create grouping nodes - you cannot reorder, add, or remove sentences
- When listing childIds, maintain the original sentence order within each group
- **Groups must also appear in document order** - if group A contains earlier sentences than group B, group A must come first in the newNodes array
- You create grouping nodes at levels ${minGroupLevel} to ${maxGroupLevel}
- Each grouping node must have: id, level, title, childIds
- childIds can reference sentence IDs (level 1) or other node IDs
- A node at level N can ONLY contain children at level N-1
- Example for maxDepth=${maxDepth}:
  - Level ${maxGroupLevel} nodes contain level ${maxGroupLevel - 1} nodes (or sentences if ${maxGroupLevel} === 2)
  - Level 2 nodes ALWAYS contain level 1 nodes (sentences)

**Example Structure (maxDepth=${maxDepth}):**
${maxDepth === 3 ? `If rootLevel is 2, you create:
- Several level 2 nodes, each grouping related sentences by topic` :
      maxDepth === 4 ? `If rootLevel is 3, you MUST create BOTH:
- Level 2 nodes that group sentences
- Level 3 nodes that group the level 2 nodes
Example:
[
  {"id": "node-0", "level": 2, "title": "Topic A", "childIds": ["sentence-0", "sentence-1"]},
  {"id": "node-1", "level": 2, "title": "Topic B", "childIds": ["sentence-2", "sentence-3"]},
  {"id": "node-2", "level": 3, "title": "Main Theme 1", "childIds": ["node-0", "node-1"]}
]` :
        `If rootLevel is ${maxGroupLevel}, you MUST create ALL intermediate levels:
- Level 2 nodes that group sentences
- Level 3 nodes that group level 2 nodes
- Continue up to level ${maxGroupLevel} nodes`}
- Each level 2 node's childIds contains sentence IDs IN THEIR ORIGINAL ORDER like ["sentence-1", "sentence-2", "sentence-3"]
- If sentences 1, 2, 3 belong to topic A and sentences 4, 5 to topic B, you create two groups:
  - First group (topic A): childIds ["sentence-1", "sentence-2", "sentence-3"]
  - Second group (topic B): childIds ["sentence-4", "sentence-5"]
- **The groups themselves must appear in document order** - topic A group comes before topic B group in the newNodes array
- This maintains the complete sentence order: 1→2→3→4→5 across all groups

${isRootDirty ? `**Document Title Generation:**
The document root node is marked as dirty and needs a new title. Based on the complete document content, generate a concise, meaningful title that captures the main theme or topic of the entire document.
` : ''}
**Response Format (JSON only):**
{${isRootDirty ? `
  "newRootTitle": "A concise title for the entire document",` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "node-1",
      "newNodes": [
        {
          "id": "node-10",
          "level": 2,
          "title": "Topic-based grouping title",
          "childIds": ["sentence-1", "sentence-2"]
        },
        {
          "id": "node-11",
          "level": 2,
          "title": "Another topic grouping",
          "childIds": ["sentence-3", "sentence-4"]
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no additional text.`;
}
