# Vibe-Editor Architecture

## Overview
Vibe-Editor is a bidirectional text editing application with dynamic tree visualization and emotion-based editing capabilities.

## Core Principle: Single Source of Truth (SSOT)

### The New Approach
**Sentences are the SSOT** - All other representations are derived from the sentence array.

```
SSOT: Sentences Array
         ↓
    ┌────┴────┐
    ↓         ↓
  Text      Tree
  Pane    Visualization
```

## Data Structure

### Sentence Node
```javascript
{
  id: "sentence-0",
  type: "sentence",
  content: "This is a sentence.",
  startIdx: 0,      // Position in original text
  endIdx: 19,       // End position in original text
  emotion: "joy",   // Optional: Plutchik emotion
  intensity: 0.8,   // Optional: 0-1 intensity
}
```

### Tree Hierarchy (Current Implementation)
```
Root (Document)
  └── Sentence nodes (connected directly to root)
```

### Future: Dynamic Levels
The architecture supports adding intermediate levels between root and sentences:
```
Root (Document)
  └── Chapters
      └── Sections
          └── Sentences (SSOT)
```

## Data Flow

### 1. User Types in Textarea → Direct Sentence Editing
```javascript
User types in textarea
    ↓
handleTextChange(event)
    ↓
Get cursor position and new text
    ↓
applySentenceEdit(sentences, newText, cursorPosition)
    ↓
Parse new text into sentences
    ↓
Match with existing sentences (preserve metadata)
    ↓
sentences array updated
    ↓
Text auto-renders from sentences
```

**Key Feature:** No intermediate text state! The textarea displays derived text from sentences, and edits are applied directly back to the sentence array.

### 2. Sentences → Text Display (Automatic)
```javascript
sentences array (SSOT)
    ↓
buildTextFromSentences(sentences)
    ↓
text = "Sentence 1. Sentence 2. ..."
    ↓
Rendered in textarea (derived state via useMemo)
```

**No manual sync needed** - text is always up-to-date with sentences.

### 3. Sentences → Tree Visualization
```javascript
sentences array (SSOT)
    ↓
buildTreeFromSentences(sentences)
    ↓
tree = {root, children: [sentence nodes]}
    ↓
flattenTree(tree)
    ↓
{nodes, edges} for ReactFlow
    ↓
runElk(nodes, edges)
    ↓
Positioned graph layout
```

**Direct construction** - no text parsing step needed!

### 4. Tree Changes → Sentences Update
```javascript
User edits node/applies emotion
    ↓
handleEmotionChange(nodeId, emotion, intensity)
    ↓
Updated sentence in array
    ↓
onTreeUpdate(updatedSentences)
    ↓
App state updated
    ↓
Text pane auto-updates
```

## Key Components

### App.jsx
- Stores `sentences` array (SSOT) - the ONLY stored state
- Derives `text` from sentences via `useMemo` - **no separate text state**
- `handleTextChange` - applies edits directly to sentence array
- `handleTreeUpdate` - receives sentence updates from tree
- **Zero duplication** - sentences are the single source of truth

### TreeVisualization/TreeInner.jsx
- Receives `sentences` array
- Builds tree structure directly from sentences
- Handles drag & drop (reordering/reparenting)
- Emits updates via `onTreeUpdate`

### utils/sentenceEditor.js (NEW)
**Core Functions:**
- `applySentenceEdit(sentences, newText, cursorPosition)` - Applies text edits to sentence array
- `findSentenceAtPosition(sentences, position)` - Maps cursor position to sentence
- `recalculateIndices(sentences)` - Updates startIdx/endIdx after structural changes

**Features:**
- Preserves emotion metadata when content is similar
- Uses Levenshtein distance for fuzzy matching
- Handles sentence splitting, merging, insertion, deletion

### utils/treeParser.js
**Core Functions:**
- `buildTextFromSentences(sentences)` - Sentences → Text (one-way only!)
- `buildTreeFromSentences(sentences)` - Sentences → Tree structure
- `flattenTree(tree)` - Tree → ReactFlow nodes/edges

