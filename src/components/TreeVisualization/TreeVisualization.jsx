// File: TreeVisualization.jsx

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TreeInner } from './TreeInner';
import 'reactflow/dist/style.css';

/**
 * TreeVisualization Component
 * @param {string} text - Text to visualize as a tree
 */
// 1. Destructure setTextTree from props
export function TreeVisualization({ text, setText, setTextTree }) { 

  console.log("TEST0typeof setTextTree in EmotionSelector:", typeof setTextTree);
  //setText(0, "TEST")
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        {/* 2. Pass setTextTree down to the child */}
        <TreeInner text={text} setText={setText} setTextTree={setTextTree}/> 
      </ReactFlowProvider>
    </div>
  );
}