# Vibe-Editor Architecture

## Table of Contents
1. [Overview](#overview)
2. [Core Principle: SSOT](#core-principle-single-source-of-truth-ssot)
3. [Data Structures](#data-structures)
4. [AI Hierarchy System](#ai-hierarchy-system)
5. [Dirty Tracking System](#dirty-tracking-system)
6. [Data Flow Patterns](#data-flow-patterns)
7. [Document Order Preservation](#document-order-preservation)
8. [Key Components](#key-components)
9. [Advanced Features](#advanced-features)
10. [Performance Considerations](#performance-considerations)

## Overview

Vibe-Editor is a bidirectional text editing application with AI-powered hierarchical organization, built on a **Single Source of Truth (SSOT)** architecture. The system maintains sentences as the primary data structure, with optional AI-generated hierarchy metadata for organization.

### Architecture Philosophy

1. **Sentences are truth** - Everything derives from the sentence array
2. **Metadata is optional** - Hierarchy and emotions are additive
3. **Incremental updates** - Only regenerate what changed
4. **Order is sacred** - AI can regroup but never reorder sentences
5. **Defensive by design** - Validate everything, handle edge cases

## Core Principle: Single Source of Truth (SSOT)

### The SSOT Architecture

```
┌─────────────────────────────────────┐
│   Sentences Array (SSOT)            │
│   + Optional _hierarchyMeta         │
│   + Optional emotion metadata       │
└─────────────┬───────────────────────┘
              │
      ┌───────┴────────┐
      ↓                ↓
  ┌────────┐    ┌──────────────┐
  │  Text  │    │ Tree + Graph │
  │  Pane  │    │ Visualization│
  └────────┘    └──────────────┘
   (derived)       (derived)
```

### Why SSOT?

**Before (problematic):**
```javascript
const [text, setText] = useState('');        // State 1
const [tree, setTree] = useState({});        // State 2
// Manual sync required - can get out of sync!
```

**After (SSOT):**
```javascript
const [sentences, setSentences] = useState([]);  // Only state
const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);
const tree = useMemo(() => buildTreeFromSentences(sentences), [sentences]);
// Impossible to be out of sync - both derived from same source!
```

## Data Structures

### Sentence Object

The fundamental unit of content:

```javascript
{
  // Core properties
  id: "550e8400-e29b-41d4-a716-446655440000",  // UUID v4
  type: "sentence",
  content: "This is a sentence.",

  // Position tracking (computed, for text reconstruction)
  startIdx: 0,
  endIdx: 19,

  // Formatting metadata (preserves original spacing)
  punctuation: ".",           // '.', '!', '?', or undefined
  delimiter: "space",         // 'space', 'newline', 'paragraph', 'none'
  delimiterContent: " ",      // Actual delimiter string (e.g., "\n\n")

  // Optional metadata (user-added)
  emotion: "joy",             // Plutchik emotion
  intensity: 0.8,             // 0-1 intensity
}
```

### Hierarchy Metadata

Attached to the sentences array as `_hierarchyMeta`:

```javascript
sentences._hierarchyMeta = {
  // Basic info
  rootTitle: "Document Title",
  maxLevel: 4,  // Highest grouping level (e.g., 4 for depth=5)

  // Hierarchy nodes (levels 2 to maxLevel)
  nodes: [
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      type: "group",
      level: 2,                    // 2 = groups sentences directly
      label: "Introduction",       // AI-generated title
      childIds: [                  // References to children
        "sentence-uuid-1",
        "sentence-uuid-2",
        "sentence-uuid-3"
      ]
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440002",
      level: 3,                    // 3 = groups level-2 nodes
      label: "Background",
      childIds: [
        "550e8400-e29b-41d4-a716-446655440001",  // Level 2 node
        "550e8400-e29b-41d4-a716-446655440003"   // Level 2 node
      ]
    }
  ],

  // Dirty tracking (incremental updates)
  dirtyNodeIds: [
    "550e8400-e29b-41d4-a716-446655440001",
    "root"
  ],
  dirtySentenceIds: [
    "sentence-uuid-1"
  ]
}
```

### Level System

The hierarchy uses a level-based system:

```
Level 6 (maxDepth): Root node (just title, not a hierarchy node)
Level 5:            Theme nodes
Level 4:            Main topic nodes
Level 3:            Subtopic nodes
Level 2:            Direct sentence groups
Level 1:            Sentences (always at bottom)
```

Example for maxDepth=4:
```
Root (Level 4 - title only)
├── Topic A (Level 3)
│   ├── Subtopic A1 (Level 2)
│   │   ├── Sentence 1
│   │   └── Sentence 2
│   └── Subtopic A2 (Level 2)
│       └── Sentence 3
└── Topic B (Level 3)
    └── Subtopic B1 (Level 2)
        ├── Sentence 4
        └── Sentence 5
```

## AI Hierarchy System

### Integration Points

The AI hierarchy system integrates at these key points:

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                             │
├─────────────────────────────────────────────────────────────┤
│ 1. Type text       → Mark sentences dirty                   │
│ 2. Edit sentence   → Mark sentence + ancestors dirty        │
│ 3. Reorder nodes   → Mark reordered node + parents dirty    │
│ 4. Change depth    → Create placeholder hierarchy (all dirty)│
└──────────────────────────┬──────────────────────────────────┘
                           ↓
            ┌──────────────────────────┐
            │ Click "Generate/Update"  │
            └──────────┬───────────────┘
                       ↓
        ┌──────────────────────────────┐
        │  DIRTY TRACKING SYSTEM       │
        │  1. Find dirty root nodes    │
        │  2. Build dirty subtrees     │
        │  3. Collect sentences        │
        └──────────┬───────────────────┘
                   ↓
        ┌─────────────────────────────────────┐
        │  SEND TO CLAUDE HAIKU 4.5           │
        │  Prompt: "Organize these sentences" │
        │  Include: sentence order, content   │
        └──────────┬──────────────────────────┘
                   ↓
        ┌─────────────────────────────────────┐
        │  RESPONSE VALIDATION                │
        │  - Check all levels present         │
        │  - Verify sentence order preserved  │
        │  - Validate parent-child links      │
        │  - Check for orphaned nodes         │
        │  - Detect ID collisions             │
        └──────────┬──────────────────────────┘
                   ↓
        ┌─────────────────────────────────────┐
        │  APPLY RESTRUCTURE                  │
        │  1. Remove old dirty nodes          │
        │  2. Add new nodes from AI           │
        │  3. Sort nodes by document order    │
        │  4. Rebuild sentence array          │
        │  5. Clear dirty flags               │
        └──────────┬──────────────────────────┘
                   ↓
        ┌─────────────────────────────────────┐
        │  RENDER UPDATED TREE                │
        └─────────────────────────────────────┘
```

### Prompt Construction

The system builds prompts that ensure:
1. **Document order preservation** - Sentences include `order` property
2. **Level completeness** - Must create ALL levels from 2 to topLevel
3. **Contiguous grouping** - Groups contain consecutive sentences only
4. **Array ordering** - Nodes must be sorted by document order

Example prompt snippet:
```
Your job: Create grouping nodes at levels 2-4 to organize sentences by topic.

RULES:
1. NEVER REORDER SENTENCES
   - Sentences have an "order" property (0, 1, 2, 3...)
   - Keep them in this exact order

2. GROUP CONSECUTIVE SENTENCES BY TOPIC
   - Can group [0,1,2] or [3,4] but NOT [0,2,4]

3. MAINTAIN ORDER IN ALL ARRAYS
   - Both restructuredSubtrees and newNodes arrays MUST be sorted by document order
```

### Response Validation

Comprehensive validation ensures AI output is correct:

```javascript
// From responseValidator.js
validateSubtree(subtree, originalSubtree, maxDepth) {
  ✓ validateLevelCompleteness     // All levels 2-topLevel present
  ✓ validateParentChildRelationships // Level N contains level N-1
  ✓ validateNoOrphanedNodes       // All nodes referenced or top-level
  ✓ validateSentenceCompleteness  // All sentences included exactly once
  ✓ validateSentenceOrder         // Sentence order preserved
  ✓ validateContiguousGrouping    // Groups contain consecutive sentences
  ✓ validateNodesArrayOrder       // Nodes sorted by document order
  ✓ validateSubtreesArrayOrder    // Subtrees sorted by document order
}
```

## Dirty Tracking System

The dirty tracking system enables **incremental AI updates** - only regenerate what changed.

### How Dirty Tracking Works

#### 1. Marking Nodes as Dirty

**When sentence is edited:**
```javascript
// From dirtyTracking.js
markSentenceAsDirty(sentences, sentenceId) {
  1. Mark sentence as dirty
  2. Find all ancestor nodes
  3. Mark ancestors as dirty
  4. Mark root as dirty if top-level ancestor
}
```

**When node is reordered:**
```javascript
markReorderAsDirty(sentences, nodeId, oldParentId, newParentId) {
  1. Mark reordered node as dirty
  2. Mark all ancestors at NEW position as dirty
  3. Mark all ancestors at OLD position as dirty
  4. Mark both parent branches as dirty
}
```

#### 2. Finding Dirty Root Nodes

```javascript
// From dirtyNodeFinder.js
findDirtyRootNodes(dirtyNodeIds, hierarchyMeta) {
  // A dirty root is:
  // - A dirty node whose parent is NOT dirty
  // - Or a dirty node with no parent (top-level)

  // Example:
  // Dirty: [nodeA, nodeB, nodeC]
  // nodeA contains nodeB → nodeA is dirty root (nodeB excluded)
  // nodeC has no parent → nodeC is dirty root
  // Result: [nodeA, nodeC]
}
```

#### 3. Building Dirty Subtrees

```javascript
buildDirtySubtrees(dirtyRootNodes, hierarchyMeta, sentences) {
  for each dirtyRootNode:
    1. Collect all descendant sentences recursively
    2. Calculate sentence order from main array
    3. Mark which sentences are dirty
    4. Package as subtree:
       {
         rootNodeId: "node-to-replace",
         topLevel: 3,  // Level of node being replaced
         sentences: [
           { id, order, content, isDirty }
         ]
       }
}
```

### Dirty Tracking Example

**Scenario:** User edits sentence 5 in a 10-sentence document

```
Before edit:
Root
├── Chapter 1 (sentences 0-4)
│   ├── Section 1.1 (sentences 0-2)
│   └── Section 1.2 (sentences 3-4)
└── Chapter 2 (sentences 5-9)
    ├── Section 2.1 (sentences 5-7)  ← Sentence 5 edited
    └── Section 2.2 (sentences 8-9)

Dirty marking:
- sentence-5 → dirty
- Section 2.1 → dirty (parent)
- Chapter 2 → dirty (grandparent)
- root → dirty (great-grandparent)

Find dirty roots:
- Section 2.1 is dirty but Chapter 2 (parent) is also dirty → not a root
- Chapter 2 is dirty but root (parent) is also dirty → not a root
- Root is dirty and has no parent → IS A DIRTY ROOT

Subtree to regenerate:
{
  rootNodeId: "root",
  topLevel: 3,
  sentences: [0,1,2,3,4,5,6,7,8,9]  // All sentences (root encompasses all)
}
```

**Optimization:** If only Section 2.1 was marked dirty (not propagated up):
```
Dirty roots: [Section 2.1]
Subtree: { sentences: [5,6,7] }  // Only 3 sentences!
```

## Data Flow Patterns

### 1. Text Editing Flow

```
User types in textarea
    ↓
handleTextChange(event) - in App.jsx
    ↓
Extract: newText, cursorPosition
    ↓
applySentenceEdit(sentences, newText, cursorPosition) - sentenceEditor.js
    ↓
Parse text into sentences
    ↓
Match with existing sentences (fuzzy matching)
    ↓
Preserve IDs and emotion metadata for matches
    ↓
Generate new IDs for new sentences
    ↓
Check if hierarchy exists
    ├─ No hierarchy → return new sentences
    └─ Has hierarchy → check structure change
       ├─ Same count → mark changed sentences dirty
       └─ Different count → clear hierarchy
    ↓
setSentences(updatedSentences)
    ↓
Text pane auto-updates (derived via useMemo)
Tree visualization auto-updates
```

### 2. Node Reordering Flow

```
User drags node in tree
    ↓
handleReorder(draggedId, targetId, insertBefore) - TreeInner.jsx
    ↓
applyReordering(sentences, draggedId, targetId, insertBefore) - sentenceEditor.js
    ↓
Check if draggedId is sentence or hierarchy node
    ├─ Sentence → reorderSentence()
    │   ├─ Find parent nodes
    │   ├─ Update childIds arrays
    │   └─ Rebuild sentence order from hierarchy
    └─ Hierarchy node → reorderHierarchyNode()
        ├─ Find old and new parents
        ├─ Update childIds in both parents
        └─ Rebuild sentence order from hierarchy
    ↓
markReorderAsDirty(sentences, draggedId, oldParent, newParent)
    ├─ Mark node as dirty
    ├─ Mark old parent branch as dirty
    └─ Mark new parent branch as dirty
    ↓
rebuildSentenceOrderFromHierarchy(sentences, nodes, maxLevel)
    ├─ Find top-level nodes
    ├─ Recursively collect sentences in tree order
    └─ Reorder sentence array to match
    ↓
setSentences(updatedSentences)
    ↓
Tree updates to show new position
Hierarchy button shows "Update Hierarchy" (dirty nodes present)
```

### 3. AI Update Flow

```
User clicks "Generate/Update Hierarchy"
    ↓
handleGenerateHierarchy() - in App.jsx
    ↓
Extract: hierarchyMeta, dirtyNodeIds, dirtySentenceIds
    ↓
updateDirtyNodes(sentences, hierarchyMeta, dirtyNodeIds, dirtySentenceIds, maxDepth)
    ↓
findDirtyRootNodes() - Find highest-level dirty nodes
    ↓
buildDirtySubtrees() - Package subtrees for AI
    ↓
buildDirtyRestructurePrompt() - Create AI prompt
    ↓
client.messages.create() - Call Claude Haiku 4.5 API
    ↓
parseDirtyRestructureResponse() - Parse and validate
    ├─ Extract JSON
    ├─ Validate structure
    ├─ Check level completeness
    ├─ Verify sentence order
    ├─ Validate node ordering
    └─ Return restructuredSubtrees
    ↓
applyDirtySubtreeRestructure() - hierarchyIntegration.js
    ├─ Remove old dirty nodes
    ├─ Add new nodes from AI (with ID collision check)
    ├─ Sort all nodes by document order
    └─ Rebuild sentence order from hierarchy
    ↓
clearDirtyFlags() - Remove dirty markers
    ↓
setSentences(updatedSentences)
    ↓
Tree updates with new hierarchy
Hierarchy button disabled (no dirty nodes)
```

## Document Order Preservation

### The Critical Constraint

**Sentences can be regrouped but NEVER reordered by AI.**

This is enforced through multiple layers:

#### 1. Prompt Construction
```javascript
// From promptBuilder.js
"NEVER REORDER SENTENCES
 - Sentences have an 'order' property (0, 1, 2, 3...)
 - Keep them in this exact order
 - When reading the tree top-to-bottom, left-to-right,
   sentences must appear in order: 0, 1, 2, 3..."
```

#### 2. Response Validation
```javascript
// From responseValidator.js
validateSentenceOrder(subtree, originalSentences) {
  // Extract sentence sequence from new hierarchy
  // Verify sequence is [0, 1, 2, 3...] with no gaps or reversals
  if (currIdx < prevIdx) {
    throw Error("Sentence order violated!");
  }
}
```

#### 3. Node Array Sorting
```javascript
// From hierarchyIntegration.js
sortNodesByDocumentOrder(nodes, sentences) {
  // Calculate minimum sentence position for each node
  // Sort nodes by this position
  // Ensures rebuildSentenceOrderFromHierarchy() produces correct order
}
```

#### 4. Sentence Order Rebuilding
```javascript
// From sentenceEditor.js
rebuildSentenceOrderFromHierarchy(sentences, nodes, maxLevel) {
  // Process top-level nodes in array order
  // Recursively collect sentences following childIds
  // Build reordered array

  // CRITICAL: Nodes must be in document order for this to work!
}
```

### Why Document Order Matters

**Without document order preservation:**
```
Original text: "A. B. C. D."
AI organizes:
  Topic 1: [C, A]  ← Wrong order!
  Topic 2: [D, B]  ← Wrong order!
Result: "C. A. D. B."  ← User's text is scrambled!
```

**With document order preservation:**
```
Original text: "A. B. C. D."
AI organizes:
  Topic 1: [A, B]  ← Correct order maintained
  Topic 2: [C, D]  ← Correct order maintained
Result: "A. B. C. D."  ← User's text unchanged, just regrouped!
```

## Key Components

### App.jsx
**Role:** Main application controller

```javascript
// Single source of truth
const [sentences, setSentences] = useState([]);

// Derived states (auto-update when sentences change)
const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);

// Functions
handleTextChange(e)           // Text editing
handleGenerateHierarchy()     // AI generation/update
handleTreeUpdate(sentences)   // Tree modifications
```

### utils/sentenceEditor.js
**Role:** Core editing operations

```javascript
// Main exports
applySentenceEdit()                      // Apply text edits
applyReordering()                        // Reorder nodes
rebuildSentenceOrderFromHierarchy()      // Rebuild from hierarchy
findSentenceAtPosition()                 // Map cursor to sentence
recalculateIndices()                     // Update positions

// Internal helpers
parseIntoSentences()                     // Text → sentences
findMatchingSentence()                   // Fuzzy matching
reorderSentence()                        // Reorder sentence node
reorderHierarchyNode()                   // Reorder hierarchy node
collectDescendantSentences()             // Recursive sentence collection
```

### utils/hierarchyIntegration.js
**Role:** AI hierarchy integration

```javascript
// Main exports
applyDirtySubtreeRestructure()  // Apply AI-generated hierarchy
integrateHierarchy()            // Full hierarchy integration
buildTreeWithHierarchy()        // Build tree from hierarchy
createPlaceholderHierarchy()    // Create initial structure
clearHierarchy()                // Remove hierarchy

// Internal helpers
sortNodesByDocumentOrder()      // Sort nodes by sentence position
buildSimpleTree()               // Fallback tree (no hierarchy)
removeDescendants()             // Remove node subtree
```

### utils/dirtyTracking.js
**Role:** Dirty state management

```javascript
markSentenceAsDirty()     // Mark sentence + ancestors
markSentencesAsDirty()    // Mark multiple sentences
markReorderAsDirty()      // Mark after reordering
clearDirtyFlags()         // Clear all dirty flags
hasDirtyNodes()           // Check if dirty nodes exist
markAncestorsAsDirty()    // Internal helper
```

### services/claude/

#### claudeApi.js
```javascript
updateDirtyNodes()        // Main API call
  ├─ findDirtyRootNodes()
  ├─ buildDirtySubtrees()
  ├─ buildDirtyRestructurePrompt()
  ├─ client.messages.create()
  └─ parseDirtyRestructureResponse()
```

#### promptBuilder.js
```javascript
buildDirtyRestructurePrompt(subtrees, maxDepth, isRootDirty)
  // Constructs comprehensive prompt with:
  // - Hierarchy structure explanation
  // - Rules (never reorder, group consecutive, etc.)
  // - Input data (sentences with order)
  // - Examples
  // - Final checklist
```

#### responseValidator.js
```javascript
parseDirtyRestructureResponse(responseText, maxDepth, originalSubtrees)
  ├─ extractJSON()
  ├─ validateTopLevelStructure()
  ├─ validateSubtree()
  │   ├─ validateNodeStructure()
  │   ├─ validateLevelCompleteness()
  │   ├─ validateParentChildRelationships()
  │   ├─ validateNoOrphanedNodes()
  │   ├─ validateSentenceCompleteness()
  │   ├─ validateSentenceOrder()
  │   ├─ validateContiguousGrouping()
  │   └─ validateNodesArrayOrder()
  └─ validateSubtreesArrayOrder()
```

#### dirtyNodeFinder.js
```javascript
findDirtyRootNodes()      // Find highest-level dirty nodes
findSentencesInNode()     // Collect sentences in node
buildDirtySubtrees()      // Package for AI
```

### components/TreeVisualization/

#### TreeInner.jsx
```javascript
// Receives sentences, renders tree
const tree = useMemo(() => buildTreeFromSentences(sentences), [sentences]);
const { nodes, edges } = useMemo(() => flattenTree(tree), [tree]);

// Handles
handleReorder()           // Drag & drop reordering
handleEmotionChange()     // Emotion updates
handleNodeLabelEdit()     // (Future) Direct editing
```

## Advanced Features

### Fuzzy Sentence Matching

Preserves metadata across edits:

```javascript
// From sentenceEditor.js
findMatchingSentence(sentences, content, usedSentences) {
  // 1. Try exact match
  for (const sentence of sentences) {
    if (sentence.content === content && !usedSentences.has(sentence.id)) {
      return sentence;  // Preserve ID and metadata
    }
  }

  // 2. Try fuzzy match (80% similarity)
  const similarity = calculateSimilarity(sentence.content, content);
  if (similarity > 0.8) {
    return sentence;  // Preserve ID and metadata
  }

  return null;  // Create new sentence
}
```

### ID Collision Detection

Prevents data loss from duplicate IDs:

```javascript
// From hierarchyIntegration.js
for (const newNode of subtree.newNodes) {
  if (existingNodeIds.has(newNode.id)) {
    console.error("⚠️ ID collision detected!");
    const freshId = uuidv4();
    console.warn(`Replacing ${newNode.id} with ${freshId}`);
    // Use fresh ID instead
  }
}
```

### Missing Sentence Detection

Warns when sentences aren't in any subtree:

```javascript
// From dirtyNodeFinder.js
const coveredSentenceIds = new Set(
  dirtySubtrees.flatMap(st => st.sentences.map(s => s.id))
);
const missingSentenceIds = [...allSentenceIds].filter(
  id => !coveredSentenceIds.has(id)
);

if (missingSentenceIds.length > 0) {
  console.warn(`⚠️ ${missingSentenceIds.length} sentences NOT in any dirty subtree!`);
}
```

## Performance Considerations

### Optimization Strategies

1. **Incremental Updates**
   - Only send dirty subtrees to AI (not entire document)
   - Preserve clean portions of hierarchy
   - Faster regeneration on edits

2. **Memoization**
   ```javascript
   const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);
   const tree = useMemo(() => buildTreeFromSentences(sentences), [sentences]);
   ```

3. **Efficient Dirty Tracking**
   - Mark ancestors incrementally (not full tree scan)
   - Set-based lookups for dirty checks
   - Minimal metadata overhead

4. **Smart Reordering**
   - Only rebuild sentence order when hierarchy changes
   - Reuse existing sentence objects (preserve references)

### Scalability

**Current performance (tested):**
- 100 sentences: Instant
- 500 sentences: < 1 second
- 1000 sentences: < 3 seconds (layout becomes bottleneck)

**Bottlenecks:**
1. ELK layout algorithm (O(n log n))
2. ReactFlow rendering (hundreds of nodes)
3. AI API latency (2-5 seconds typical)

**Future optimizations:**
- Virtualized tree rendering for 1000+ sentences
- Incremental layout updates (not full re-layout)
- Parallel AI calls for multiple dirty subtrees
- Caching of AI responses

## Edge Cases & Defensive Measures

### 1. ID Collisions
**Problem:** AI generates an ID that already exists
**Solution:** Detect collision, generate fresh UUID, log error

### 2. Missing Sentences
**Problem:** Dirty subtrees don't cover all sentences
**Solution:** Warn in console with specific sentence IDs

### 3. Out-of-Order Nodes
**Problem:** Nodes added in wrong order → sentences scrambled
**Solution:** Sort all nodes by document order after adding

### 4. Orphaned Nodes
**Problem:** Node with no parent and not at top level
**Solution:** Validation rejects such hierarchies

### 5. Incomplete Levels
**Problem:** AI skips level 3 when creating levels 2, 4
**Solution:** Validation enforces all levels 2-topLevel present

### 6. Non-Contiguous Groups
**Problem:** Level-2 group contains sentences [0, 2, 4] (skips 1, 3)
**Solution:** Validation rejects non-contiguous groupings

## Conclusion

Vibe-Editor's architecture demonstrates:
- **Clean separation** via SSOT principle
- **Incremental AI** via dirty tracking
- **User control** via document order preservation
- **Robustness** via comprehensive validation
- **Extensibility** via metadata design

The system successfully combines AI-powered organization with manual control, providing a hybrid editing experience that respects user intent while adding intelligent structure.

---

*For usage examples and setup, see README.md*
