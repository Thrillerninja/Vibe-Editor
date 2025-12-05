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

import { LEAF_NODE_LEVEL } from "../utils/constants";

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
  const [maxDepth, setMaxDepth] = useState(2);

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

  const convertTextToTree = () => {
    console.log('[BidirectionalEditor] Converting text to tree...', sentences);

    // Build sentences as leaf nodes
    const sentenceNodes = sentences.map((sentence, i) => ({
      id: `s-${i}`,
      label: sentence.content,
      level: LEAF_NODE_LEVEL,
      children: [],
    }));
    console.log('[BidirectionalEditor] Created sentence nodes:', sentenceNodes);

    // Root node
    const rootNode = createNode('Document', "Root", sentenceNodes, maxDepth);
    console.log('[BidirectionalEditor] Created root node:', rootNode);
    setTree(rootNode);
  };

  // ═══════════════════════════════════════════════════════════════
  // BUTTON 2: TREE → TEXT (flatten tree back to sentences)
  // ═══════════════════════════════════════════════════════════════

  const convertTreeToText = () => {
    console.log('[BidirectionalEditor] Converting tree back to text...', tree);
    if (!tree) return;

    // Collect all sentences from tree in order
    const collected = [];
    
    const traverse = (node) => {
      if (node.level === LEAF_NODE_LEVEL) {
        // This is a sentence node
        collected.push(node);
      } else if (node.children) {
        // Traverse children
        node.children.forEach(child => traverse(child));
      }
    };

    traverse(tree);
    const newSentences = collected.map((n, i) => ({ id: `s-${i}`, content: n.label }));
    const newText = newSentences.map(s => s.content).join(' ');
    console.log('[BidirectionalEditor] Collected', collected, "New sentences:", newSentences);
    setSentences(newSentences);
    setTextAreaContent(newText);
  };

  useEffect(() => {
    const dummyText = `Hi, my name is Slim Shady. I'm back again with another hit single. This is the real Slim Shady, please stand up. I repeat, please stand up. Will the real Slim Shady please stand up`;
    handleTextChange(dummyText);
  }, []);
  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: '8px', padding: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '40px' }}>
        <label style={{ fontSize: '14px' }}>
          Depth:
          <input
            type="number"
            min="2"
            max="6"
            value={maxDepth}
            onChange={(e) => setMaxDepth(Math.max(2, Math.min(6, parseInt(e.target.value) || 3)))}
            style={{ width: '40px', marginLeft: '5px', padding: '4px' }}
          />
        </label>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
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