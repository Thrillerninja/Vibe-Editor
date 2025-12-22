/**
 * TreeVisualization - Main tree visualization component
 * Wrapper that provides ReactFlow context
 * Now works with sentences array as SSOT
 */

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TreeInner } from './TreeInner';
import 'reactflow/dist/style.css';

/**
 * TreeVisualization Component
 * @param {Array} sentences - Sentence nodes (SSOT)
 * @param {Function} onTreeUpdate - Callback when tree structure changes
 */
export default function TreeVisualization({ sentences, onTreeUpdate }) {
  console.log('[TreeVisualization] Rendering with', sentences.length, 'sentences');
  
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <TreeInner sentences={sentences} onTreeUpdate={onTreeUpdate} />
      </ReactFlowProvider>
    </div>
  );
}