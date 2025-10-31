/**
 * TreeVisualizationAlternate - Main tree visualization component
 * Wrapper that provides ReactFlow context
 */

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TreeInner } from './TreeInner';
import 'reactflow/dist/style.css';

/**
 * TreeVisualizationAlternate Component
 * @param {string} text - Text to visualize as a tree
 */
export default function TreeVisualization({ text }) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <TreeInner text={text} />
      </ReactFlowProvider>
    </div>
  );
}