/**
 * BidirectionalEditor.jsx
 * 
 * Minimal dual-state editor
 * - sentences: array of text (left pane state)
 * - tree: hierarchical tree object (right pane state)
 * 
 * Convert buttons parse/build directly, no helpers
 */

import React, { useState, useEffect,useMemo } from 'react';
import ElkTree from '../components/Tree/ELKTree';
import { tr } from 'framer-motion/client';
import { buildTree } from '../ClaudeAlternative/claudeAPI';
import { LEAF_NODE_LEVEL } from "../utils/constants";

const RANDOM_POETRY= `The world shifts between wonder and despair. Some mornings I rise with a flame burning through my thoughts. Other days I feel the cold gravity of a thousand unspoken fears. Yet a quiet voice reminds me that chaos has its own hidden rhythm. And even in the fracture of the heart, something stubborn and beautiful refuses to disappear.`;

function createNode(id, label, children = [], level = 0) {
  return {
    id: id,
    label:label,
    level:level,
    children:children,
  };
}

export default function BidirectionalEditor() {
  const [sentences, setSentences] = useState([]);
  const [textAreaContent, setTextAreaContent] = useState('');
  const [tree, setTree] = useState(null);
  const [maxDepth, setMaxDepth] = useState(3);

  // ═══════════════════════════════════════════════════════════════
  // LEFT PANE: Parse text into sentences
  // ═══════════════════════════════════════════════════════════════
  const handleTextChange = (newText) => {
    console.log('[BidirectionalEditor] Text changed:', newText);

    // Keep raw text state
    setTextAreaContent(newText);

    // Split by sentence-ending punctuation with delimiters included
    const newSentences = newText
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 0)
      .map((content, i) => ({ id: `s-${i}`, content: content.trim() }));

    console.log('[BidirectionalEditor] Parsed sentences:', newSentences.length, newSentences);
    setSentences(newSentences);
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 1: TEXT → TREE
  // ═══════════════════════════════════════════════════════════════

  const convertTextToTree = async () => {
    console.log('[BidirectionalEditor] Converting text to tree...', sentences);

    // Build sentences as leaf nodes
    try {
      // Ask the model to build a tree with `maxDepth` layers
      const aiRoot = await buildTree(sentences, maxDepth);
      console.log('[BidirectionalEditor] Claude returned tree:', aiRoot);

      // If AI returned something valid, use it
      setTree(aiRoot);
    } catch (err) {
      console.error('[BidirectionalEditor] AI tree generation failed, falling back to simple layout:', err);

      // Fallback: same behavior as before (simple leaf-per-sentence)
      const sentenceNodes = sentences.map((sentence, i) => ({
        id: `s-${i}`,
        label: sentence.content,
        level: LEAF_NODE_LEVEL,
        children: [],
      }));
      const rootNode = createNode('Document', "Root", sentenceNodes, maxDepth);
      setTree(rootNode);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 2: TREE → TEXT (flatten tree back to sentences)
  // ═══════════════════════════════════════════════════════════════

  const convertTreeToText = () => {
    console.log('[BidirectionalEditor] Converting tree back to text...', tree);
    if (!tree) return;
    console.log('[BidirectionalEditor] Current tree:', tree);
    // Collect all sentences from tree in order
    const collected = [];
    const collectedSentences = [];
    const traverse = (node) => {
      if (node.level === LEAF_NODE_LEVEL) {
        // This is a sentence node
        collected.push(node);
        collectedSentences.push(node.content);
      } else if (node.children) {
        // Traverse children
        node.children.forEach(child => traverse(child));
      }
    };

    traverse(tree);
    console.log('[BidirectionalEditor] Collected sentences from tree:', collectedSentences);
    const newSentences = collected.map((n, i) => ({ id: `s-${i}`, content: n.content }));
    const newText = collectedSentences.map(s => s).join(' ');
    console.log('[BidirectionalEditor] Collected', newSentences, "New sentences:", collectedSentences);
    setSentences(newSentences);
    console.log('[BidirectionalEditor] Reconstructed text:', newText);
    setTextAreaContent(newText);
  };

  useEffect(() => {
    const dummyText = RANDOM_POETRY;
    handleTextChange(dummyText);
  }, []);
  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: '8px', padding: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '40px' }}>
        <button
          onClick={() => {
            setSentences([]);
            setTree(null);
            setTextAreaContent("");
          }}
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
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>
          Sentences: {sentences.length} | Tree: {tree ? '✓' : '✗'}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', gap: '0', flex: 1, minHeight: 0 }}>
        {/* LEFT: Text Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', color: "#000", borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#f9fafb' }}>
            Text Input
          </div>
            <textarea
            value={textAreaContent}
            onChange={(e) => handleTextChange(e.target.value)}
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
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </button>

            <button
              onClick={convertTreeToText}
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
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#f9fafb' }}>
            Tree
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {tree ? (
              <ElkTree tree={tree} setTree={setTree}/>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                Click → to create tree
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}