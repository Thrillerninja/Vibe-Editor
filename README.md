# Vibe-Editor

A bidirectional text editor with AI-powered hierarchical organization, dynamic tree visualization, and emotion-based editing.

## 🎯 Core Concept

Vibe-Editor uses **sentences as the single source of truth** with optional AI-generated hierarchical organization. Everything else (text display, tree visualization) is derived from the sentence array.

```
Sentences Array (SSOT) + AI Hierarchy Metadata
                 ↓
            ┌────┴────┐
            ↓         ↓
          Text    Interactive
          Pane    Tree Visualization
```

## ✨ Key Features

### Editing & Synchronization
- **Direct Sentence Editing**: Type in the text pane, sentences update automatically
- **True Bidirectional Sync**: Changes in tree OR text automatically sync
- **Intelligent Reordering**: Drag nodes in the tree to reorganize your document
- **Metadata Preservation**: Emotions and structure persist across edits

### AI-Powered Organization
- **Dynamic Hierarchies**: 3-6 levels of automatic document organization
- **Incremental Updates**: Edit any part - AI only regenerates what changed
- **Smart Dirty Tracking**: Clean portions of hierarchy are preserved during updates
- **Document Order Preservation**: Sentences always maintain their sequential order

### Tree Visualization
- **Interactive Graph**: Drag, zoom, and explore your document structure
- **DES Emotion Profiling**: Track 10 fundamental emotions per sentence using the Differential Emotions Scale
- **Visual Hierarchy**: See topics, subtopics, and sentence groupings at a glance
- **Physics Simulation**: Nodes arrange themselves with smooth animations

### Emotion Analysis (DES)
Vibe-Editor uses the **Differential Emotions Scale (DES)** by Izard (1997) to capture nuanced emotional content in text. The DES measures 10 fundamental emotions that are theoretically and empirically distinct:

1. **Interest** - Curiosity, excitement, engagement
2. **Joy** - Happiness, delight, enjoyment
3. **Surprise** - Amazement, astonishment
4. **Sadness** - Distress, downheartedness
5. **Anger** - Hostility, rage
6. **Disgust** - Revulsion, repugnance
7. **Contempt** - Scorn, disdain
8. **Fear** - Anxiety, terror
9. **Shame** - Embarrassment, humiliation
10. **Guilt** - Remorse, regret

Each sentence and node in the hierarchy receives a 10-dimensional emotion profile (0-100 intensity per emotion), visualized through an interactive radar chart that allows for:
- Multi-dimensional emotional expression (sentences can exhibit multiple emotions simultaneously)
- AI-guided sentence rewriting to match target emotion profiles
- Hierarchical emotion aggregation (parent nodes reflect combined emotions of children)

## 🏗️ Architecture Highlights

### Single Source of Truth
- Sentence array is the only stored state
- Text and tree are **derived** (no duplication)
- Impossible to get out of sync

### Dirty Tracking System
When you edit or reorder:
1. System marks affected nodes as "dirty"
2. Clean (unchanged) portions are preserved
3. AI regenerates only the dirty subtrees
4. Efficient incremental updates instead of full regeneration

### Document Order Guarantee
- Sentences can be **regrouped** under different parent nodes
- Sentences **cannot be reordered** by AI - they maintain document sequence
- Reordering is manual (via drag & drop in tree)
- Hierarchy respects your intended sentence order

## 🚀 Getting Started

### Installation

```bash
npm install
```

### AI Configuration

