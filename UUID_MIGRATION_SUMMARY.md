# UUID Migration Summary

This document summarizes the migration from sequential numeric IDs to UUIDs with order-based positioning for sentences and nodes.

## Changes Overview

### 1. Package Installation
- **Added**: `uuid` package for generating UUIDs

### 2. Sentence Structure Changes

#### Before:
```javascript
{
  id: "sentence-0",
  type: "sentence",
  content: "Example sentence.",
  startIdx: 0,
  endIdx: 17,
  // ...
}
```

#### After:
```javascript
{
  id: "a3d5f8e2-1a4c-4b8d-9e2f-3c5a6b7d8e9f", // UUID
  order: 0, // Position in document
  type: "sentence",
  content: "Example sentence.",
  startIdx: 0,
  endIdx: 17,
  // ...
}
```

### 3. Key Changes by File

#### `src/utils/sentenceEditor.js`
- **Import**: Added `import { v4 as uuidv4 } from 'uuid'`
- **parseIntoSentences()**: 
  - Generates UUIDs instead of sequential IDs
  - Adds `order` property (0, 1, 2, ...) for position tracking
  - Removed `startId` parameter
- **applySentenceEdit()**:
  - Preserves `order` property when matching existing sentences
- **applyReordering()**:
  - Updates `order` properties after reordering to reflect new sequence

#### `src/utils/hierarchyIntegration.js`
- **Import**: Added `import { v4 as uuidv4 } from 'uuid'`
- **applyDirtySubtreeRestructure()**:
  - Removed numeric ID generation logic
  - Now uses UUIDs provided by Claude API
- **createPlaceholderHierarchy()**:
  - Generates UUIDs for placeholder nodes instead of `placeholder-level-N`

#### `src/utils/treeParser.js`
- **buildTextFromSentences()**:
  - Sorts by `order` property instead of `startIdx`
  - Ensures correct document sequence using order values

#### `src/services/claude/promptBuilder.js`
- **Complete rewrite** of the prompt to explain:
  - UUID-based ID system (meaningless identifiers)
  - Order property for sequence tracking
  - How to use order values for grouping (not IDs)
  - UUID generation requirements for new nodes
- **Added**: Example UUIDs in the prompt for clarity
- **Updated**: All examples to use UUIDs instead of numeric IDs

#### `src/services/claude/dirtyNodeFinder.js`
- **buildDirtySubtrees()**:
  - Removed numeric ID suggestion logic
  - Added `order` property to sentence data sent to Claude
  - Simplified structure (Claude generates its own UUIDs)

## Important Behavioral Changes

### Sentence Ordering
- **Before**: Relied on sequential numeric IDs and `startIdx` for ordering
- **After**: Uses explicit `order` property (0, 1, 2, ...)
- **Reason**: UUIDs are meaningless for ordering; need explicit position tracking

### Node Reordering
- When sentences are reordered, the `order` property is updated
- This ensures `buildTextFromSentences()` reconstructs text in the correct sequence
- Hierarchy metadata is also updated to reflect new order

### AI Integration
- Claude now receives sentences with UUIDs and order values
- Claude must use the `order` property to understand document sequence
- Claude generates UUIDs for all new nodes it creates
- The prompt explicitly warns Claude NOT to rely on IDs for ordering

## Benefits of This Approach

1. **Decoupling**: IDs are now truly meaningless identifiers, separate from ordering
2. **Flexibility**: Can reorder sentences without changing IDs (preserves React keys)
3. **Clarity**: Order is explicit, not implicit in the ID
4. **Future-proof**: Easier to handle complex reordering scenarios
5. **Robustness**: Less chance of ID conflicts or ordering bugs

## Testing Checklist

- [ ] Load example text and verify sentences get UUIDs
- [ ] Check that text reconstruction works correctly
- [ ] Test sentence editing (modify content)
- [ ] Test sentence reordering via drag-and-drop
- [ ] Generate AI hierarchy and verify it works
- [ ] Test hierarchy regeneration after text changes
- [ ] Verify depth changes work correctly
- [ ] Check that reordering updates order property

## Backward Compatibility

**BREAKING CHANGE**: This migration is NOT backward compatible with existing saved data that uses numeric sentence IDs. Any stored hierarchy data will need to be regenerated.

If you need to migrate existing data:
1. Clear all hierarchy metadata
2. Reload the document
3. Regenerate the hierarchy

## API Contract with Claude

### Input to Claude:
```json
{
  "sentences": [
    {
      "id": "uuid-here",
      "order": 0,
      "content": "First sentence.",
      "isDirty": false
    },
    {
      "id": "another-uuid",
      "order": 1,
      "content": "Second sentence.",
      "isDirty": true
    }
  ]
}
```

### Expected Output from Claude:
```json
{
  "newNodes": [
    {
      "id": "generated-uuid-1",
      "level": 2,
      "title": "Group Title",
      "childIds": ["uuid-here", "another-uuid"]
    }
  ]
}
```

Key points:
- Claude receives `order` to determine sequence
- Claude ignores the `id` field for ordering purposes
- Claude generates new UUIDs for nodes
- Node IDs must be unique UUIDs
