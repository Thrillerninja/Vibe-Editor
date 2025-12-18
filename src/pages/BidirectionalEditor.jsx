/**
 * BidirectionalEditor.jsx
 * 
 * Minimal dual-state editor
 * - sentences: array of text (left pane state)
 * - tree: hierarchical tree object (right pane state)
 * 
 * Convert buttons parse/build directly, no helpers
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { useNavigate } from 'react-router-dom';
import ElkTree from '../components/Tree/ELKTree';
import { tr } from 'framer-motion/client';
import { buildTree, restructureSubtreePreservingIds } from '../ClaudeAlternative/claudeAPI';
import { LEAF_NODE_LEVEL } from "../utils/constants";
import HistoryGraph from "../components/HistoryGraph/HistoryGraph";
import { ReactFlowProvider } from 'reactflow';
import { exportFile } from '../components/Import/Export/Export';
import { importTxt } from '../components/Import/Export/Import';
import { applySentenceEdit } from '../utils/sentenceEditor';


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
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 0)
}

function treeSentencesToText(tree, currentTextareaContent) {
  console.log('[TEST] Converting tree back to text...', tree);
  if (!tree) {
    return "";
  }
  // Collect all sentences from tree in order
  const collectedNodes = [];
  const collectedSentences = [];
  const traverse = (node) => {
    if (node.level === LEAF_NODE_LEVEL) {
      // This is a sentence node
      collectedNodes.push(node);
      collectedSentences.push(node.content);
    } else if (node.children) {
      // Traverse children
      node.children.forEach(child => traverse(child));
    }
  };

  traverse(tree);
  const newText = collectedSentences.map(s => s).join(' ');
  return newText;
}

function addYCoord(node) {
  if (!node) return node;

  const updated = {
    ...node,
    // Preserve isModified flag - don't clear it here
    emotion: node.emotion ?? "NEUTRAL",
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
  const [diffTitle, setDiffTitle] = useState('Diff: Textarea vs Tree');
  const [diffMode, setDiffMode] = useState('inspect'); // 'inspect' | 'apply'
  const [pendingNewText, setPendingNewText] = useState('');
  const navigate = useNavigate();
  const historyGraphRef = useRef(null);
  const lastPunctPosRef = useRef(-1); // Track last . ! ? position

  const commit = () => {
    historyGraphRef.current?.addCommit(
      { text: textAreaContent },
      "Text updated"
    );
  }

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
    //setSentences(handleTextChange(revertedTextAreaContent.text))
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

  // Helper: Sync tree state after converting to text
  // - Sets isModified to false for all nodes
  // - Sets originalContent = content for all nodes (marks as committed)
  const syncTreeAfterTextConversion = (node) => {
    if (!node) return node;
    const synced = {
      ...node,
      isModified: false,
      originalContent: node.content
    };
    if (synced.children) {
      synced.children = synced.children.map(syncTreeAfterTextConversion);
    }
    return synced;
  };

  // Helper: Extract text from tree
  // - Collects all leaf nodes in order (sorted by y_coord)
  // - Returns the joined text
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

    leaves.sort((a, b) => (a.y_coord || 0) - (b.y_coord || 0));
    console.log('[BidirectionalEditor] Extracted leaf nodes for text conversion:', leaves);
    return leaves.map((n) => String(n.content)).join(" ");
  };

  // Main method: Convert tree to text and sync tree state
  const convertTreeToText = () => {
    if (!tree) return;

    // Extract text from tree
    const newText = extractTextFromTree(tree);
    console.log('[BidirectionalEditor] Converted tree back to text (preview only):', newText);

    // Show diff modal before applying
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(textAreaContent, newText);
    dmp.diff_cleanupSemantic(diffs);
    setDiffTokens(diffs);
    setDiffTitle('Apply: Tree → Text');
    setPendingNewText(newText);
    setDiffMode('apply');
    setShowDiffModal(true);
  };

  // ═══════════════════════════════════════════════════════════════
  // QUICK DIFF: TEXTAREA ↔ TREE
  // ═══════════════════════════════════════════════════════════════

  const showTextVsTreeDiff = () => {
    if (!tree) return;
    const treeText = extractTextFromTree(tree);
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(textAreaContent, treeText);
    dmp.diff_cleanupSemantic(diffs);
    setDiffTokens(diffs);
    setDiffTitle('Diff: Textarea vs Tree');
    setDiffMode('inspect');
    setPendingNewText('');
    setShowDiffModal(true);
  };

  // ═══════════════════════════════════════════════════════════════
  // REFRESH TREE: Regenerate subtrees with modified children using Claude (preserve ids/levels/contents)
  // ═══════════════════════════════════════════════════════════════

  const refreshEmotionsInModifiedSubtree = async () => {
    if (!tree) return;
    setisTreeRendering(true);
    console.log('[BidirectionalEditor] Refreshing tree...');

    // Deep-clear isModified flags in a subtree
    const clearModified = (node) => {
      if (!node) return node;
      const out = { ...node, isModified: false };
      if (out.children) out.children = out.children.map(clearModified);
      return out;
    };

    // Helper: Extract only dirty nodes from a subtree for restructuring
    const extractDirtySubtree = (node) => {
      if (!node) return null;

      // If this node itself is dirty, include it with all its children (dirty or not)
      // Claude needs the full context to reorganize the dirty node's children
      if (node.isModified === true) {
        return {
          ...node,
          children: node.children ? node.children.map(child => ({ ...child })) : []
        };
      }

      // If node is clean but has dirty children, we need to process those children
      if (!node.children || node.children.length === 0) {
        return null; // Leaf node, not dirty, skip
      }

      const dirtyChildren = node.children
        .map(child => extractDirtySubtree(child))
        .filter(Boolean);

      if (dirtyChildren.length === 0) {
        return null; // No dirty descendants
      }

      // Return node with only dirty children
      return {
        ...node,
        children: dirtyChildren
      };
    };

    // Helper: Merge restructured dirty nodes back into the clean tree
    const mergeRestructuredNodes = (originalNode, restructuredSubtree) => {
      if (!originalNode) return originalNode;
      if (!restructuredSubtree) return originalNode;

      // If the restructured subtree is for this node, replace it
      if (originalNode.id === restructuredSubtree.id) {
        // Merge: take label/emotion from restructured, preserve clean children
        const mergedChildren = (restructuredSubtree.children || []).map(restructuredChild => {
          const originalChild = (originalNode.children || []).find(c => c.id === restructuredChild.id);
          if (!originalChild) {
            // New child from restructuring (shouldn't happen with our constraints)
            return restructuredChild;
          }
          // Recursively merge
          return mergeRestructuredNodes(originalChild, restructuredChild);
        });

        return {
          ...originalNode,
          ...restructuredSubtree,
          children: mergedChildren,
          isModified: false // Clear dirty flag
        };
      }

      // This node wasn't restructured, but children might have been
      if (!originalNode.children || originalNode.children.length === 0) {
        return originalNode;
      }

      const mergedChildren = originalNode.children.map(child => {
        // Find if this child was restructured
        const findRestructured = (subtree) => {
          if (!subtree) return null;
          if (subtree.id === child.id) return subtree;
          if (!subtree.children) return null;
          for (const c of subtree.children) {
            const found = findRestructured(c);
            if (found) return found;
          }
          return null;
        };

        const restructuredChild = findRestructured(restructuredSubtree);
        return mergeRestructuredNodes(child, restructuredChild);
      });

      return {
        ...originalNode,
        children: mergedChildren
      };
    };

    // Recursive function to check and regenerate nodes with modified children
    const processNode = async (node) => {
      if (!node) return node;

      console.log('[BidirectionalEditor] Processing node:', node.id, 'isModified:', node.isModified);

      // If this node itself is modified (e.g., reordered or edited), regenerate it
      if (node.isModified === true) {
        try {
          console.log(`[BidirectionalEditor] Node ${node.id} is dirty, regenerating with Claude`);
          const regenerated = await restructureSubtreePreservingIds(node);
          const cleaned = clearModified(regenerated);
          return cleaned;
        } catch (e) {
          console.error('[BidirectionalEditor] Subtree regeneration failed for node', node.id, ':', e);
          // Keep the node with its dirty flag so user can retry
          return node;
        }
      }

      // Node is clean, but check if children need processing
      if (!node.children || node.children.length === 0) {
        return node; // Leaf node, nothing to do
      }

      // Check if any direct children are modified
      const hasModifiedChild = node.children.some(child => child.isModified === true);

      if (hasModifiedChild) {
        // This clean node has dirty children - only restructure the dirty ones
        // and preserve clean children exactly as-is (no label changes)
        console.log(`[BidirectionalEditor] Node ${node.id} is clean but has dirty children`);

        // Separate dirty and clean children
        const dirtyChildren = [];
        const cleanChildren = [];

        for (const child of node.children) {
          if (child.isModified === true) {
            dirtyChildren.push(child);
          } else {
            cleanChildren.push(child);
          }
        }

        console.log(`[BidirectionalEditor] Processing ${dirtyChildren.length} dirty children, preserving ${cleanChildren.length} clean children`);

        // Process dirty children - catch errors individually to preserve state
        const processedDirty = await Promise.all(
          dirtyChildren.map(async child => {
            try {
              return await processNode(child);
            } catch (e) {
              console.error(`[BidirectionalEditor] Failed to process dirty child ${child.id}, keeping with dirty flag:`, e);
              return child; // Keep original with dirty flag
            }
          })
        );

        // Recursively process clean children (they might have dirty descendants)
        const processedClean = await Promise.all(
          cleanChildren.map(async child => {
            try {
              return await processNode(child);
            } catch (e) {
              console.error(`[BidirectionalEditor] Failed to process clean child ${child.id}, keeping as-is:`, e);
              return child; // Keep original
            }
          })
        );

        // Reconstruct children array maintaining original order
        const processedChildren = node.children.map(child => {
          const processed = [...processedDirty, ...processedClean].find(c => c.id === child.id);
          return processed || child;
        });

        return {
          ...node,
          children: processedChildren
        };
      }

      // No modified children, but might have modified descendants
      const processedChildren = await Promise.all(
        node.children.map(async child => {
          try {
            return await processNode(child);
          } catch (e) {
            console.error(`[BidirectionalEditor] Failed to process descendant ${child.id}, keeping as-is:`, e);
            return child; // Keep original
          }
        })
      );

      // Check if any children actually changed
      const childrenChanged = processedChildren.some((child, i) => child !== node.children[i]);

      if (!childrenChanged) {
        return node; // Nothing changed, return original
      }

      return {
        ...node,
        children: processedChildren
      };
    };

    // Process tree incrementally - only regenerate modified subtrees
    // Note: We process the tree recursively, not just check root's children
    // This allows for incremental updates at any level
    try {
      const refreshedTree = await processNode(tree);

      // Check if any nodes still have dirty flags (indicating partial failure)
      const countDirtyNodes = (node) => {
        if (!node) return 0;
        let count = node.isModified ? 1 : 0;
        if (node.children) {
          count += node.children.reduce((sum, child) => sum + countDirtyNodes(child), 0);
        }
        return count;
      };

      const dirtyCount = countDirtyNodes(refreshedTree);
      const withCoords = addYCoord(refreshedTree);
      setTree(withCoords);

      if (dirtyCount > 0) {
        alert(`Tree refresh partially completed. ${dirtyCount} node(s) failed and remain dirty for retry.`);
      }
    } catch (error) {
      console.error('[BidirectionalEditor] Tree refresh failed:', error);
      alert('Failed to refresh tree: ' + error.message + '\n\nThe tree state has been preserved. You can try again.');
    } finally {
      setisTreeRendering(false);
    }
  }



  useEffect(() => {
    const dummyText = RANDOM_TEXT + "\n\n" + RANDOM_POETRY;
    setTextAreaContent(dummyText);
    setTree(createDummyRootNode());
  }, []);



  // Auto-add new sentences as isModified leaf nodes when text changes
  useEffect(() => {
    console.log('[BidirectionalEditor] Tree: detecting text changes for auto-leaf addition...', textAreaContent, tree);
    if (!tree || !textAreaContent) return;

    // Collect every originalContent across the tree (not just leaves)
    const existingOriginals = [];
    const collectOriginals = (node) => {
      if (!node) return;
      if (node.originalContent) existingOriginals.push(String(node.originalContent).trim());
      if (node.children) node.children.forEach(collectOriginals);
    };
    collectOriginals(tree);
    console.log('[BidirectionalEditor] Existing originalContents:', existingOriginals);

    // Wait for a completed sentence (ending with punctuation)
    const lastPunctMatch = textAreaContent.match(/[.!?]/g);
    if (!lastPunctMatch) return;
    const lastPunctPos = textAreaContent.lastIndexOf(lastPunctMatch[lastPunctMatch.length - 1]);
    if (lastPunctPos <= lastPunctPosRef.current) return;
    lastPunctPosRef.current = lastPunctPos;

    // Split textarea into sentences
    const sentences = textToSentences(textAreaContent).map((s) => s.trim()).filter(Boolean);
    const existingSet = new Set(existingOriginals.filter(Boolean));
    const newSentences = sentences.filter((s) => !existingSet.has(s));
    if (newSentences.length === 0) return;

    console.log('[BidirectionalEditor] New sentences detected:', newSentences);

    setTree((prevTree) => {
      if (!prevTree) return prevTree;

      let maxY = -1;
      const findMax = (node) => {
        if (!node) return;
        if (node.level === LEAF_NODE_LEVEL && node.y_coord !== undefined) {
          maxY = Math.max(maxY, node.y_coord);
        }
        if (node.children) node.children.forEach(findMax);
      };
      findMax(prevTree);

      const newLeafNodes = newSentences.map((s, i) => ({
        id: `leaf-${Date.now()}-${i}`,
        content: s,
        label: s,
        level: LEAF_NODE_LEVEL,
        y_coord: maxY + i + 1,
        children: [],
        isModified: true,
        emotion: 'NEUTRAL',
        originalContent: s
      }));

      return {
        ...prevTree,
        children: [...(prevTree.children || []), ...newLeafNodes],
      };
    });
  }, [textAreaContent]);

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
  const [exportFormat, setExportFormat] = useState('txt'); // default to txt
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("vibe_text");

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
          onClick={() => {
            commit();
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
          Commit
        </button>
        <button
          onClick={showTextVsTreeDiff}
          disabled={isTreeRendering || !tree}
          style={{
            padding: '6px 12px',
            backgroundColor: '#111827',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isTreeRendering || !tree ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            opacity: isTreeRendering || !tree ? 0.7 : 1,
          }}
        >
          Diff text↔tree
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
          title="View analytics"
        >
          📊 Stats
        </button>

        {/* NEU: Import-„Button“ */}
        <label className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm cursor-pointer">
          Import (.txt)
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
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm border border-indigo-700"
        >
          Export
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
            onChange={(e) => setTextAreaContent(e.target.value)}
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

        {/* CENTER: Buttons */}
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
          <button
            onClick={convertTextToTree}
            disabled={isTreeRendering}
            style={{
              width: '44px',
              height: '44px',
              padding: '0',
              backgroundColor: isTreeRendering ? '#555' : '#000',
              opacity: isTreeRendering ? 0.6 : 1,
              cursor: isTreeRendering ? 'not-allowed' : 'pointer',
              border: 'none',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
              // NORMAL ARROW SVG
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            )}
          </button>


          <button
            onClick={convertTreeToText}
            disabled={isTreeRendering}
            style={{
              width: '44px',
              height: '44px',
              padding: '0',
              backgroundColor: '#000',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '24px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
        </div>

        {/* RIGHT: Tree Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <button
              onClick={refreshEmotionsInModifiedSubtree}
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
              <button onClick={() => { setPendingNewText(''); setDiffMode('inspect'); setShowDiffModal(false); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }}>✕</button>
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
              {diffMode === 'apply' && (
                <button
                  onClick={() => {
                    const syncedTree = syncTreeAfterTextConversion(tree);
                    setTree(syncedTree);
                    setTextAreaContent(pendingNewText);
                    setPendingNewText('');
                    setDiffMode('inspect');
                    setShowDiffModal(false);
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#111827', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Apply Changes
                </button>
              )}
              <button
                onClick={() => { setPendingNewText(''); setDiffMode('inspect'); setShowDiffModal(false); }}
                style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', color: '#111827', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                {diffMode === 'apply' ? 'Cancel' : 'Close'}
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