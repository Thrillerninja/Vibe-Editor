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

### Installation

```bash
npm install
```

### AI Configuration (Optional)

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

### Tree Structure

The tree now supports **AI-generated hierarchical organization**:

```
Root (Document Title)
  ├── Level N (High-level topics)
  │   ├── Level N-1 (Subtopics)
  │   │   └── ...
  │   └── Level 2 (Paragraphs/Groups)
  │       ├── Sentence 1
  │       ├── Sentence 2
  │       └── Sentence 3
  └── ...
```

**Depth Levels:**
- **3 levels**: Root → Groups → Sentences
- **4 levels**: Root → Topics → Groups → Sentences
- **5 levels**: Root → Main Topics → Subtopics → Groups → Sentences
- **6 levels**: Root → Theme → Main Topics → Subtopics → Groups → Sentences

Use the **"Generate Hierarchy"** button to have Claude automatically organize your document into meaningful levels based on content!

## 🤖 AI Features

### Hierarchical Document Organization

1. **Write your content** in the text editor
2. **Adjust the depth slider** (3-6 levels) to set how many levels of organization you want
3. **Click "Generate Hierarchy"** to have Claude analyze and organize your content
4. **View the structured tree** showing topics, subtopics, and groupings

The AI will:
- Group sentences into logical paragraphs/sections
- Create meaningful topic labels for each group
- Build higher-level abstractions based on the depth you choose
- Generate an overall document title

**Note**: Editing text or reordering sentences after hierarchy generation will clear the hierarchy (you'll need to regenerate).

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
