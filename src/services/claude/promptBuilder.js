/**
 * Prompt Builder
 * Functions for constructing prompts to send to Claude
 * 
 * SYSTEM ARCHITECTURE:
 * - Sentences are ALWAYS at level 1 (the leaves of the tree)
 * - Grouping nodes are at levels 2 to (maxDepth-1)
 * - Root is conceptually at level maxDepth but is just a title, not a node
 * - When a node at level N is dirty, we REPLACE it and everything under it
 * - Claude creates a COMPLETE hierarchy from level 2 up to level N
 */

/**
 * Build a prompt for restructuring dirty subtrees
 * @param {Array} dirtySubtrees - Array of subtree information
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {boolean} isRootDirty - Whether the root node title needs regeneration
 * @returns {string} The constructed prompt
 */
export function buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty = false) {
  const maxGroupLevel = maxDepth - 1;

  return `You are a document organization assistant. Your task is to create a hierarchical structure for sets of sentences.

═══════════════════════════════════════════════════════════════════
HIERARCHY SYSTEM OVERVIEW
═══════════════════════════════════════════════════════════════════

The document has ${maxDepth} levels:
• Level 1: Sentences (always at the bottom - these are provided to you)
• Levels 2-${maxGroupLevel}: Grouping nodes (you create these)
• Level ${maxDepth}: Document root (just a title, not a node)

Your job: Create grouping nodes (levels 2-${maxGroupLevel}) to organize the sentences.

═══════════════════════════════════════════════════════════════════
GOLDEN RULES - NEVER VIOLATE THESE
═══════════════════════════════════════════════════════════════════

1. **PRESERVE SENTENCE ORDER**: Sentences come in document order. You CANNOT reorder them.
   - If given [sentence-0, sentence-1, sentence-2, sentence-3], they must stay in this exact order.
   - When you traverse the tree from top to bottom, left to right, you must encounter sentences in order: 0, 1, 2, 3.

2. **CONTIGUOUS GROUPING ONLY**: A group can ONLY contain consecutive sentences.
   - ✅ VALID: Group with [sentence-0, sentence-1, sentence-2] (consecutive)
   - ❌ INVALID: Group with [sentence-0, sentence-2, sentence-4] (skips 1 and 3)
   - If sentences 0-2 discuss topic A, sentence 3 discusses topic B, and sentence 4 discusses topic A again,
     you MUST create separate groups even if they're the same topic.

3. **GROUPS IN DOCUMENT ORDER**: Groups themselves must be ordered by their sentences.
   - **CRITICAL**: The order of nodes in the newNodes array matters!
   - If group-A contains sentence-0 and group-B contains sentence-5, group-A must appear BEFORE group-B in the array.
   - When you list nodes in the newNodes array, list them in the order their sentences appear in the document.
   - Example: If you have groups for sentences [0-1], [2], [3-4], [5-6]
     - ✅ CORRECT order: node-A[0-1], node-B[2], node-C[3-4], node-D[5-6]
     - ❌ WRONG order: node-A[0-1], node-D[5-6], node-B[2], node-C[3-4]

4. **INCLUDE ALL SENTENCES**: Every sentence must appear exactly once.
   - No duplicates, no omissions.

5. **COMPLETE HIERARCHY**: Create ALL levels from 2 up to topLevel.
   - If topLevel=5, create levels 2, 3, 4, AND 5.
   - Missing levels = invalid structure.

6. **PROPER NESTING**: A node at level N contains ONLY level N-1 children.
   - Level 2 nodes contain sentences (level 1)
   - Level 3 nodes contain level 2 nodes
   - Level 4 nodes contain level 3 nodes
   - And so on...

7. **MEANINGFUL GROUPING**: Group by topic, theme, or logical sections.
   - Create multiple groups at each level for better organization
   - Titles should describe what the group contains

═══════════════════════════════════════════════════════════════════
SUBTREES TO RESTRUCTURE
═══════════════════════════════════════════════════════════════════

${JSON.stringify(dirtySubtrees, null, 2)}

Each subtree has:
- **rootNodeId**: The ID of the old node you're replacing
- **topLevel**: The level of the top nodes you should create
- **sentences**: The sentences to organize (in document order)
- **suggestedStartNodeId**: Starting point for new node IDs

═══════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════

For EACH subtree:

1. **Read sentences in order**: Understand the flow and topics

2. **Identify contiguous groups**: Find consecutive sentences that share a topic
   - Example: If sentences are [A:cats, B:cats, C:dogs, D:dogs, E:cats]
   - You CANNOT group A, B, E together (even though all about cats)
   - You MUST create: Group1[A,B], Group2[C,D], Group3[E]
   - Sentence order must be preserved, so grouping is limited to consecutive sentences

3. **Create level 2 nodes**: One node for each contiguous topic group
   - Each node's childIds must be consecutive sentence IDs in document order
   - List nodes in document order (first node has earliest sentences)

4. **Create higher-level nodes**: If topLevel > 2, create levels 3, 4, etc.
   - Level 3 nodes group consecutive level 2 nodes
   - Level 4 nodes group consecutive level 3 nodes
   - Continue up to topLevel
   - Always maintain document order

5. **Verify completeness**: All levels from 2 to topLevel must exist

═══════════════════════════════════════════════════════════════════
EXAMPLE: maxDepth=${maxDepth}, topLevel=${maxGroupLevel}
═══════════════════════════════════════════════════════════════════

Input sentences (in document order):
- sentence-0: "Cats are popular pets."
- sentence-1: "They require regular feeding."
- sentence-2: "Dogs are loyal companions."
- sentence-3: "Dogs need daily exercise."
- sentence-4: "Both cats and dogs need veterinary care."

Analysis:
- Sentences 0-1: About cats (contiguous)
- Sentences 2-3: About dogs (contiguous)
- Sentence 4: About both (standalone)

Note: Even though sentence-0 and sentence-4 both mention cats, you CANNOT group them together
because sentence-4 comes after the dog sentences. Groups must be contiguous!

${maxGroupLevel === 2 ? `
Create level 2 groups only:
[
  {"id": "node-0", "level": 2, "title": "Cat Care", "childIds": ["sentence-0", "sentence-1"]},
  {"id": "node-1", "level": 2, "title": "Dog Care", "childIds": ["sentence-2", "sentence-3"]},
  {"id": "node-2", "level": 2, "title": "General Pet Health", "childIds": ["sentence-4"]}
]

Groups are in document order: 0-1, then 2-3, then 4.
Reading top-to-bottom gives sentences in order: 0, 1, 2, 3, 4 ✓
` : maxGroupLevel === 3 ? `
Create levels 2 AND 3:
[
  {"id": "node-0", "level": 2, "title": "Cat Care Basics", "childIds": ["sentence-0", "sentence-1"]},
  {"id": "node-1", "level": 2, "title": "Dog Care Basics", "childIds": ["sentence-2", "sentence-3"]},
  {"id": "node-2", "level": 2, "title": "General Pet Health", "childIds": ["sentence-4"]},
  {"id": "node-3", "level": 3, "title": "Pet Care Guide", "childIds": ["node-0", "node-1", "node-2"]}
]

Level 3 groups all level 2 nodes in document order.
Reading the hierarchy gives sentences in order: 0, 1, 2, 3, 4 ✓
` : `
Create ALL levels from 2 to ${maxGroupLevel}:
- Level 2: Group contiguous sentences by immediate topics
- Level 3: Group level-2 nodes by broader themes  
- Level 4+: Continue grouping by increasingly broad categories
- Level ${maxGroupLevel}: Top-level organization (this replaces the dirty node)

Remember: At every level, nodes must be ordered by their content's position in the document.
`}

═══════════════════════════════════════════════════════════════════
⚠️  CRITICAL: ARRAY ORDERING REQUIREMENT
═══════════════════════════════════════════════════════════════════

The ORDER of nodes in the newNodes array is CRITICAL!

Nodes must be listed in DOCUMENT ORDER based on their content:
- If node-A contains earlier sentences than node-B
- Then node-A must appear BEFORE node-B in the newNodes array

Example - CORRECT ordering:
[
  ${'{"id": "node-0", "childIds": ["sentence-0", "sentence-1"]},  ← First in array'}
  ${'{"id": "node-1", "childIds": ["sentence-2"]},                ← Second in array'}
  ${'{"id": "node-2", "childIds": ["sentence-3", "sentence-4"]},  ← Third in array'}
  ${'{"id": "node-3", "childIds": ["sentence-5"]}                 ← Last in array'}
]

Example - WRONG ordering:
[
  ${'{"id": "node-0", "childIds": ["sentence-0", "sentence-1"]},  ← First'}
  ${'{"id": "node-2", "childIds": ["sentence-3", "sentence-4"]},  ← Jumps to 3-4'}
  ${'{"id": "node-1", "childIds": ["sentence-2"]},                ← Goes back to 2 ❌ ERROR!'}
  ${'{"id": "node-3", "childIds": ["sentence-5"]}'}
]

Reading nodes top-to-bottom must give sentences in their original order!

═══════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════
IMPORTANT NOTES
═══════════════════════════════════════════════════════════════════

• Sentences with isDirty=true were recently edited - pay special attention
• Use suggestedStartNodeId for numbering (node-10, node-11, etc.)
• You can split one old group into multiple new groups
• You can merge multiple old groups into fewer new groups
• Just maintain sentence order and create all required levels

${isRootDirty ? `
═══════════════════════════════════════════════════════════════════
DOCUMENT TITLE
═══════════════════════════════════════════════════════════════════

The root node needs a new title. Based on ALL document content across all
subtrees, generate a concise, meaningful title (3-8 words) that captures the
main theme or topic of the entire document.
` : ''}
═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no explanations):

{${isRootDirty ? `
  "newRootTitle": "Concise Document Title",` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "the-id-from-input",
      "newNodes": [
        {"id": "node-X", "level": 2, "title": "Group Title", "childIds": ["sentence-0", ...]},
        {"id": "node-Y", "level": 3, "title": "Broader Theme", "childIds": ["node-X", ...]},
        ...
      ]
    }
  ]
}`;
}
