/**
 * @fileoverview TreeVisualization - Main tree visualization component
 *
 * Provides ReactFlow context for node-based tree visualization.
 * Works with the unified Node system as single source of truth.
 *
 * @typedef {import('../types/node').Node} Node
 */

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { TreeInner } from './TreeInner';
import 'reactflow/dist/style.css';

/**
 * TreeVisualization Component - Wraps ReactFlow provider
 *
 * @param {Object} props
 * @param {string} props.rootId - Root node ID
 * @param {Map<string, Node>} props.nodeMap - Map of all nodes
 * @param {(nodeMap: Map<string, Node>) => void} props.onTreeUpdate - Callback when tree changes
 * @returns {React.ReactElement}
 */
export default function TreeVisualization({
  rootId,
  nodeMap,
  onTreeUpdate,
}) {
  console.log(
    '[TreeVisualization] Rendering with',
    nodeMap.size,
    'nodes, rootId:',
    rootId
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <TreeInner
          rootId={rootId}
          nodeMap={nodeMap}
          onTreeUpdate={onTreeUpdate}
        />
      </ReactFlowProvider>
    </div>
  );
}