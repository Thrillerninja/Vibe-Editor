/**
 * Prompt Builder
 * Functions for constructing prompts to send to Claude
 *
 * SYSTEM ARCHITECTURE:
 * - Sentences use UUIDs and have an 'order' property for position tracking
 * - Grouping nodes also use UUIDs
 * - Sentences are ALWAYS at level 1 (the leaves of the tree)
 * - Grouping nodes are at levels 2 to (maxDepth)
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

3. **MAINTAIN ORDER IN ALL ARRAYS**
   - ⚠️ CRITICAL: Both restructuredSubtrees and newNodes arrays MUST be sorted by document order

   **Within each subtree:**
   - The newNodes array must be sorted by document order
   - Within each level, nodes must appear in the order their first sentence appears in the document
   - If group-A contains sentences 0-1 and group-B contains sentences 2-3
   - Then group-A must appear BEFORE group-B in the newNodes array

   **In the top-level response:**
   - The restructuredSubtrees array MUST also be sorted by document order
   - If subtree-X contains sentences 0-2 and subtree-Y contains sentences 3-5
   - Then subtree-X must appear BEFORE subtree-Y in the restructuredSubtrees array

   The system processes arrays in order to reconstruct text - wrong order = wrong text!

4. **CREATE ALL LEVELS**
   - For each subtree, create ALL levels from 2 up to topLevel
   - Level 2 groups sentences
   - Level 3 groups level 2 nodes
   - Continue until topLevel

5. **USE CORRECT IDS**
   - Generate NEW UUIDs for grouping nodes you create
   - Use EXACT sentence IDs from input (don't generate new ones)
   - Copy sentence IDs exactly when referencing them in childIds

6. **ADD EMOTION PROFILE (NEW - DES)**
  - For every node you create, you MUST include an **"emotions"** object with EXACTLY these ten DES keys (0-100 integers):
    { "interest": n, "joy": n, "surprise": n, "sadness": n, "anger": n, "disgust": n, "contempt": n, "fear": n, "shame": n, "guilt": n }
  - Values must be clamped to 0-100. Do NOT add extra keys.
  - The Differential Emotions Scale (DES) by Izard (1997) measures these fundamental emotions:
    * INTEREST: Curiosity, excitement, fascination, engagement with content
    * JOY: Happiness, delight, pleasure, contentment
    * SURPRISE: Being startled, amazed, or astonished
    * SADNESS: Unhappiness, sorrow, dejection, feeling downcast
    * ANGER: Rage, frustration, irritation, hostility
    * DISGUST: Revulsion, distaste, feeling repelled
    * CONTEMPT: Scorn, disdain, feeling something is beneath you
    * FEAR: Anxiety, worry, dread, being scared
    * SHAME: Embarrassment, humiliation, feeling exposed
    * GUILT: Remorse, regret, feeling responsible for wrongdoing
  - Each dimension is independent; text can have multiple simultaneous emotions at high intensities.
  - The profile should reflect the overall emotional tone of the node's scope (sentences for level 2, grouped topics for higher levels).
  - Legacy fields "emotion" and "intensity" are optional; if you include them, derive them from the dominant emotion of the profile.
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

**Example 1: topLevel=2 (simplest case - only one grouping level) with Emotion**

Given these input sentences:
[
  {"id": "a1b2c3d4-e5f6-7890-abcd-111111111111", "order": 0, "content": "Cats are popular pets. This is a joy."},
  {"id": "b2c3d4e5-f6a7-8901-bcde-222222222222", "order": 1, "content": "They require feeding, which is a mild inconvenience."},
  {"id": "c3d4e5f6-a7b8-9012-cdef-333333333333", "order": 2, "content": "Dogs are loyal and never leave your side."},
  {"id": "d4e5f6a7-b8c9-0123-def1-444444444444", "order": 3, "content": "Dogs need a lot of exercise, which can be exhausting."}
]

Your response for topLevel=2:
[
  {
    "id": "NEW-UUID-1",
    "level": 2,
    "title": "Positive Aspects of Cat Ownership",
    "emotions": { "interest": 50, "joy": 70, "surprise": 10, "sadness": 5, "anger": 0, "disgust": 0, "contempt": 0, "fear": 5, "shame": 0, "guilt": 0 },
    "childIds": ["a1b2c3d4-e5f6-7890-abcd-111111111111", "b2c3d4e5-f6a7-8901-bcde-222222222222"]
  },
  {
    "id": "NEW-UUID-2",
    "level": 2,
    "title": "Dog Loyalty and Effort",
    "emotions": { "interest": 40, "joy": 35, "surprise": 5, "sadness": 20, "anger": 10, "disgust": 0, "contempt": 5, "fear": 10, "shame": 5, "guilt": 5 },
    "childIds": ["c3d4e5f6-a7b8-9012-cdef-333333333333", "d4e5f6a7-b8c9-0123-def1-444444444444"]
  }
]

**Example 2: topLevel=4 with DES Emotion Profile (MUST create levels 2, 3, AND 4)**

Given these input sentences:
[
  {"id": "s1", "order": 0, "content": "The market surged to an all-time high."},
  {"id": "s2", "order": 1, "content": "Investors celebrated record profits."},
  {"id": "s3", "order": 2, "content": "However, the unemployment rate spiked suddenly."},
  {"id": "s4", "order": 3, "content": "Many companies announced layoffs."},
  {"id": "s5", "order": 4, "content": "The central bank issued a cautious, balanced statement."},
  {"id": "s6", "order": 5, "content": "Experts are divided on the long-term outlook."}
]

Your response for topLevel=4 MUST include ALL levels 2, 3, and 4:
[
  // Level 2: Direct sentence groups (IN DOCUMENT ORDER!)
  {"id": "NEW-UUID-1", "level": 2, "title": "Market Surge and Record Profits", "emotions": {"interest": 60, "joy": 75, "surprise": 40, "sadness": 0, "anger": 0, "disgust": 0, "contempt": 0, "fear": 5, "shame": 0, "guilt": 0}, "childIds": ["s1", "s2"]},
  {"id": "NEW-UUID-2", "level": 2, "title": "Labor Market Decline", "emotions": {"interest": 30, "joy": 5, "surprise": 45, "sadness": 60, "anger": 25, "disgust": 10, "contempt": 5, "fear": 50, "shame": 15, "guilt": 10}, "childIds": ["s3", "s4"]},
  {"id": "NEW-UUID-3", "level": 2, "title": "Cautious Central Bank Response", "emotions": {"interest": 40, "joy": 10, "surprise": 15, "sadness": 20, "anger": 5, "disgust": 0, "contempt": 5, "fear": 25, "shame": 5, "guilt": 5}, "childIds": ["s5", "s6"]},

  // Level 3: Group level 2 nodes by related topics (IN DOCUMENT ORDER!)
  {"id": "NEW-UUID-4", "level": 3, "title": "Economic Extremes", "emotions": {"interest": 45, "joy": 40, "surprise": 43, "sadness": 30, "anger": 13, "disgust": 5, "contempt": 3, "fear": 28, "shame": 8, "guilt": 5}, "childIds": ["NEW-UUID-1", "NEW-UUID-2"]},
  {"id": "NEW-UUID-5", "level": 3, "title": "Monetary Policy & Outlook", "emotions": {"interest": 40, "joy": 10, "surprise": 15, "sadness": 20, "anger": 5, "disgust": 0, "contempt": 5, "fear": 25, "shame": 5, "guilt": 5}, "childIds": ["NEW-UUID-3"]},

  // Level 4: Top level grouping all level 3 nodes
  {"id": "NEW-UUID-6", "level": 4, "title": "Overview of Current Economic Status", "emotions": {"interest": 43, "joy": 28, "surprise": 32, "sadness": 26, "anger": 10, "disgust": 3, "contempt": 4, "fear": 27, "shame": 7, "guilt": 5}, "childIds": ["NEW-UUID-4", "NEW-UUID-5"]}
]

Notice in Example 2:
- ALL grouping nodes (n1 through n6) include the **"emotion"** property.
- The emotion reflects the sentiment of the grouped content.

**WRONG Example: Missing Emotion Property (DO NOT DO THIS):**

{
  "restructuredSubtrees": [
    {
      "rootNodeId": "subtree-1",
      "newNodes": [
        // ❌ WRONG: Missing "emotion" property!
        {"id": "n1", "level": 2, "title": "Cat Care", "childIds": ["s1", "s2"]}
      ]
    }
  ]
}

**Key takeaway**:
- **YOU MUST ADD AN "emotion" PROPERTY with the value "POSITIVE", "NEGATIVE", or "NEUTRAL" to ALL nodes**
- **ALWAYS order nodes in the array by document position (earliest sentence first)!**

═══════════════════════════════════════════════════════════════════
⚠️ FINAL CHECKLIST BEFORE RESPONDING
═══════════════════════════════════════════════════════════════════

For the COMPLETE response, verify:
✓ **restructuredSubtrees array is sorted by document order (earliest sentences first)**

For EACH subtree in your response, verify:
✓ Created ALL levels from 2 to topLevel (check the topLevel field in input!)
✓ Level 2 nodes reference sentence IDs only
✓ Level N nodes (N>2) reference only level N-1 node IDs
✓ Used exact sentence IDs from input (no new UUIDs for sentences)
✓ Generated new UUIDs for all grouping nodes
✓ Sentences appear in order when reading tree left-to-right
✓ **newNodes array is sorted by document order (within each level, nodes ordered by their first sentence's position)**
✓ **ALL grouping nodes (level 2+) have an "emotion" property with value "POSITIVE", "NEGATIVE", or "NEUTRAL"**

${isRootDirty ? `
═══════════════════════════════════════════════════════════════════
ROOT TITLE
═══════════════════════════════════════════════════════════════════

Generate a concise document title (3-8 words) based on all content.

Also generate a ten-axis DES emotion profile for the root based on overall document sentiment. Put this as a prop in the output JSON:
- "rootEmotions": { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 }

Use all ten DES emotion keys exactly and clamp each value to 0-100.
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

Return ONLY valid JSON. DO NOT wrap your response in markdown code fences (no \`\`\`json).
Start directly with the opening brace { and end with the closing brace }.

{${isRootDirty ? `
  "newRootTitle": "Document Title",
  "rootEmotions": { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 },` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "id-from-input",
      "newNodes": [
        // For topLevel=2, just level 2:
        {"id": "NEW-UUID", "level": 2, "title": "Topic", "emotion": "EMOTION_TYPE", "childIds": ["exact-sentence-ids"]},

        // For topLevel=4, ALL levels 2, 3, and 4:
        {"id": "NEW-UUID-1", "level": 2, "title": "Subtopic A", "emotion": "EMOTION_TYPE", "childIds": ["sentence-ids"]},
        {"id": "NEW-UUID-2", "level": 2, "title": "Subtopic B", "emotion": "EMOTION_TYPE", "childIds": ["sentence-ids"]},
        {"id": "NEW-UUID-3", "level": 3, "title": "Topic", "emotion": "EMOTION_TYPE", "childIds": ["NEW-UUID-1", "NEW-UUID-2"]},
        {"id": "NEW-UUID-4", "level": 4, "title": "Section", "emotion": "EMOTION_TYPE", "childIds": ["NEW-UUID-3"]},
        ...
      ]
    }
  ]
}

Remember: Check each subtree's topLevel and create ALL levels from 2 to topLevel!`;

}