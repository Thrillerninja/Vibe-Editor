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
  
  // In dirty subtrees, contentLevel might be specified per subtree
  const firstSubtree = dirtySubtrees[0];
  const subtreeContentLevel = firstSubtree?.contentLevel || contentLevel;

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
   - topLevel tells you the HIGHEST level to create (may include sentence-containing level)
   - For example, if topLevel=3, create levels 1, 2, AND 3
   - Level ${subtreeContentLevel} nodes contain sentences (the leaf level)
   - Levels above ${subtreeContentLevel} contain grouping nodes

═══════════════════════════════════════════════════════════════════
EMOTION PROFILE: DES 10-AXIS (Differential Emotions Scale)
═══════════════════════════════════════════════════════════════════

CRITICAL: Every grouping node MUST have ALL 10 emotion axes. NO MORE, NO LESS.

The correct 10 emotions (Izard, 1997) are:
1. interest: Curiosity, engagement, fascination, attention, focus
2. joy: Happiness, delight, pleasure, contentment, satisfaction
3. surprise: Astonishment, amazement, unexpected response, shock
4. sadness: Sorrow, downheartedness, distress, grief, melancholy
5. anger: Hostility, rage, frustration, irritation, resentment
6. disgust: Revulsion, repugnance, distaste, aversion, contempt
7. contempt: Disdain, scorn, disrespect, superiority, dismissal
8. fear: Anxiety, worry, terror, nervousness, apprehension
9. shame: Embarrassment, humiliation, self-consciousness, inadequacy
10. guilt: Remorse, regret, self-blame, moral distress, contrition

⚠️ INVALID EMOTIONS (DO NOT USE):
- trust, distrust, anticipation, love, hatred, neutral, anxiety (use fear instead)

Each emotion is rated 0-100 on a continuous scale.
Multiple emotions can be present simultaneously.

EXAMPLE VALID EMOTION PROFILE (all 10 required):
{
  "interest": 65,
  "joy": 45,
  "surprise": 20,
  "sadness": 35,
  "anger": 10,
  "disgust": 15,
  "contempt": 5,
  "fear": 25,
  "shame": 20,
  "guilt": 15
}

═══════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════

1. **NEVER REORDER SENTENCES**
   - Sentences have an "order" property
   - Keep them in this exact order

2. **GROUPS MUST BE CONSECUTIVE IN DOCUMENT ORDER**
   - NEVER group sentences by topic if they're not consecutive
   - INVALID: Group A has sentences [0, 5, 10] (not consecutive)
   - VALID: Group A has sentences [0, 1, 2, 3] (consecutive)
   - If semantically related sentences are far apart, DON'T group them
   - It's better to have less meaningful groups than to skip sentences
   - YOU CANNOT CREATE OVERLAPPING GROUPS
   
3. **MAINTAIN ORDER IN ALL ARRAYS**
   - Within each level, nodes sorted by first sentence's document position

4. **CREATE ALL LEVELS**
   - For topLevel=${subtreeContentLevel}: create ALL levels 1 through ${subtreeContentLevel}
   - Level 1: top-level groups
   - Level ${subtreeContentLevel}: sentence-containing groups
   - Every intermediate level must be present

5. **USE CORRECT IDs**
   - Generate NEW UUIDs for grouping nodes you create
   - Use EXACT sentence IDs from input (don't generate new ones)

6. **ADD COMPLETE EMOTION PROFILE (ALL 10 DES AXES)**
   - REQUIRED: { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 }
   - FORBIDDEN: trust, anticipation, neutral, or any emotion not in the 10 above
   - Every value must be 0-100

═══════════════════════════════════════════════════════════════════
INPUT DATA
═══════════════════════════════════════════════════════════════════

${JSON.stringify(dirtySubtrees, null, 2)}

Each subtree:
- **rootNodeId**: ID of node being replaced
- **topLevel**: Highest level to create (e.g., ${subtreeContentLevel})
- **contentLevel**: Level that should contain sentences (e.g., ${subtreeContentLevel})
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
  {"id": "g1", "level": 1, "title": "Market Surge", "emotions": {"interest": 75, "joy": 60, "surprise": 40, "sadness": 10, "anger": 5, "disgust": 5, "contempt": 5, "fear": 10, "shame": 5, "guilt": 5}, "childIds": ["s1", "s2"]},
  {"id": "g2", "level": 1, "title": "Job Market Crisis", "emotions": {"interest": 70, "joy": 15, "surprise": 50, "sadness": 70, "anger": 60, "disgust": 30, "contempt": 15, "fear": 50, "shame": 20, "guilt": 25}, "childIds": ["s3", "s4"]},
  {"id": "g3", "level": 1, "title": "Policy Response", "emotions": {"interest": 65, "joy": 20, "surprise": 35, "sadness": 35, "anger": 25, "disgust": 15, "contempt": 10, "fear": 30, "shame": 15, "guilt": 20}, "childIds": ["s5", "s6"]},

  // Level 2: Groups containing level 1 groups
  {"id": "g4", "level": 2, "title": "Economic Extremes", "emotions": {"interest": 72, "joy": 35, "surprise": 45, "sadness": 40, "anger": 32, "disgust": 17, "contempt": 10, "fear": 30, "shame": 12, "guilt": 15}, "childIds": ["g1", "g2"]},
  {"id": "g5", "level": 2, "title": "Government Actions", "emotions": {"interest": 65, "joy": 20, "surprise": 35, "sadness": 35, "anger": 25, "disgust": 15, "contempt": 10, "fear": 30, "shame": 15, "guilt": 20}, "childIds": ["g3"]},

  // Level 3: Top-level grouping
  {"id": "g6", "level": 3, "title": "Economic Overview", "emotions": {"interest": 68, "joy": 28, "surprise": 40, "sadness": 37, "anger": 28, "disgust": 16, "contempt": 10, "fear": 30, "shame": 13, "guilt": 17}, "childIds": ["g4", "g5"]}
]

═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown code fences):

{${isRootDirty ? `
  "newRootTitle": "Document Title",
  "rootEmotions": { "interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100 },` : ''}
  "restructuredSubtrees": [
    {
      "rootNodeId": "id-from-input",
      "newNodes": [
        {"id": "NEW-UUID", "level": 1, "title": "...", "emotions": {"interest": 0-100, "joy": 0-100, "surprise": 0-100, "sadness": 0-100, "anger": 0-100, "disgust": 0-100, "contempt": 0-100, "fear": 0-100, "shame": 0-100, "guilt": 0-100}, "childIds": [...]},
        ...create ALL levels from 1 to topLevel...
      ]
    }
  ]
}`;
}