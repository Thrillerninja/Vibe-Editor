# Hierarchy Generation System - Architecture Document

## Overview

This document describes the complete, reworked hierarchy generation system. The system creates multi-level hierarchical structures for document sentences while maintaining sentence order and allowing for intelligent grouping.

## System Guarantees

The system GUARANTEES the following invariants:

1. **Sentence Order Preservation**: Sentences NEVER change order
2. **Sentence Completeness**: ALL sentences are included exactly once
3. **Contiguous Grouping**: Groups can ONLY contain consecutive sentences (no skipping)
4. **Level Completeness**: ALL levels from 2 to topLevel are created
5. **Proper Nesting**: Parent at level N contains ONLY children at level N-1
6. **Group Order**: Groups appear in document order to maintain sentence sequence
7. **No Orphans**: Every node (except top-level) is referenced by a parent

### Important: Contiguous Grouping Constraint

**Groups can only contain consecutive sentences!**

❌ **INVALID**: If you have sentences [A, B, C, D, E] where A, B, E are about "cats" and C, D are about "dogs":
```
Group 1: [A, B, E] ← WRONG! Skips C and D
Group 2: [C, D]
```

✅ **VALID**: You must create separate groups for non-contiguous sentences:
```
Group 1: [A, B] ← Cats (first occurrence)
Group 2: [C, D] ← Dogs  
Group 3: [E]    ← Cats (second occurrence)
```

This is necessary because sentence order cannot be changed. When you traverse the tree left-to-right, you must encounter sentences in their original order.

## Hierarchy Structure

```
Level 6 (maxDepth):    Document Root (title only, not a node)
                              |
Level 5:              Top-level grouping nodes
                              |
Level 4:              Mid-level grouping nodes
                              |
Level 3:              Lower grouping nodes
                              |
Level 2:              Direct sentence grouping nodes
                              |
Level 1:              Sentences (always at the bottom)
```

## Key Concepts

### Levels
- **Level 1**: Sentences (always)
- **Levels 2 to (maxDepth-1)**: Grouping nodes
- **Level maxDepth**: Root (conceptual, just a title)

### Dirty Nodes
When text is edited or depth changes, nodes become "dirty" and need restructuring:
- Dirty nodes can be **split** into multiple nodes at the same level
- Dirty nodes can be **merged** with others
- Dirty nodes can be **renamed**
- Children are **never reordered** - only regrouped

### topLevel
The level at which the new hierarchy's top nodes will be created. This equals the level of the dirty root node being replaced.

Example: If `placeholder-level-5` is dirty, `topLevel = 5`
- Claude creates nodes at levels 2, 3, 4, and 5
- The level 5 nodes replace placeholder-level-5

## Three-Phase Process

### Phase 1: Find What Needs Restructuring (`dirtyNodeFinder.js`)

1. **Find dirty root nodes**: Highest-level dirty nodes whose parents aren't dirty
2. **Collect sentences**: Gather all sentences under each dirty root
3. **Build subtree info**: Create metadata for Claude:
   ```javascript
   {
     rootNodeId: "placeholder-level-5",  // Node being replaced
     topLevel: 5,                         // Level of top nodes to create
     suggestedStartNodeId: 10,           // Start IDs at node-10, node-11...
     sentences: [                         // Sentences in document order
       {id: "sentence-0", content: "...", isDirty: true}
     ]
   }
   ```

### Phase 2: Ask Claude to Create Hierarchy (`promptBuilder.js`, `claudeApi.js`)

**Prompt Strategy**: Use clear, structured instructions with:
- Visual separators (═══) for different sections
- Numbered golden rules that must never be violated
- Concrete examples for different maxDepth values
- Explicit statement of what topLevel means

**Claude's Task**: Create a complete hierarchy from level 2 to topLevel that:
- Groups related sentences together
- Creates meaningful titles for groups
- Maintains sentence order within and across groups
- Includes all levels (no gaps)

**Example Response**:
```json
{
  "newRootTitle": "Document Title",
  "restructuredSubtrees": [
    {
      "rootNodeId": "placeholder-level-5",
      "newNodes": [
        {"id": "node-0", "level": 2, "title": "Group A", "childIds": ["sentence-0"]},
        {"id": "node-1", "level": 3, "title": "Section 1", "childIds": ["node-0"]},
        {"id": "node-2", "level": 4, "title": "Chapter", "childIds": ["node-1"]},
        {"id": "node-3", "level": 5, "title": "Part 1", "childIds": ["node-2"]}
      ]
    }
  ]
}
```

### Phase 3: Validate and Integrate (`responseValidator.js`, `hierarchyIntegration.js`)

**Validation Checks** (in order):
1. ✓ JSON is parsable
2. ✓ Top-level structure exists (restructuredSubtrees array)
3. ✓ For each subtree:
   - ✓ All nodes have id, level, title, childIds
   - ✓ Levels are in valid range [2, maxDepth-1]
   - ✓ childIds are non-empty arrays
   - ✓ All levels from 2 to topLevel are present
   - ✓ Parent-child relationships follow level rules
   - ✓ No orphaned nodes
   - ✓ All sentences included exactly once
   - ✓ Sentence order preserved
   - ✓ Groups contain only contiguous sentences (NEW!)

