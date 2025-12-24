/**
 * BidirectionalEditor.jsx
 * 
 * Minimal dual-state editor
 * - sentences: array of text (left pane state)
 * - tree: hierarchical tree object (right pane state)
 * 
 * Convert buttons parse/build directly, no helpers
 */
import { applySentenceEdit } from '../utils/sentenceEditor';
import posthog from '../utils/posthog';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { useNavigate } from 'react-router-dom';
import ElkTree from '../components/Tree/ELKTree';
import { buildTree, sanitizeTreeDepth } from '../ClaudeAlternative/claudeAPI';
import { LEAF_NODE_LEVEL } from "../utils/constants";
import HistoryGraph from "../components/HistoryGraph/HistoryGraph";
import { ReactFlowProvider } from 'reactflow';
import { VerticalDivider } from '../components/VerticalDivider';
import { exportFile } from '../components/Import/Export/Export';
import { importTxt } from '../components/Import/Export/Import';
import { refreshEmotionsInModifiedSubtree } from '../utils/EmotionUpdate';
import { tr } from 'framer-motion/client';
import {   refreshNode,
  reattachTrailingToLeaves,
  addYCoord,
  collectLeavesInOrder,
  diffSentences,
  applyDiffToTree,
  hasModified,
  rebuildSubtree,
  extractSentencesFromSubtree} from '../pages/EditorUtils.js';

const RANDOM_POETRY = `The world shifts between wonder and despair. Some mornings I rise with a flame burning through my thoughts. Other days I feel the cold gravity of a thousand unspoken fears. Yet a quiet voice reminds me that chaos has its own hidden rhythm. And even in the fracture of the heart, something stubborn and beautiful refuses to disappear.`;
const RANDOM_TEXT = `The day began with a gentle sense of positivity, as if something good waited quietly beneath the surface. Still, a negative undertone drifted in now and then, reminding me that not everything sits as steadily as I wish. Most moments passed in a neutral haze — footsteps on pavement, distant voices, the ordinary rhythm of moving forward. But at one point, a realization struck with sharp emphasis, cutting through everything else and demanding attention. And as evening settled, an uncertain question lingered in the air, leaving me wondering what tomorrow might shape from all of this.`
const POETRY = `The day doesn’t begin—
it resumes.
Light leans against buildings
the way a thought leans against doubt,
carefully,
as if it might slip.

People move with practiced certainty,
carrying names, keys, intentions,
all the small proofs
that something is expected of them.
A window opens somewhere.
A sentence is abandoned halfway through.`
function createNode(id, label, children = [], level = 0, isModified = false, emotion = "NEUTRAL") {
  return {
    id: id,
    label: label,
    level: level,
    children: children,
    isModified: isModified,
    emotion: emotion,
    content: '',
    trailing: '',
    originalContent: '' // Tracks the original content at last sync point
  };
}

function removeEmptyBranches(node, isRoot = false) {
  let removedSomething = false;

  function walk(n, isRoot) {
    if (!n) return null;

    if (!n.children || n.children.length === 0) {
      if (!isRoot && n.level !== LEAF_NODE_LEVEL) {
        removedSomething = true;
        return null;
      }
      return n;
    }

    const newChildren = n.children
      .map(ch => walk(ch, false))
      .filter(Boolean);

    if (!isRoot && n.level !== LEAF_NODE_LEVEL && newChildren.length === 0) {
      removedSomething = true;
      return null;
    }

    // IMPORTANT: only recreate if children actually changed
    if (newChildren.length === n.children.length &&
        newChildren.every((c, i) => c === n.children[i])) {
      return n;
    }

    return { ...n, children: newChildren };
  }

  const result = walk(node, isRoot);
  return { tree: result ?? node, removedSomething };
}






function sanitizeTreeOnce(root) {
  let changed = false;

  function walk(node, isRoot = false) {
    if (!node || !node.children) return node;

    const nextChildren = [];
    for (const ch of node.children) {
      const cleaned = walk(ch, false);
      if (cleaned) nextChildren.push(cleaned);
      else changed = true;
    }

    // remove empty non-leaf, but never root
    if (!isRoot && node.level !== LEAF_NODE_LEVEL && nextChildren.length === 0) {
      changed = true;
      return null;
    }

    // preserve identity if nothing changed
    if (nextChildren === node.children) return node;

    return { ...node, children: nextChildren };
  }

  const nextRoot = walk(root, true);
  return { tree: nextRoot ?? root, changed };
}


