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
import { buildTree } from '../ClaudeAlternative/claudeAPI';
import { LEAF_NODE_LEVEL } from "../utils/constants";
import HistoryGraph from "../components/HistoryGraph/HistoryGraph";
import { ReactFlowProvider } from 'reactflow';
import { exportFile } from '../components/Import/Export/Export';
import { importTxt } from '../components/Import/Export/Import';
import { refreshEmotionsInModifiedSubtree } from '../utils/EmotionUpdate';
import { tr } from 'framer-motion/client';

const RANDOM_POETRY = `The world shifts between wonder and despair. Some mornings I rise with a flame burning through my thoughts. Other days I feel the cold gravity of a thousand unspoken fears. Yet a quiet voice reminds me that chaos has its own hidden rhythm. And even in the fracture of the heart, something stubborn and beautiful refuses to disappear.`;
const RANDOM_TEXT = `The day began with a gentle sense of positivity, as if something good waited quietly beneath the surface. Still, a negative undertone drifted in now and then, reminding me that not everything sits as steadily as I wish. Most moments passed in a neutral haze — footsteps on pavement, distant voices, the ordinary rhythm of moving forward. But at one point, a realization struck with sharp emphasis, cutting through everything else and demanding attention. And as evening settled, an uncertain question lingered in the air, leaving me wondering what tomorrow might shape from all of this.`


function createNode(id, label, children = [], level = 0, isModified = false, emotion = "NEUTRAL") {
  return {
    id: id,
    label: label,
    level: level,
    children: children,
    isModified: isModified,
    emotion: emotion,
    content: '',
    originalContent: '' // Tracks the original content at last sync point
  };
}

function textToSentences(text) {
    // keep punctuation + whitespace exactly as-is
    return text.split(/(?<=[.!?]\s+)/).filter(s => s.replace(/\s/g, "") !== "");
}



function addYCoord(node) {
  if (!node) return node;

  const updated = {
    ...node,
    // Preserve isModified flag - don't clear it here
    y_coord: node.y_coord ?? 0   // default value
  };

  if (!node.children) return updated;

  return {
    ...updated,
    children: node.children.map(addYCoord)
  };
}