To enable AI-powered hierarchical document organization:

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Get your Claude API key from [Anthropic Console](https://console.anthropic.com/)

3. Add your API key to `.env`:
   ```
   VITE_CLAUDE_API_KEY=your_actual_api_key_here
   ```

4. **Important**: Never commit your `.env` file (it's already in `.gitignore`)

### Running the App

```bash
npm run dev
```

Visit `http://localhost:5173/`

## 📖 How to Use

### Basic Text Editing
1. Type in the left pane
2. Sentences are automatically parsed and visualized in the tree
3. Edit any sentence - tree updates in real-time

### AI Hierarchy Generation
1. **Write your content** in the text editor
2. **Adjust the depth slider** (3-6 levels) to set organization depth
3. **Click "Generate Hierarchy"** to have AI organize your content
4. **View the structured tree** showing your document hierarchy

### Editing with AI Hierarchy
Once hierarchy is generated:
- **Edit text**: Only modified sentences and their ancestors are marked dirty
- **Reorder nodes**: Drag nodes in the tree to reorganize
- **Click "Update Hierarchy"**: AI regenerates only dirty portions
- **Clean parts preserved**: Unchanged sections stay intact

### Depth Levels Explained
- **3 levels**: Root → Topic Groups → Sentences
- **4 levels**: Root → Main Topics → Subtopics → Sentences
- **5 levels**: Root → Themes → Topics → Subtopics → Sentences
- **6 levels**: Root → Parts → Themes → Topics → Subtopics → Sentences

## 🤖 AI Integration

### Model
Uses **Claude** for fast, intelligent document organization.

### How AI Organizes Content
The AI analyzes your sentences and:
1. **Groups consecutive sentences** by topic into Level 2 nodes
2. **Creates higher-level groupings** based on your depth setting
3. **Generates descriptive titles** for each grouping
4. **Produces a document title** based on overall content
5. **Maintains sentence order** - never reorders your text

### Incremental Updates (Dirty Tracking)
When you make changes:
- System identifies the smallest affected subtree
- Only that subtree is sent to AI for regeneration
- Rest of the hierarchy remains unchanged
- Faster and more efficient than full regeneration

Example: If you edit one sentence in a 100-sentence document, only that sentence's parent nodes are regenerated (maybe 5-10 sentences), not all 100.

## 🎨 Emotion System

Based on Plutchik's Wheel of Emotions:
- Click the pen icon (✏️) on any sentence node
- Choose from 16 emotions in a circular layout
- Adjust intensity slider (0-100%)
- Node colors change based on emotion/intensity
- Emotions persist across edits and reorganizations

## 🔧 Technical Details

### Sentence Objects
```javascript
{
  id: "uuid-v4",           // Unique identifier
  type: "sentence",
  content: "Your text.",   // The actual sentence
  startIdx: 0,             // Position in document (computed)
  endIdx: 14,              // End position (computed)
  punctuation: ".",        // Ending punctuation
  delimiter: "space",      // What follows (space/newline/paragraph)
  emotion: "joy",          // Optional metadata
  intensity: 0.8           // Optional (0-1)
}
```

### Hierarchy Metadata
```javascript
sentences._hierarchyMeta = {
  rootTitle: "Document Title",
  maxLevel: 2,             // Highest grouping level (depth-1)
  nodes: [                 // Grouping nodes at levels 2+
    {
      id: "uuid",
      level: 2,
      label: "Topic Title",
      childIds: ["sentence-uuid-1", "sentence-uuid-2"]
    }
  ],
  dirtyNodeIds: ["..."],   // Nodes needing regeneration
  dirtySentenceIds: ["..."] // Modified sentences
}
```

### Tech Stack
- **React 19** with hooks
- **ReactFlow 11** for graph visualization
- **ELK.js** for automatic hierarchical layout
- **D3-force** for physics simulation
- **Framer Motion** for animations
- **Tailwind CSS 4** for styling
- **Claude** for AI organization

## 📚 Key Files

- **`src/App.jsx`** - Main app, manages sentence state
- **`src/utils/sentenceEditor.js`** - Text editing, reordering logic
- **`src/utils/hierarchyIntegration.js`** - AI hierarchy integration
- **`src/utils/dirtyTracking.js`** - Dirty node tracking system
- **`src/services/claude/`** - AI service integration
  - `claudeApi.js` - API calls to Claude
  - `promptBuilder.js` - Constructs AI prompts
  - `responseValidator.js` - Validates AI responses
  - `dirtyNodeFinder.js` - Identifies dirty subtrees

## 🔮 Future Enhancements

- [ ] AI-powered emotion-based rewriting
- [ ] Direct text editing in tree nodes
- [ ] Advanced sentence operations (merge, split)
- [ ] Export to various formats (Markdown, JSON, etc.)
- [ ] Undo/redo system with hierarchy support
- [ ] Collaborative editing
- [ ] Custom grouping rules

## 🐛 Known Edge Cases

The system includes defensive measures for:
- **ID collisions**: AI-generated IDs that conflict with existing nodes
- **Missing sentences**: Sentences not covered by any dirty subtree
- **Node ordering**: Ensures document order is maintained after updates
- **Orphaned nodes**: Validation prevents nodes without parents

All edge cases are logged to console with detailed diagnostics.

## 📖 Documentation

See `ARCHITECTURE.md` for detailed technical documentation.

## 📚 References

Izard, C. E. (1997). *The Maximally Discriminative Facial Movement Coding System (MAX)*. Newark: University of Delaware, Instructional Resources Center.

The Differential Emotions Scale (DES) is a well-validated instrument for measuring discrete emotions. For more information:
- Izard, C. E., Libero, D. Z., Putnam, P., & Haynes, O. M. (1993). Stability of emotion experiences and their relations to traits of personality. *Journal of Personality and Social Psychology*, 64(5), 847-860.

## 🤝 Contributing

This is an experimental project exploring bidirectional text editing with AI-powered organization.

## 📄 License

MIT