function textToSentences(text) {
  // Returns tokens preserving exact whitespace/newlines AFTER each sentence chunk.
  // "content" includes the sentence (and punctuation), "trailing" is whatever comes next.
  const tokens = [];
  if (typeof text !== "string" || text.length === 0) return tokens;

  // Split into (sentence-ish chunk)(trailing whitespace) pairs.
  // This is a pragmatic rule: it treats a "sentence" as up to and including a terminal punctuation,
  // and captures ALL following whitespace as trailing.
  const re = /([\s\S]*?[.!?])(\s+|$)/g;

  let lastIndex = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    const content = m[1] ?? "";
    const trailing = m[2] ?? "";
    tokens.push({ content, trailing });
    lastIndex = re.lastIndex;
  }

  // If there's leftover text without terminal punctuation, keep it as a final token
  // (still preserving any trailing whitespace).
  if (lastIndex < text.length) {
    tokens.push({ content: text.slice(lastIndex), trailing: "" });
  }

  // Drop tokens that are only whitespace (optional safety)
  return tokens.filter(t => (t.content + t.trailing).trim().length > 0);
}





function splitWithSeparators(text) {
  const regex = /([\s\S]*?)(\s*(?=[.!?]|$))/g;
  const result = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    result.push({
      content: match[1],
      trailing: match[2]
    });
  }

  return result;
}

function applyLeafEdits(oldText, leaves) {
  let result = oldText;

  // apply edits from bottom → top so indices stay valid
  const sorted = [...leaves].sort(
    (a, b) => (b.start ?? 0) - (a.start ?? 0)
  );

  for (const leaf of sorted) {
    if (leaf.start == null || leaf.end == null) continue;

    result =
      result.slice(0, leaf.start) +
      leaf.content +
      result.slice(leaf.end);
  }

  return result;
}

function markTreeModified(node) {
  if (!node) return node;
  const updated = { ...node, isModified: true };
  if (node.children) {
    updated.children = node.children.map(markTreeModified);
  }
  return updated;
}

