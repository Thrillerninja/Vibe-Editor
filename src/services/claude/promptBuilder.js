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

/**
 * Build a prompt for restructuring dirty subtrees
 * @param {Array} dirtySubtrees - Array of subtree information
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {boolean} isRootDirty - Whether the root node title needs regeneration
 * @returns {string} The constructed prompt
 */
export function buildDirtyRestructurePrompt(dirtySubtrees, maxDepth, isRootDirty = false) {
  // App numbering: 0=root, 1..maxDepth-2=groups, maxDepth-1=content
  const contentLevel = maxDepth - 1;
  const maxGroupLevel = maxDepth - 2;

  return `You are a document organization assistant.

═══════════════════════════════════════════════════════════════════
HIERARCHY STRUCTURE (App Numbering)
═══════════════════════════════════════════════════════════════════

Document levels (0 is root, maxDepth-1 is leaf content):
• Level 0: Root node (document title, not restructured)
• Levels 1-${maxGroupLevel}: Grouping nodes (you create these)
• Level ${contentLevel}: Content nodes (sentences - NEVER CREATE THESE)

Your job: Create grouping nodes at levels 1-${maxGroupLevel} to organize content by topic.

⚠️ CRITICAL: You MUST create ALL levels from 1 up to the topLevel specified!
   - topLevel tells you the HIGHEST group level to create
   - For example, if topLevel=3, create levels 1, 2, AND 3
   - Sentence IDs always go in level ${contentLevel} children (already exist)

═══════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════

1. **NEVER REORDER SENTENCES**
   - Sentences have an "order" property
   - Keep them in this exact order

2. **GROUP CONSECUTIVE SENTENCES BY TOPIC**
   - Groups at level ${contentLevel - 1} directly contain sentences
   - Groups at level ${contentLevel - 2} contain level ${contentLevel - 1} groups
   - etc., up to topLevel

3. **MAINTAIN ORDER IN ALL ARRAYS**
   - Within each level, nodes sorted by first sentence's document position

4. **CREATE ALL LEVELS**
   - For topLevel=3: create ALL levels 1, 2, and 3
   - Level 1 groups directly contain sentences
   - Level 2 groups contain level 1 groups
   - Level 3 groups contain level 2 groups

5. **USE CORRECT IDs**
   - Generate NEW UUIDs for grouping nodes you create
   - Use EXACT sentence IDs from input (don't generate new ones)

6. **ADD EMOTION PROFILE (DES 10-axis)**
   - Every grouping node needs: { "interest": 0-100, "joy": 0-100, ... all 10 emotions ... }

═══════════════════════════════════════════════════════════════════
INPUT DATA
═══════════════════════════════════════════════════════════════════

${JSON.stringify(dirtySubtrees, null, 2)}

Each subtree:
- **rootNodeId**: ID of node being replaced
- **topLevel**: Highest APP level to create (e.g., 3)
- **sentences**: Array with id, order, content, isDirty

═══════════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════════

**Example: maxDepth=4 (levels 0-3), topLevel=3**

Input sentences:
[
  {"id": "s1", "order": 0, "content": "Markets surged."},
  {"id": "s2", "order": 1, "content": "Investors celebrated."},
  {"id": "s3", "order": 2, "content": "But unemployment spiked."},
  {"id": "s4", "order": 3, "content": "Companies announced layoffs."},
  {"id": "s5", "order": 4, "content": "The bank issued a statement."},
  {"id": "s6", "order": 5, "content": "Experts are divided."}
]

Your response (topLevel=3):
[
  // Level 1: Groups directly containing sentences
  {"id": "g1", "level": 1, "title": "Market Surge", "emotions": {...}, "childIds": ["s1", "s2"]},
  {"id": "g2", "level": 1, "title": "Job Market Crisis", "emotions": {...}, "childIds": ["s3", "s4"]},
  {"id": "g3", "level": 1, "title": "Policy Response", "emotions": {...}, "childIds": ["s5", "s6"]},

  // Level 2: Groups containing level 1 groups
  {"id": "g4", "level": 2, "title": "Economic Extremes", "emotions": {...}, "childIds": ["g1", "g2"]},
  {"id": "g5", "level": 2, "title": "Government Actions", "emotions": {...}, "childIds": ["g3"]},

  // Level 3: Top-level grouping
  {"id": "g6", "level": 3, "title": "Economic Overview", "emotions": {...}, "childIds": ["g4", "g5"]}
]

═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown code fences):

{${isRootDirty ? `
  "newRootTitle": "Document Title",
  "rootEmotions": { "interest": 0-100, ... all 10 emotions ... },` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "id-from-input",
      "newNodes": [
        {"id": "NEW-UUID", "level": 1, "title": "...", "emotions": {...}, "childIds": [...]},
        ...create ALL levels from 1 to topLevel...
      ]
    }
  ]
}`;
}