# AI Integration Guide

## Overview

Vibe Editor now includes AI-powered hierarchical document organization using Claude's Haiku 3.5 model. This feature automatically analyzes your text and creates a multi-level organizational structure.

## Setup

### 1. Get Your Claude API Key

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-...`)

### 2. Configure Environment

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
VITE_CLAUDE_API_KEY=sk-ant-api03-your-actual-key-here
```

**Security Note**: The `.env` file is automatically ignored by git and will never be committed.

### 3. Restart the Development Server

If the server is running, restart it to load the environment variables:

```bash
# Stop the server (Ctrl+C)
npm run dev
```

## Using the AI Hierarchy Feature

### Step 1: Write Your Content

Type or paste your text in the left pane. The text will automatically be split into sentences.

Example:
```
Climate change poses significant challenges to global food security.
Rising temperatures and changing precipitation patterns affect crop yields.

Developing drought-resistant crops is one solution.
International cooperation on climate policy is essential.

Agricultural innovation is crucial for adaptation.
Scientists are developing new crop varieties.
These innovations may help farmers cope with climate extremes.
```

### Step 2: Set the Depth

Use the **Depth** slider in the header to choose how many organizational levels you want (3-6):

- **3 levels**: Document → Groups → Sentences
- **4 levels**: Document → Topics → Groups → Sentences  
- **5 levels**: Document → Main Topics → Subtopics → Groups → Sentences
- **6 levels**: Document → Theme → Main Topics → Subtopics → Groups → Sentences

### Step 3: Generate Hierarchy

Click the **"Generate Hierarchy"** button (purple, with lightning bolt icon).

The AI will:
1. Analyze your sentences
2. Group related sentences together (e.g., by paragraph or topic)
3. Create meaningful labels for each group
4. Build higher-level abstractions
5. Generate an overall document title

### Step 4: View the Result

The tree visualization will update to show:
- Your sentences at the bottom level
- Intermediate groupings with AI-generated topic labels
- The document title at the root

## How It Works

### The Hierarchy Structure

The AI creates a bottom-up hierarchy:

1. **Level 1 (bottom)**: Your original sentences
2. **Level 2**: Groups of related sentences with topics
   - e.g., "Climate Impact on Agriculture", "Adaptation Solutions"
3. **Level 3+**: Higher-level groupings of the level-2 groups
   - e.g., "Climate Challenges", "Innovation Response"
4. **Root (top)**: Overall document title
   - e.g., "Agricultural Adaptation to Climate Change"

### Preserving Your Work

- **Sentence content is never modified** - the AI only creates groupings
- **Emotion metadata is preserved** - emotions on sentences remain intact
- **Text editing clears hierarchy** - if you add/remove sentences, you'll need to regenerate
- **Reordering clears hierarchy** - dragging nodes invalidates the structure

## API Usage & Costs

### Model Information
- **Model**: Claude 3.5 Haiku (claude-3-5-haiku-20241022)
- **Speed**: Very fast responses (typically 1-3 seconds)
- **Cost**: ~$0.001 per request (approximate, depends on text length)

### What Gets Sent to Claude
- Sentence content only (no personal metadata)
- Requested depth level
- No emotion data or other metadata

### Privacy
- API calls go directly from your browser to Anthropic
- No intermediate servers
- Your API key is stored locally only (never sent to our servers)

**Production Note**: For production use, API calls should be proxied through a backend server to protect your API key.

## Troubleshooting

### "Claude API key not configured" Error

**Solution**: Make sure you've created a `.env` file with your API key and restarted the dev server.

### "Failed to generate hierarchy" Error

**Possible causes**:
1. Invalid API key - check your `.env` file
2. No text content - add some sentences first
3. API rate limit - wait a moment and try again
4. Network error - check your internet connection

**Debug**: Open browser console (F12) to see detailed error messages.

### Hierarchy Doesn't Show

**Causes**:
1. API call might have failed - check console for errors
2. Response parsing failed - the AI response wasn't in expected format

**Solution**: Try generating again. If it persists, check console logs.

### Hierarchy Disappeared

**This is normal** if you:
- Edited the text (added/removed sentences)
- Reordered sentences by dragging nodes

**Solution**: Click "Generate Hierarchy" again to recreate it.

## Tips for Best Results

1. **Write clear, complete sentences** - the AI works better with well-structured text
2. **Use appropriate depth** - 3-4 levels work well for most documents
3. **Group related content** - put related sentences near each other in the text
4. **Regenerate as needed** - after significant edits, regenerate the hierarchy
5. **Experiment with depth** - try different depths to see what works best

## Examples

### Short Document (3 levels)
```
Text: 3 sentences about a single topic
Depth: 3
Result: Root → 1 group → 3 sentences
```

### Medium Document (4 levels)
```
Text: 10-20 sentences about related topics
Depth: 4
Result: Root → 2-3 main topics → 5-7 groups → sentences
```

### Long Document (5-6 levels)
```
Text: 30+ sentences covering multiple themes
Depth: 5-6
Result: Root → themes → topics → subtopics → groups → sentences
```

## Limitations

1. **Browser-based API calls**: API key is exposed in browser (use backend proxy for production)
2. **No persistence**: Hierarchy is regenerated each time, not saved
3. **Text-only**: Images, tables, and other rich content not supported
4. **English-optimized**: Works best with English text (though supports other languages)
5. **Token limits**: Very long documents (1000+ sentences) may need to be split

## Future Enhancements

Potential improvements planned:
- [ ] Save/load hierarchy structures
- [ ] Manual hierarchy editing
- [ ] Backend API proxy for security
- [ ] Support for editing grouped content
- [ ] Collapse/expand levels in the tree
- [ ] Export hierarchy as outline or markdown

## Support

For issues or questions:
1. Check the browser console for detailed error logs
2. Verify your `.env` file is configured correctly
3. Ensure you have an active Anthropic API account
4. Check Anthropic's status page for service issues