export default function BidirectionalEditor() {
  const [textAreaContent, setTextAreaContent] = useState('');
  const [tree, setTree] = useState(undefined);
  const [maxDepth, setMaxDepth] = useState(4);
  const [isTreeRendering, setisTreeRendering] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffTokens, setDiffTokens] = useState([]);
  const [diffTitle, setDiffTitle] = useState('Review changes before commit');
  const [pendingCommitText, setPendingCommitText] = useState('');
  const navigate = useNavigate();
  const historyGraphRef = useRef(null);
  const lastPunctPosRef = useRef(-1); // Track last . ! ? position
  const [exportFormat, setExportFormat] = useState('txt'); // default to txt
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("vibe_text");
  const committedTextRef = useRef('');
  const [hasCommitted, setHasCommitted] = useState(false);
  const lastSyncedTreeRef = useRef(null);
  const isSyncingToTextRef = useRef(false);
  const initialTreeMarkedRef = useRef(false);
  const prevTreeTextRef = useRef("")
  const [leftPct, setLeftPct] = useState(50); // vertical divider
  const horizontalContainerRef = useRef(null);
  const draggingVerticalRef = useRef(false);


  // ---------------------------------------------------------------
  // Add drag logic for vertical divider (between left/right panes)
  // ---------------------------------------------------------------
  useEffect(() => {
    const onMove = (clientX) => {
      if (draggingVerticalRef.current && horizontalContainerRef.current) {
        const rect = horizontalContainerRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(clientX, rect.left), rect.right);
        const pct = ((x - rect.left) / rect.width) * 100;
        const clamped = Math.min(80, Math.max(20, pct));
        setLeftPct(clamped);
      }
    };

    const handleMouseMove = (e) => onMove(e.clientX);
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX);
    };
    const endDrag = () => {
      draggingVerticalRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', endDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, []);

  // Handler for vertical drag start
  const onVerticalHandleMouseDown = (e) => {
    e.preventDefault();
    draggingVerticalRef.current = true;
  };
  // ---------------------------------------------------------------

  



  const handleInsertExample = () => {
    const exampleText = RANDOM_TEXT + "\n\n" + RANDOM_POETRY;

    // 1) put text in textarea
    setTextAreaContent(exampleText);

    // 2) ensure a root exists
    let root = tree;
    if (!root) {
      root = createDummyRootNode();
      setTree(root);
    }

    // 3) sync text into tree ONCE
    // use microtask so React has applied state
    queueMicrotask(() => {
      syncTextToTree(exampleText);
    });
  };



  const recordCommit = (commitText, title = "Text updated") => {
    historyGraphRef.current?.addCommit(
      { text: commitText },
      title
    );
    committedTextRef.current = commitText;
    setHasCommitted(true);

    // Clear all isModified flags after committing
    if (tree) {
      const clearModifiedFlags = (node) => {
        if (!node) return node;
        const cleaned = {
          ...node,
          isModified: false
        };
        if (node.children) {
          cleaned.children = node.children.map(clearModifiedFlags);
        }
        return cleaned;
      };
      const cleanedTree = clearModifiedFlags(tree);
      setTree(cleanedTree);
    }
  };

  const handleCommitClick = () => {
    const currentText = textAreaContent ?? '';

    if (!currentText.trim()) {
      alert('Nothing to commit yet.');
      return;
    }

    if (!hasCommitted) {
      recordCommit(currentText, 'Initial commit');
      return;
    }

    const previousText = committedTextRef.current ?? '';

    if (previousText === currentText) {
      alert('No changes since last commit.');
      return;
    }

    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(previousText, currentText);
    dmp.diff_cleanupSemantic(diffs);

    setDiffTokens(diffs);
    setDiffTitle('Review changes before commit');
    setPendingCommitText(currentText);
    setShowDiffModal(true);
  };

  // Create a default dummy root node
  const createDummyRootNode = () => ({
    id: 'root',
    label: 'Document Root',
    content: 'Document Root',
    level: maxDepth,
    children: [],
    isModified: false,
    emotion: "NEUTRAL",
    y_coord: 0,
    trailing: "",
    originalContent: 'Document Root' // Track original on creation
  });

  const handleRevertComplete = (revertedTextAreaContent) => {
    console.log(revertedTextAreaContent)
    setTextAreaContent(revertedTextAreaContent.text);
    renderFullTree();
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 1: TEXT → TREE
  // ═══════════════════════════════════════════════════════════════

  const renderFullTree = async () => {
    console.log('[BidirectionalEditor] Converting text to tree...', textAreaContent);
    //setTree(undefined)
    setisTreeRendering(true);
    // Build sentences as leaf nodes
    const tokens = textToSentences(textAreaContent);
    const sentences = tokens.map(t => t.content);

    console.log('[BidirectionalEditor] Extracted sentences:', sentences);
    try {
      // Ask the model to build a tree with `maxDepth` layers
      const aiRoot = await buildTree(sentences, maxDepth);
      console.log('[BidirectionalEditor] Claude returned tree:', aiRoot);

      const withTrailing = reattachTrailingToLeaves(aiRoot, tokens);
      const withCoords = addYCoord(withTrailing);
      //const sanitized = sanitizeTreeDepth(withCoords, maxDepth);
      setTree(withCoords);

    } catch (err) {
      //setTree(createDummyRootNode());
      console.error('[BidirectionalEditor] AI tree generation failed, falling back to simple layout:', err);
      alert("Failed to render Tree.\n" + err)
      // Fallback: same behavior as before (simple leaf-per-sentence)
      const sentenceNodes = sentences.map((sentence, i) => ({
        id: `s-${i}`,
        label: sentence.content,
        level: LEAF_NODE_LEVEL,
        y_coord: i,
        children: [],
        isModified: false,
        emotion: "NEUTRAL"
      }));
      const rootNode = createNode('Document', "Root", [], maxDepth);
      //setTree(rootNode);
    }
    setisTreeRendering(false);
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 2: TREE → TEXT (flatten tree back to sentences)
  // ═══════════════════════════════════════════════════════════════

  // Helper: Extract text from tree (leaf-only)
  // Recursively collects only leaf nodes (level === LEAF_NODE_LEVEL),
  // sorts them by y_coord, and concatenates their content.
  const extractTextFromTree = (treeNode) => {
    if (!treeNode) return "";

    const leaves = [];
    const collect = (node) => {
      if (!node) return;
      if (node.level === LEAF_NODE_LEVEL) {
        leaves.push(node);
      } else if (node.children && node.children.length > 0) {
        node.children.forEach(collect);
      }
    };
    collect(treeNode);

    console.log(
      '[BidirectionalEditor] Extracted leaf nodes for text conversion:',
      leaves
    );

    return leaves
      .map((n, i) => {
        const content = String(n.content ?? "");
        let trailing = String(n.trailing ?? "");

        // 🔒 invariant: never glue sentences together
        if (trailing === "" && i < leaves.length - 1) {
          trailing = " ";
        }

        return content + trailing;
      })
      .join("");
  };

  // Main method: Convert tree to text (extract only, don't modify tree)
  const convertTreeToText = () => {
    if (!tree) return;

    // Extract text from tree and apply to textarea
    const newText = extractTextFromTree(tree);
    setTextAreaContent(newText);
  };

  // ═══════════════════════════════════════════════════════════════
  // REFRESH TREE: Regenerate subtrees with modified children using Claude (preserve ids/levels/contents)
  // ═══════════════════════════════════════════════════════════════
  // Clear all isModified flags in the tree
  const handleClearModified = () => {
        if (!tree) return;
        const clearModifiedFlags = (node) => {
          if (!node) return node;
          const cleaned = {
            ...node,
            isModified: false
          };
          if (node.children) {
            cleaned.children = node.children.map(clearModifiedFlags);
          }
          return cleaned;
        };
        setTree(clearModifiedFlags(tree));
  };

  const handleRefreshTree = async () => {

    if (!tree) return;

    setisTreeRendering(true);

    // FIRST see if any subtrees are modified. If not: Full rerender
    const modified = hasModified(tree);
    if (!modified) {
      //alert("FULL RERENDER: No modified subtrees detected.");
      console.log('[BidirectionalEditor] No modified subtrees detected, performing full tree render instead.');
      renderFullTree().finally(() => {
        setisTreeRendering(false);
      });
      return;
    }

    console.log('[BidirectionalEditor] Refreshing modified subtrees in tree...', tree);


    try {
      const refreshed = await refreshNode(tree, maxDepth);
      const clearModified = (n) => ({
        ...n,
        isModified: false,
        children: n.children?.map(clearModified) ?? []
      });
      setTree(clearModified(refreshed));
      console.log('[BidirectionalEditor] Refreshed modified subtrees in tree.', refreshed);
      console.log('[BidirectionalEditor] New tree:', tree);
    } finally {
      setisTreeRendering(false);
      convertTreeToText()
    }
  };


  useEffect(() => {

    setTextAreaContent("");
    setTree(createDummyRootNode());
  }, []);


  useEffect(() => {
    if (!tree) return;
    if (!textAreaContent) return;
    renderFullTree();
  }, [maxDepth]);

  // AUTO APPLY TREE CHANGES TO TEXTAREA
  useEffect(() => {
    if (!tree) return;

    const { tree: cleaned, removedSomething } =
      removeEmptyBranches(tree, true);

    // 🚨 CRITICAL: only update if something was actually removed
    if (removedSomething) {
      setTree(cleaned);
      return;
    }

    if (tree === lastSyncedTreeRef.current) return;

    // Check if tree has any leaf nodes
    const leaves = [];
    const collectLeaves = (node) => {
      if (!node) return;
      if (node.level === LEAF_NODE_LEVEL) {
        leaves.push(node);
        return;
      }
      if (node.children) node.children.forEach(collectLeaves);
    };
    collectLeaves(tree);
    if (leaves.length === 0) {
      lastSyncedTreeRef.current = tree;
      return; // Skip if no leaves yet
    }
    console.log('[BidirectionalEditor] Tree changed, syncing to text...', leaves.length, 'leaves');
    const newText = extractTextFromTree(tree);
    
    // Mark that we're syncing to prevent text change from triggering auto-leaf logic
    isSyncingToTextRef.current = true;
    lastSyncedTreeRef.current = tree;
    setTextAreaContent(newText);



  }, [tree]);

  useEffect(() => {
    if (hasCommitted) return;
    if (!textAreaContent || !textAreaContent.trim()) return;
    recordCommit(textAreaContent, 'Initial commit');
    syncTextToTree();
  }, [textAreaContent, hasCommitted]);



  // ═══════════════════════════════════════════════════
  // AUTO ADD NEW SENTENCE LEAF NODES WHEN TEXT CHANGES
  // vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv

    // Replace the entire handleTextChange with this instant version:
  const handleTextChange = (e) => {
    const newText = e.target.value;

    setTextAreaContent(newText);
    syncTextToTree(newText); // ✅ always fresh
  };
  
  function syncTextToTree(currentText) {
    if (!tree || isTreeRendering) return;
    const newSentences = textToSentences(currentText);

    const leaves = collectLeavesInOrder(tree);
    const oldSentences = leaves.map(leaf => ({
      content: leaf.content,
      trailing: leaf.trailing,
      leaf
    }));

    const diffOps = diffSentences(oldSentences, newSentences);
    console.log('[OPS] Detected sentence diffs:', diffOps);
    // BUG: TODO: When editing inline, once i type a delimiter, the actual old stuff gets added as a new sentence, and the new sentence repalces the old stuff.
    const updatedTree = applyDiffToTree(tree, diffOps);

    setTree(updatedTree);
  }






  // ═════════════════════════════════════════════════════════════════
  // IMPORT HANDLER
  // ═════════════════════════════════════════════════════════════════
  const handleImport = async (e) => {
    const file = e.target.files[0]; 
    if (!file) return;

    const importedText = await importTxt(file);
    setTextAreaContent(importedText);

    e.target.value = null; // Reset file input
  };

  // ═══════════════════════════════════════════════════════════════
  // EXPORT HANDLER
  // ═══════════════════════════════════════════════════════════════


  const handleOpenExportDialog = () => {
    const currentText = String(textAreaContent ?? "");
    if (!currentText.trim()) {
      alert("Please add some text before exporting");
      return;
    }
    setExportFilename("vibe_text");
    setExportFormat("txt");
    setIsExportDialogOpen(true);
  };

  const handleConfirmExport = () => {
    exportFile(textAreaContent, exportFormat, exportFilename || "vibe_text");
    setIsExportDialogOpen(false);
  };

  const handleCancelExport = () => {
    setIsExportDialogOpen(false);
  };


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{ display: 'flex', backgroundColor: "#ffffff", flexDirection: 'column', height: '100vh', gap: '8px', padding: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '40px' }}>

        <button
          onClick={() => {
            setTree(createDummyRootNode());
            setTextAreaContent("");
          }}
          disabled={isTreeRendering}
          style={{
            padding: '6px 12px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Clear
        </button>
        <button
          onClick={handleCommitClick}
          disabled={isTreeRendering}
          style={{
            padding: '6px 12px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Commit
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
          title="View analytics"
        >
          📊 Stats
        </button>
        <button
          onClick={handleInsertExample}
          disabled={isTreeRendering}
          style={{
            padding: '6px 10px',
            backgroundColor: 'transparent',
            color: '#6b7280',          // gray-500
            border: '1px dashed #d1d5db',
            borderRadius: '6px',
            fontSize: '11px',
            fontStyle: 'italic',
            cursor: 'pointer',
            opacity: 0.85,
            transition: 'all 0.2s ease',
          }}
        >
          Insert example
        </button>

        {/* NEU: Import-„Button“ */}
        <label 
          title="Import"
          aria-label="Import"
          className="w-9 h-9 inline-flex items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm cursor-pointer border border-emerald-700"
        >
          {/* Upload icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>

          <input
            type="file"
            accept=".txt"
            onChange={handleImport}
            className="hidden"
          />
        </label>
        
        {/* NEU: Export-Button */}
        <button
          onClick={handleOpenExportDialog}
          title="Export"
          aria-label="Export"
          className="w-9 h-9 inline-flex items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm border border-indigo-700"
        >
          {/* Download icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </button>
        
        {/* Max Depth Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <label htmlFor="maxDepth" style={{ fontSize: '12px', color: '#374151', fontWeight: '500' }}>
            Max Depth:
          </label>
          <select
            id="maxDepth"
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            disabled={isTreeRendering}
            style={{
              padding: '6px 12px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: isTreeRendering ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>

          </select>
        </div>
      </div>


      {/* Main content */}
      <div
        ref={horizontalContainerRef}
        style={{ display: 'flex', gap: '0', flex: 1, minHeight: 0 }}
      >
        {/* LEFT: Text Pane */}
        <div style={{flexBasis: `${leftPct}%`, minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <textarea
            value={textAreaContent}
            onChange={handleTextChange}
            placeholder="Insert text here..."
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              fontFamily: 'monospace',
              fontSize: '13px',
              resize: 'none',
              outline: 'none',
              color: '#000',
            }}
          />

        </div>


        {/* Draggable Divider */}
        <VerticalDivider
          direction={1}
          onMouseDown={onVerticalHandleMouseDown}
          onTouchStart={onVerticalHandleMouseDown}
        />

        {/* RIGHT: Tree Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <button
              onClick={handleRefreshTree}
              disabled={isTreeRendering || !tree}
              title="Update Tree Visual with AI"
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 100,
                width: '44px',
                height: '44px',
                padding: '0',
                backgroundColor: isTreeRendering || !tree ? '#555' : '#000',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                cursor: isTreeRendering || !tree ? 'not-allowed' : 'pointer',
                opacity: isTreeRendering || !tree ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {isTreeRendering ? (
                // SPINNER
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid white',
                    borderTop: '3px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}
                />
              ) : (
                // CIRCULAR ARROW SVG
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              )}
            </button>
            <button
              onClick={handleClearModified}
              disabled={!tree}
              title="Clear all modified flags"
              style={{
                position: 'absolute',
                top: '12px',
                left: '64px',
                zIndex: 100,
                width: '44px',
                height: '44px',
                padding: '0',
                backgroundColor:'#000',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                cursor: !tree ? 'not-allowed' : 'pointer',
                opacity: !tree ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {/* Eraser SVG icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="17" width="13" height="4" rx="2" />
                <path d="M21 3a2.828 2.828 0 0 0-4 0L3 17l4 4 14-14a2.828 2.828 0 0 0 0-4z" />
              </svg>
            </button>

            {tree ? (
              <ReactFlowProvider>
                <ElkTree tree={tree} setTree={setTree} />
              </ReactFlowProvider>

            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>

              </div>
            )}
          </div>
        </div>
      </div>
      <HistoryGraph ref={historyGraphRef} onRevertComplete={handleRevertComplete} />

      {showDiffModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ width: '88%', maxWidth: '980px', background: '#ffffff', color: '#0f172a', borderRadius: '12px', boxShadow: '0 15px 40px rgba(0,0,0,0.25)', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.2px' }}>{diffTitle}</div>
              <button onClick={() => { setPendingCommitText(''); setShowDiffModal(false); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', color: '#6b7280', fontSize: '12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#dcfce7', border: '1px solid #22c55e', borderRadius: '2px' }}></span>
                  Added
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '2px' }}></span>
                  Removed
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '2px' }}></span>
                  Unchanged
                </span>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', maxHeight: '56vh', overflow: 'auto' }}>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: '13px', lineHeight: 1.6, padding: '12px' }}>
                  {(!diffTokens || diffTokens.length === 0) && (
                    <div style={{ color: '#6b7280' }}>No differences</div>
                  )}
                  {diffTokens && diffTokens.map((d, i) => {
                    const [op, text] = d; // op: -1 delete, 0 equal, 1 insert
                    const isDel = op === -1;
                    const isIns = op === 1;
                    const style = isIns
                      ? { backgroundColor: '#dcfce7', color: '#14532d', padding: '0 2px', borderRadius: '3px' }
                      : isDel
                        ? { backgroundColor: '#fee2e2', color: '#7f1d1d', textDecoration: 'line-through', padding: '0 2px', borderRadius: '3px' }
                        : { backgroundColor: '#f3f4f6', color: '#111827', padding: '0 2px', borderRadius: '3px' };
                    return (
                      <span key={i} style={style}>{text}</span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setPendingCommitText(''); setShowDiffModal(false); }}
                style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', color: '#111827', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const textToCommit = pendingCommitText || textAreaContent;
                  recordCommit(textToCommit, 'Text updated');
                  setPendingCommitText('');
                  setShowDiffModal(false);
                  setDiffTokens([]);
                }}
                style={{ padding: '8px 14px', backgroundColor: '#111827', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Commit changes
              </button>
            </div>
          </div>
        </div>
      )}
      {isExportDialogOpen && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Export text
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                File name
              </label>
              <input
                type="text"
                value={exportFilename}
                onChange={(e) => setExportFilename(e.target.value)}
                placeholder="vibe_text"
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                Format
              </span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="txt"
                    checked={exportFormat === "txt"}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  .txt
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="pdf"
                    checked={exportFormat === "pdf"}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  .pdf
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="docx"
                    checked={exportFormat === "docx"}
                    onChange={(e) => setExportFormat(e.target.value)}
                  />
                  .docx
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCancelExport}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExport}
                className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}