**Note:** No more `parseTextToSentences` - text editing is handled by `sentenceEditor.js`

## Benefits of SSOT Architecture

1. **True Bidirectional Sync**: Changes in tree OR text automatically sync
2. **Zero Duplication**: No separate text state - always derived from sentences
3. **Metadata Preservation**: Emotions persist across edits via fuzzy matching
4. **Direct Editing**: Text changes map directly to sentence operations
5. **Consistency**: Impossible to have text/tree out of sync
6. **Performance**: No full re-parsing on every keystroke
7. **Extensibility**: Easy to add new sentence-level metadata

## Advanced Editing Features

### Intelligent Sentence Matching
When text is edited, the system:
1. Parses the new text into sentences
2. Matches each new sentence with existing sentences
3. Preserves emotion metadata for similar content (>80% similarity)
4. Creates new sentence objects for truly new content

This means **emotion tags survive minor edits**!

## Future Enhancements

### 1. Dynamic Tree Levels
Add configurable grouping of sentences:
```javascript
{
  grouping: [
    { type: 'chapter', separator: '\n\n' },
    { type: 'section', separator: '\n' },
  ]
}
```

### 2. Direct Text Editing
Allow editing sentence content directly in tree nodes:
```javascript
handleSentenceEdit(sentenceId, newContent) {
  // Update sentence in array
  // Recalculate indices
  // Re-render text pane
}
```

### 3. AI-Powered Rewriting
Use emotion metadata to guide LLM rewrites:
```javascript
rewriteWithEmotion(sentence, emotion, intensity) {
  // Call LLM API
  // Apply emotional tone transformation
  // Update sentence content
}
```

### 4. Advanced Operations
- **Merge sentences**: Combine multiple sentences
- **Split sentences**: Break sentence at cursor
- **Reorder via drag**: Update sentence array order
- **Delete sentences**: Remove from array

## Implementation Notes

### Index Tracking
- Each sentence stores `startIdx` and `endIdx`
- Indices refer to positions in original input text
- After edits, indices need recalculation
- Future: Implement differential index updates

### Whitespace Handling
- Current: Simple space separation on rebuild
- Future: Store original whitespace/newlines
- Consider storing delimiters between sentences

### Performance Considerations
- Sentence parsing is O(n) on input length
- Tree building is O(m) on sentence count
- Layout (ELK) is O(m log m)
- For 1000+ sentences, consider virtualization

## Testing the New Structure

1. **Insert example text** → Should see root + 4 sentence nodes
2. **Type in textarea** → Tree updates automatically
3. **Apply emotion to sentence** → Node color changes, sentence metadata updates
4. **Clear text** → Tree empties gracefully

## Migration Guide

### Old Approach (Removed)
```javascript
// Separate text and tree states - MANUAL SYNC REQUIRED
const [text, setText] = useState('');
const [textTree, setTextTree] = useState('');

// Had to manually sync
function handleRendering(t) {
  setTextTree(t);
}

// Could get out of sync!
```

### New Approach (Current)
```javascript
// ONLY sentences stored - everything else derived
const [sentences, setSentences] = useState([]);

// Text is ALWAYS in sync (derived via useMemo)
const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);

// Direct editing - no parsing delay
function handleTextChange(e) {
  const updatedSentences = applySentenceEdit(
    sentences, 
    e.target.value, 
    e.target.selectionStart
  );
  setSentences(updatedSentences);
}

// Impossible to be out of sync!
```

### Key Difference
- **Before**: Text → Parse → Sentences (on every change)
- **After**: Sentences → Build text (automatic, instant)
- **Result**: Direct sentence manipulation, metadata preservation, zero lag

## Conclusion

The SSOT architecture provides a solid foundation for bidirectional editing. Sentences as the primary data structure enable:
- Clean separation of concerns
- Reliable state synchronization
- Extensible metadata system
- Future-proof design for dynamic tree levels

All future features (AI rewriting, direct editing, advanced operations) can build on this foundation.
