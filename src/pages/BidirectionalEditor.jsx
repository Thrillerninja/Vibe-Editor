/**
 * BidirectionalEditor.jsx
 * 
 * Minimal dual-state editor
 * - sentences: array of text (left pane state)
 * - tree: hierarchical tree object (right pane state)
 * 
 * Convert buttons parse/build directly, no helpers
 */

import React, { useState, useEffect,useMemo, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import ElkTree from '../components/Tree/ELKTree';
import { tr } from 'framer-motion/client';
import { buildTree, restructureSubtreePreservingIds } from '../ClaudeAlternative/claudeAPI';
import { LEAF_NODE_LEVEL } from "../utils/constants";
import HistoryGraph from "../components/HistoryGraph/HistoryGraph";
import { ReactFlowProvider } from 'reactflow';

const RANDOM_POETRY= `The world shifts between wonder and despair. Some mornings I rise with a flame burning through my thoughts. Other days I feel the cold gravity of a thousand unspoken fears. Yet a quiet voice reminds me that chaos has its own hidden rhythm. And even in the fracture of the heart, something stubborn and beautiful refuses to disappear.`;
const RANDOM_TEXT =  `The day began with a gentle sense of positivity, as if something good waited quietly beneath the surface. Still, a negative undertone drifted in now and then, reminding me that not everything sits as steadily as I wish. Most moments passed in a neutral haze — footsteps on pavement, distant voices, the ordinary rhythm of moving forward. But at one point, a realization struck with sharp emphasis, cutting through everything else and demanding attention. And as evening settled, an uncertain question lingered in the air, leaving me wondering what tomorrow might shape from all of this.`



function createNode(id, label, children = [], level = 0, isModified=false, emotion="NEUTRAL") {
  return {
    id: id,
    label:label,
    level:level,
    children:children,
    isModified:isModified,
    emotion:emotion,
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
    isModified:false,
    emotion: node.emotion ?? "NEUTRAL", 
    y_coord: node.y_coord ?? 0   // default value
  };

  if (!node.children) return updated;

  return {
    ...updated,
    children: node.children.map(addYCoord)
  };
}


// Create a default dummy root node
const createDummyRootNode = () => ({
  id: 'root',
  label: 'Document Root',
  content: 'Document Root',
  level: 0,
  children: [],
  isModified: false,
  emotion: "NEUTRAL",
  y_coord: 0,
  originalContent: 'Document Root' // Track original on creation
});

export default function BidirectionalEditor() {
  const [textAreaContent, setTextAreaContent] = useState('');
  const [tree, setTree] = useState(undefined);
  const [maxDepth, setMaxDepth] = useState(3);
  const [isTreeRendering, setisTreeRendering] = useState(false);
  const navigate = useNavigate();
  const historyGraphRef = useRef(null);
  const lastPunctPosRef = useRef(-1); // Track last . ! ? position

  const commit = () => {
      historyGraphRef.current?.addCommit(
        { text: textAreaContent },
        "Text updated"
      );
  }


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
  const extractTextFromTree = (treeNode) => {
    if (!treeNode) return "";

    // 1) Collect all leaf nodes
    const leaves = [];
    const collect = (node) => {
      if (node.level === LEAF_NODE_LEVEL) {
        leaves.push(node);
      } else if (node.children) {
        node.children.forEach(collect);
      }
    };
    collect(treeNode);
    console.log('[BidirectionalEditor] Collected leaf nodes:', leaves);
    
    // 2) Sort by y_coord (ascending = top-to-bottom)
    leaves.sort((a, b) => (a.y_coord) - (b.y_coord));

    // 3) Convert sorted nodes into text
    return leaves.map((n) => n.content).join(" ");
  };

  // Main method: Convert tree to text and sync tree state
  const convertTreeToText = () => {
    if (!tree) return;

    // Extract text from tree
    const newText = extractTextFromTree(tree);

    // Sync tree: clear isModified and set originalContent = content
    const syncedTree = syncTreeAfterTextConversion(tree);
    setTree(syncedTree);

    // Update textarea with extracted text
    setTextAreaContent(newText);
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

    // Recursive function to check and regenerate nodes with modified children
    const processNode = async (node) => {
      if (!node || !node.children || node.children.length === 0) {
        return node;
      }
      console.log('[BidirectionalEditor] Processing node:', node, node.content);
      // Check if any direct children have isModified = true
      const hasModifiedChild = node.children.some(child => child.isModified === true);
      console.log(`[BidirectionalEditor] Node ${node.id} has modified child:`, hasModifiedChild, node.children);
      if (hasModifiedChild) {
        try {
          console.log(`[BidirectionalEditor] Regenerating subtree for node ${node.id} (preserve ids/levels/contents)`);
          const regenerated = await restructureSubtreePreservingIds(node);
          const cleaned = clearModified(regenerated);
          return cleaned;
        } catch (e) {
          console.error('[BidirectionalEditor] Subtree regeneration failed, keeping original node:', e);
          return node;
        }
      }

      // Recursively process children
      const processedChildren = await Promise.all(node.children.map(child => processNode(child)));

      return {
        ...node,
        children: processedChildren
      };
    };

    // if root children are modifed regen everything.
    const rootHasModifiedChild = tree.children && tree.children.some(child => child.isModified === true);
    if (rootHasModifiedChild) {
      console.log(`[BidirectionalEditor] Root has modified child, regenerating entire tree`);
      convertTextToTree()
    } else {
      console.log(`[BidirectionalEditor] Root has no modified children, processing normally`);
      try {
            const refreshedTree = await processNode(tree);
            const withCoords = addYCoord(refreshedTree);
            setTree(withCoords);
            console.log('[BidirectionalEditor] Tree refreshed:', withCoords);
          } finally {
            setisTreeRendering(false);
          }
      };

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
          onClick={() => navigate('/stats')}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
          title="View analytics"
        >
          📊 Stats
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white',color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
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
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                )}
            </button>

            {tree ? (
              <ReactFlowProvider>
                <ElkTree tree={tree} setTree={setTree}/>
              </ReactFlowProvider>

            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                
              </div>
            )}
          </div>
        </div>
      </div>
      <HistoryGraph ref={historyGraphRef} onRevertComplete={handleRevertComplete}/>
    </div>
  );
}