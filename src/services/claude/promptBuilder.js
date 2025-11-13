/**
 * Prompt Builder
 * Functions for constructing prompts to send to Claude
 * 
 * SYSTEM ARCHITECTURE:
 * - Sentences use UUIDs and have an 'order' property for position tracking
 * - Grouping nodes also use UUIDs
 * - Sentences are ALWAYS at level 1 (the leaves of the tree)
 * - Grouping nodes are at levels 2 to (maxDepth-1)
 * - Root is conceptually at level maxDepth but is just a title, not a node
 * - When a node at level N is dirty, we REPLACE it and everything under it
 * - Claude creates a COMPLETE hierarchy from level 2 up to level N
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Build a prompt for restructuring dirty subtrees
 * @param {Array} dirtySubtrees - Array of subtree information
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {boolean} isRootDirty - Whether the root node title needs regeneration
 * @returns {string} The constructed prompt
 */
export function buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty = false) {
  const maxGroupLevel = maxDepth - 1;

  // Extract all sentence IDs from subtrees to show in prompt
  const allSentenceIds = dirtySubtrees.flatMap(subtree =>
    subtree.sentences.map(s => s.id)
  );

  console.log(`[Claude Service] Input JSON: ${JSON.stringify(dirtySubtrees, null, 2)}`);

  return `You are a document organization assistant. Create a hierarchical structure for document sentences.

═══════════════════════════════════════════════════════════════════
HIERARCHY STRUCTURE
═══════════════════════════════════════════════════════════════════

The document has ${maxDepth} levels:
• Level 1: Sentences (always at the bottom)
• Levels 2-${maxGroupLevel}: Grouping nodes (you create these)
• Level ${maxDepth}: Root title (not a node, just a title)

Your job: Create grouping nodes at levels 2-${maxGroupLevel} to organize sentences by topic.

⚠️ CRITICAL: You MUST create ALL levels from 2 up to the topLevel specified in each subtree!
   - Missing levels = INVALID response
   - For example, if topLevel=4, you MUST create levels 2, 3, AND 4
   - See examples below for how to create multiple levels

═══════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════

1. **NEVER REORDER SENTENCES**
   - Sentences have an "order" property (0, 1, 2, 3...)
   - Keep them in this exact order
   - When reading the tree top-to-bottom, left-to-right, sentences must appear in order: 0, 1, 2, 3...

2. **GROUP CONSECUTIVE SENTENCES BY TOPIC**
   - If sentences 0-2 share a topic, create a group containing them
   - Groups can ONLY contain consecutive sentences
   - Example: Can group [0,1,2] or [3,4] but NOT [0,2,4]
   - If the same topic appears again later, create a separate group

3. **MAINTAIN GROUP ORDER**
   - List groups in document order
   - If group-A contains sentences 0-1 and group-B contains sentences 2-3
   - Then group-A must appear BEFORE group-B in the array

4. **CREATE ALL LEVELS**
   - For each subtree, create ALL levels from 2 up to topLevel
   - Level 2 groups sentences
   - Level 3 groups level 2 nodes
   - Continue until topLevel

5. **USE CORRECT IDs**
   - Generate NEW UUIDs for grouping nodes you create
   - Use EXACT sentence IDs from input (don't generate new ones)
   - Copy sentence IDs exactly when referencing them in childIds

**THESE ARE THE ONLY VALID SENTENCE IDs (copy these exactly):**
${allSentenceIds.map(id => `  - ${id}`).join('\n')}

Any other UUIDs in childIds at level 2 are WRONG.

═══════════════════════════════════════════════════════════════════
INPUT DATA
═══════════════════════════════════════════════════════════════════

${JSON.stringify(dirtySubtrees, null, 2)}

Each subtree contains:
- **rootNodeId**: ID of the node you're replacing
- **topLevel**: Highest level to create
- **sentences**: Array of sentences with id, order, content, isDirty

═══════════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════════

**Example 1: topLevel=2 (simplest case - only one grouping level)**

Given these input sentences:
[
  {"id": "a1b2c3d4-e5f6-7890-abcd-111111111111", "order": 0, "content": "Cats are popular pets."},
  {"id": "b2c3d4e5-f6a7-8901-bcde-222222222222", "order": 1, "content": "They require feeding."},
  {"id": "c3d4e5f6-a7b8-9012-cdef-333333333333", "order": 2, "content": "Dogs are loyal."},
  {"id": "d4e5f6a7-b8c9-0123-def1-444444444444", "order": 3, "content": "Dogs need exercise."}
]

Your response for topLevel=2:
[
  {
    "id": "f1a2b3c4-d5e6-7890-new1-000000000001",
    "level": 2,
    "title": "Cat Care",
    "childIds": ["a1b2c3d4-e5f6-7890-abcd-111111111111", "b2c3d4e5-f6a7-8901-bcde-222222222222"]
  },
  {
    "id": "f2a3b4c5-d6e7-8901-new2-000000000002",
    "level": 2,
    "title": "Dog Care",
    "childIds": ["c3d4e5f6-a7b8-9012-cdef-333333333333", "d4e5f6a7-b8c9-0123-def1-444444444444"]
  }
]

**Example 2: topLevel=4 (MUST create levels 2, 3, AND 4)**

Given these input sentences:
[
  {"id": "s1", "order": 0, "content": "Cats are popular pets."},
  {"id": "s2", "order": 1, "content": "They require feeding."},
  {"id": "s3", "order": 2, "content": "Dogs are loyal."},
  {"id": "s4", "order": 3, "content": "Dogs need exercise."},
  {"id": "s5", "order": 4, "content": "Fish are low-maintenance pets."},
  {"id": "s6", "order": 5, "content": "Birds can be trained."}
]

Your response for topLevel=4 MUST include ALL levels 2, 3, and 4:
[
  // Level 2: Direct sentence groups
  {"id": "n1", "level": 2, "title": "Cat Care", "childIds": ["s1", "s2"]},
  {"id": "n2", "level": 2, "title": "Dog Care", "childIds": ["s3", "s4"]},
  {"id": "n3", "level": 2, "title": "Other Pets", "childIds": ["s5", "s6"]},
  
  // Level 3: Group level 2 nodes by related topics
  {"id": "n4", "level": 3, "title": "Mammal Pets", "childIds": ["n1", "n2"]},
  {"id": "n5", "level": 3, "title": "Non-Mammal Pets", "childIds": ["n3"]},
  
  // Level 4: Top level grouping all level 3 nodes
  {"id": "n6", "level": 4, "title": "Pet Care Guide", "childIds": ["n4", "n5"]}
]

Notice in Example 2:
- ALL levels from 2 to 4 are created (no missing levels!)
- Level 2 nodes reference sentence IDs (s1, s2, etc.)
- Level 3 nodes reference level 2 node IDs (n1, n2, n3)
- Level 4 nodes reference level 3 node IDs (n4, n5)
- Every node at level N references ONLY nodes at level N-1

**Key takeaway**: 
- When topLevel=2, create ONLY level 2
- When topLevel=3, create levels 2 AND 3
- When topLevel=4, create levels 2, 3, AND 4
- When topLevel=5, create levels 2, 3, 4, AND 5
- And so on...

═══════════════════════════════════════════════════════════════════
⚠️ FINAL CHECKLIST BEFORE RESPONDING
═══════════════════════════════════════════════════════════════════

For EACH subtree in your response, verify:
✓ Created ALL levels from 2 to topLevel (check the topLevel field in input!)
✓ Level 2 nodes reference sentence IDs only
✓ Level N nodes (N>2) reference only level N-1 node IDs
✓ Used exact sentence IDs from input (no new UUIDs for sentences)
✓ Generated new UUIDs for all grouping nodes
✓ Sentences appear in order when reading tree left-to-right

${isRootDirty ? `
═══════════════════════════════════════════════════════════════════
ROOT TITLE
═══════════════════════════════════════════════════════════════════

Generate a concise document title (3-8 words) based on all content.
` : ''}
═══════════════════════════════════════════════════════════════════
⚠️ CRITICAL: DO NOT GENERATE NEW SENTENCE IDs
═══════════════════════════════════════════════════════════════════

When you reference sentences in childIds at level 2:
- COPY the exact "id" field from the input sentences array above
- DO NOT create new UUIDs for sentences
- DO NOT modify sentence IDs in any way
- The sentence IDs are listed in the INPUT DATA section above

VALID sentence IDs (copy exactly from above):
${allSentenceIds.map(id => `  ${id}`).join('\n')}

INVALID examples (DO NOT USE THESE):
  550e8400-e29b-41d4-a716-446655440000 ❌
  30c1d5f5-824e-41c8-b1fd-19c1e9805f2c ❌ (unless it's in the input above)
  Any UUID you generate yourself ❌

Only generate NEW UUIDs for the grouping nodes (id field), NOT for childIds at level 2.

═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════

Return valid JSON only (no markdown):

{${isRootDirty ? `
  "newRootTitle": "Document Title",` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "id-from-input",
      "newNodes": [
        // For topLevel=2, just level 2:
        {"id": "NEW-UUID", "level": 2, "title": "Topic", "childIds": ["exact-sentence-ids"]},
        
        // For topLevel=4, ALL levels 2, 3, and 4:
        {"id": "NEW-UUID-1", "level": 2, "title": "Subtopic A", "childIds": ["sentence-ids"]},
        {"id": "NEW-UUID-2", "level": 2, "title": "Subtopic B", "childIds": ["sentence-ids"]},
        {"id": "NEW-UUID-3", "level": 3, "title": "Topic", "childIds": ["NEW-UUID-1", "NEW-UUID-2"]},
        {"id": "NEW-UUID-4", "level": 4, "title": "Section", "childIds": ["NEW-UUID-3"]},
        ...
      ]
    }
  ]
}

Remember: Check each subtree's topLevel and create ALL levels from 2 to topLevel!`;
}