export default function BidirectionalEditor() {
  const [textAreaContent, setTextAreaContent] = useState('');
  const [tree, setTree] = useState(undefined);
  const [maxDepth, setMaxDepth] = useState(3);
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
    level: maxDepth - 1,
    children: [],
    isModified: false,
    emotion: "NEUTRAL",
    y_coord: 0,
    originalContent: 'Document Root' // Track original on creation
  });

  const handleRevertComplete = (revertedTextAreaContent) => {
    console.log(revertedTextAreaContent)
    setTextAreaContent(revertedTextAreaContent.text);
    convertTextToTree();
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 1: TEXT → TREE
  // ═══════════════════════════════════════════════════════════════

  const convertTextToTree = async () => {
    console.log('[BidirectionalEditor] Converting text to tree...', textAreaContent);
    //setTree(undefined)
    setisTreeRendering(true);
    // Build sentences as leaf nodes
    const sentences = textToSentences(textAreaContent)
    console.log('[BidirectionalEditor] Extracted sentences:', sentences);
    try {
      // Ask the model to build a tree with `maxDepth` layers
      const aiRoot = await buildTree(sentences, maxDepth);
      console.log('[BidirectionalEditor] Claude returned tree:', aiRoot);

      const withCoords = addYCoord(aiRoot);
      console.log('[BidirectionalEditor] After addYCoord (with isModified):', withCoords);
      
      setTree(withCoords);
    } catch (err) {
      setTree(createDummyRootNode());
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
    ensureTrailingWhitespace(treeNode);
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
    console.log('[BidirectionalEditor] Extracted leaf nodes for text conversion:', leaves);
    return leaves.map((n) => String(n.content)).join("");
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


    const ensureTrailingWhitespace = (node) => {
    if (!node) return node;

    if (node.level === LEAF_NODE_LEVEL && typeof node.content === "string") {
      if (!/\s$/.test(node.content)) {
        node = {
          ...node,
          content: node.content + " ",
          label: node.content + " "
        };
      }
    }

    if (node.children) {
      node = {
        ...node,
        children: node.children.map(ensureTrailingWhitespace)
      };
    }

    return node;
  };

  const handleRefreshTree = async () => {
    if (!tree) return;
    setisTreeRendering(true);

    var fullRerednerNeeded = false;
    for (const child of tree.children) {
      if (child.isModified ) {
        fullRerednerNeeded = true;
        console.log('Modified child node detected for refresh:', child);
      }
      console.log('Child node:', child);
    }

    if (fullRerednerNeeded ) {
      console.log('Starting tree refresh for modified subtrees...');
      convertTextToTree();
      return;
    }

    try {
      const { refreshedTree, dirtyCount, success } = await refreshEmotionsInModifiedSubtree(tree);


      ensureTrailingWhitespace(refreshedTree);

      const withCoords = addYCoord(refreshedTree);
      setTree(withCoords);

      if (!success) {
        alert(`Tree refresh partially completed. ${dirtyCount} node(s) failed and remain dirty for retry.`);
      }
    } catch (error) {
      alert('Failed to refresh tree: ' + error.message + '\n\nThe tree state has been preserved. You can try again.');
    } finally {
      setisTreeRendering(false);
    }
    console.log(tree)
  }

  useEffect(() => {
    const dummyText = RANDOM_TEXT + "\n\n" + RANDOM_POETRY;

    setTree(createDummyRootNode());
    setTextAreaContent(dummyText);
    syncTextToTree(dummyText);
  }, []);



  useEffect(() => {
    if (!tree) return;
    const updatedTree = {
      ...tree,
      isModified: true
    };
    setTree(updatedTree);
  }, [maxDepth]);

  // AUTO APPLY TREE CHANGES TO TEXTAREA
  useEffect(() => {

    //Skip if tree hasn't changed (same reference)
    if (!tree || tree === lastSyncedTreeRef.current) return;
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

  function similarity(a, b) {
    const minLen = Math.min(a.length, b.length);
    let samePrefix = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] !== b[i]) break;
      samePrefix++;
    }
    return samePrefix / Math.max(a.length, b.length);
  }


  
  function syncTextToTree(currentText) {
    if (!currentText) return;

    // keep punctuation + whitespace exactly as-is
    const sentences = textToSentences(currentText);
    
    // 1) Collect existing leaf nodes (in order)
    const leaves = [];
    const collect = (node) => {
      if (!node) return;
      if (node.level === LEAF_NODE_LEVEL) leaves.push(node);
      node.children?.forEach(collect);
    };
    collect(tree);

    // 2) Apply edits + additions
    setTree(prev => {
      const newLeaves = sentences.map((text, i) => {
        const old = leaves[i];

        // ─────────────────────────────
        // EXISTING NODE
        // ─────────────────────────────
        if (old) {
          const changed = text !== old.originalContent;
          
          return {
            ...old,
            content: text,
            label: text,
            // only mark modified if text changed
            isModified: changed,
            // preserve originalContent forever
            originalContent: old.originalContent
          };
        }

        // ─────────────────────────────
        // NEW NODE
        // ─────────────────────────────
        return {
          id: `leaf-${Date.now()}-${i}`,
          content: text,
          label: text,
          originalContent: text,
          level: LEAF_NODE_LEVEL,
          children: [],
          emotion: "NEUTRAL",
          isModified: true
        };
      });

      return {
        ...prev,
        children: newLeaves
      };
    });
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
            //setTree(createDummyRootNode());
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
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>
      </div>


      {/* Main content */}
      <div style={{ display: 'flex', gap: '0', flex: 1, minHeight: 0 }}>
        {/* LEFT: Text Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
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

        {/* CENTER */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '12px',
          width: '5px',
          alignItems: 'center',
          overflow: 'visible',
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>


        </div>

        {/* RIGHT: Tree Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <button
              onClick={handleRefreshTree}
              disabled={isTreeRendering || !tree}
              title="Update emotions in modified subtrees"
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