**Integration Algorithm**:
1. Remove dirty root node and all descendants
2. Add all new nodes to the flat node list
3. buildTreeWithHierarchy() later constructs the tree by:
   - Finding top-level nodes (at maxLevel)
   - Recursively building children from childIds
   - Attaching top-level nodes to root

## Example Walkthrough: 1 Sentence, maxDepth=6

### Initial State
```
Sentences: [sentence-0: "The cat sat on the mat."]
maxDepth: 6

Placeholder hierarchy created:
- placeholder-level-5 (level 5) → [placeholder-level-4]
- placeholder-level-4 (level 4) → [placeholder-level-3]
- placeholder-level-3 (level 3) → [placeholder-level-2]
- placeholder-level-2 (level 2) → [sentence-0]

All marked dirty.
```

### Phase 1: Find Dirty Roots
```
Dirty root: placeholder-level-5 (level 5)
Parent: root (conceptual, not dirty)

Subtree info:
{
  rootNodeId: "placeholder-level-5",
  topLevel: 5,
  sentences: [{id: "sentence-0", content: "The cat sat on the mat."}]
}
```

### Phase 2: Claude Response
```json
{
  "newRootTitle": "Information About Cats",
  "restructuredSubtrees": [
    {
      "rootNodeId": "placeholder-level-5",
      "newNodes": [
        {
          "id": "node-0",
          "level": 2,
          "title": "Cat Behavior Description",
          "childIds": ["sentence-0"]
        },
        {
          "id": "node-1",
          "level": 3,
          "title": "Animal Activities",
          "childIds": ["node-0"]
        },
        {
          "id": "node-2",
          "level": 4,
          "title": "Pet Observations",
          "childIds": ["node-1"]
        },
        {
          "id": "node-3",
          "level": 5,
          "title": "Feline Studies",
          "childIds": ["node-2"]
        }
      ]
    }
  ]
}
```

### Phase 3: Validation
```
✓ All levels 2-5 present
✓ Parent-child relationships valid (5→4, 4→3, 3→2, 2→sentence)
✓ No orphaned nodes (node-3 is top-level, others are referenced)
✓ All sentences included (sentence-0)
✓ Sentence order preserved (only one sentence)
```

### Phase 3: Integration
```
Remove: placeholder-level-5, placeholder-level-4, placeholder-level-3, placeholder-level-2
Add: node-0, node-1, node-2, node-3

Final hierarchy:
Root ("Information About Cats")
  └─ node-3 (level 5, "Feline Studies")
     └─ node-2 (level 4, "Pet Observations")
        └─ node-1 (level 3, "Animal Activities")
           └─ node-0 (level 2, "Cat Behavior Description")
              └─ sentence-0 (level 1, "The cat sat on the mat.")
```

## Error Prevention

### Previous Bug (FIXED)
**Problem**: Prompt said "create levels up to but not including topLevel"
- topLevel = 5 → Created levels 2, 3, 4 only
- Missing level 5! Hierarchy incomplete.

**Solution**: Changed to "create ALL levels from 2 up to and INCLUDING topLevel"
- topLevel = 5 → Creates levels 2, 3, 4, 5 ✓
- Complete hierarchy!

### Validation Prevents
- Missing levels → Error before integration
- Orphaned nodes → Error before integration
- Reordered sentences → Error before integration
- Missing/duplicate sentences → Error before integration
- Invalid nesting → Error before integration

## File Responsibilities

### `dirtyNodeFinder.js`
- `findDirtyRootNodes()`: Find highest dirty nodes
- `findSentencesInNode()`: Collect sentences recursively
- `buildDirtySubtrees()`: Create metadata for Claude

### `promptBuilder.js`
- `buildDirtyRestructurePrompt()`: Create clear, structured prompt
- Uses visual formatting, golden rules, concrete examples

### `claudeApi.js`
- `updateDirtyNodes()`: Orchestrate the entire process
- Call dirty finder → build prompt → send to Claude → validate

### `responseValidator.js`
- `parseDirtyRestructureResponse()`: Parse and validate
- `validateSubtree()`: Comprehensive subtree validation
- `validateLevelCompleteness()`: Check all levels exist
- `validateParentChildRelationships()`: Check nesting
- `validateNoOrphanedNodes()`: Check connectivity
- `validateSentenceCompleteness()`: Check all sentences
- `validateSentenceOrder()`: Check order preservation

### `hierarchyIntegration.js`
- `applyDirtySubtreeRestructure()`: Remove old, add new nodes
- `createPlaceholderHierarchy()`: Initial hierarchy on depth change
- `buildTreeWithHierarchy()`: Construct tree from flat node list

## Benefits of This Architecture

1. **Separation of Concerns**: Each file has one clear responsibility
2. **Fail-Fast**: Validation catches errors before integration
3. **Clear Semantics**: topLevel means "create nodes at this level"
4. **Comprehensive Validation**: 6+ different validation checks
5. **Order Preservation**: Multiple checks ensure sentence order
6. **Maintainable**: Well-documented, clear control flow

## Future Enhancements

Potential improvements:
- Support for partial subtree restructuring
- Caching of stable subtrees
- Incremental validation during editing
- Undo/redo support for hierarchy changes
