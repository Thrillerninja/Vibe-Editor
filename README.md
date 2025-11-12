# Vibe-Editor

A bidirectional text editor with dynamic tree visualization and emotion-based editing.

## 🎯 Core Concept

Vibe-Editor uses **sentences as the single source of truth**. Everything else (text display, tree visualization) is derived from the sentence array.

```
Sentences Array (SSOT)
       ↓
   ┌───┴───┐
   ↓       ↓
 Text    Tree
 Pane  Visualization
```

## ✨ Key Features

- **Direct Sentence Editing**: Type in the text pane, sentences update automatically
- **Tree Visualization**: See your text as an interactive node graph
- **Emotion Tagging**: Apply Plutchik emotions to individual sentences
- **Metadata Preservation**: Emotions persist across edits via smart matching
- **True Bidirectional Sync**: Changes in tree OR text automatically sync
- **Zero Duplication**: No separate text state - always derived

## 🏗️ Architecture

### Data Flow
1. **User types** → Text change detected
2. **applySentenceEdit()** → Sentences array updated directly
3. **buildTextFromSentences()** → Text pane auto-updates (derived)
4. **buildTreeFromSentences()** → Tree visualizes changes

### Tech Stack
- React 19.1 with hooks
- ReactFlow 11 for graph visualization
- ELK.js for automatic layout
- D3-force for physics simulation
- Framer Motion for animations
- Tailwind CSS 4 for styling

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:5173/`

## 📖 How It Works

### Sentence Objects
```javascript
{
  id: "sentence-0",
  type: "sentence",
  content: "This is a sentence.",
  startIdx: 0,
  endIdx: 19,
  emotion: "joy",      // Optional metadata
  intensity: 0.8       // Optional metadata
}
```

### Editing Flow
1. Type in textarea
2. System detects which sentences changed
3. Preserves emotion metadata for similar sentences (>80% match)
4. Updates tree visualization automatically

### Tree Structure (Current)
```
Root (Document)
  └── Sentence nodes (all sentences connected to root)
```

Future: Support for dynamic levels (chapters, sections, etc.)

## 🎨 Emotion System

Based on Plutchik's Wheel of Emotions:
- 16 emotions in circular layout
- Intensity from 0-100%
- Node colors change based on emotion/intensity
- Click pen icon on any node to set emotion

## 📚 Documentation

See `ARCHITECTURE.md` for detailed technical documentation.

## 🔮 Future Features

- [ ] Dynamic tree levels (configurable grouping)
- [ ] Direct text editing in tree nodes
- [ ] AI-powered emotion-based rewriting
- [ ] Advanced sentence operations (merge, split, reorder)
- [ ] Export to various formats
- [ ] Undo/redo system

## 🤝 Contributing

This is an experimental project exploring bidirectional text editing paradigms.

## 📄 License

MIT

---

Built with ❤️ using React + Vite
