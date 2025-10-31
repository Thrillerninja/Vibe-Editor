/**
 * Hook for handling node reparenting via drag-and-drop
 * Allows nodes to be dropped onto other nodes to change hierarchy
 */

import React from 'react';
import { useReactFlow } from 'reactflow';
import { LOGGING_ENABLED, LOG_PREFIX } from '../utils/constants';

/**
 * useReparenting hook
 * @returns {{onDropToReparent: Function}} Reparenting handler
 */
export function useReparenting() {
  const { setEdges, getNodes, getEdges } = useReactFlow();

  /**
   * Builds parent map from edges (child → parent)
   */
  const buildParentMap = React.useCallback(() => {
    const parentMap = new Map();
    getEdges().forEach((edge) => parentMap.set(edge.target, edge.source));
    
    if (LOGGING_ENABLED) {
      console.log(`${LOG_PREFIX.REPARENT} Built parent map with ${parentMap.size} entries`);
    }
    
    return parentMap;
  }, [getEdges]);

  /**
   * Checks if maybeAncestor is an ancestor of node
   * Prevents circular references
   */
  const isAncestor = React.useCallback(
    (maybeAncestor, nodeId, parentMap) => {
      let current = parentMap.get(nodeId) || null;
      const visited = new Set();
      
      while (current) {
        if (current === maybeAncestor) {
          if (LOGGING_ENABLED) {
            console.log(
              `${LOG_PREFIX.REPARENT} ${maybeAncestor} is ancestor of ${nodeId}`
            );
          }
          return true;
        }
        
        // Prevent infinite loops
        if (visited.has(current)) {
          console.warn(`${LOG_PREFIX.REPARENT} Circular reference detected at ${current}`);
          return true;
        }
        visited.add(current);
        
        current = parentMap.get(current) || null;
      }
      
      return false;
    },
    []
  );

  /**
   * Check if a point is inside a node's bounding box
   */
  const isPointInNode = React.useCallback((point, node) => {
    const nodeWidth = node.width || 200;
    const nodeHeight = node.height || 60;
    
    return (
      point.x >= node.position.x &&
      point.x <= node.position.x + nodeWidth &&
      point.y >= node.position.y &&
      point.y <= node.position.y + nodeHeight
    );
  }, []);

  /**
   * Handles reparenting when a node is dropped
   * @param {string} draggedId - ID of the dragged node
   * @param {number} flowX - Drop position X in flow coordinates
   * @param {number} flowY - Drop position Y in flow coordinates
   */
  const onDropToReparent = React.useCallback(
    (draggedId, flowX, flowY) => {
      console.log(`${LOG_PREFIX.REPARENT} Drop attempt for ${draggedId} at flow position (${flowX.toFixed(1)}, ${flowY.toFixed(1)})`);
      
      const parentMap = buildParentMap();
      const nodes = getNodes();
      
      const draggedNode = nodes.find((n) => n.id === draggedId);
      if (!draggedNode) {
        console.log(`${LOG_PREFIX.REPARENT} Dragged node not found`);
        return;
      }

      // Calculate the center point of the dragged node
      const draggedCenter = {
        x: flowX + (draggedNode.width || 200) / 2,
        y: flowY + (draggedNode.height || 60) / 2,
      };

      console.log(`${LOG_PREFIX.REPARENT} Dragged node center: (${draggedCenter.x.toFixed(1)}, ${draggedCenter.y.toFixed(1)})`);

      // Find all nodes that overlap with the dragged node's center
      let targetNode = null;
      let minDistance = Infinity;

      for (const node of nodes) {
        if (node.id === draggedId) continue;

        // Check if dragged node's center is inside this node
        if (isPointInNode(draggedCenter, node)) {
          // If multiple nodes overlap, choose the closest one
          const nodeCenterX = node.position.x + (node.width || 200) / 2;
          const nodeCenterY = node.position.y + (node.height || 60) / 2;
          
          const distance = Math.sqrt(
            Math.pow(draggedCenter.x - nodeCenterX, 2) +
            Math.pow(draggedCenter.y - nodeCenterY, 2)
          );

          if (distance < minDistance) {
            minDistance = distance;
            targetNode = node;
          }
        }
      }

      if (!targetNode) {
        console.log(`${LOG_PREFIX.REPARENT} No target node at drop position`);
        return;
      }

      console.log(`${LOG_PREFIX.REPARENT} Target node: ${targetNode.id}`);

      // Don't reparent to same parent
      const currentParent = parentMap.get(draggedId);
      if (currentParent === targetNode.id) {
        console.log(`${LOG_PREFIX.REPARENT} Already same parent, skipping`);
        return;
      }

      // Prevent circular references
      if (isAncestor(draggedId, targetNode.id, parentMap)) {
        console.warn(
          `${LOG_PREFIX.REPARENT} Cannot reparent: would create circular reference`
        );
        return;
      }

      // Update edges
      setEdges((edges) => {
        const withoutOldParent = edges.filter((e) => e.target !== draggedId);
        const newEdge = {
          id: `${targetNode.id}-${draggedId}`,
          source: targetNode.id,
          target: draggedId,
          animated: false,
        };
        
        console.log(
          `${LOG_PREFIX.REPARENT} Reparenting ${draggedId}: ${currentParent || 'none'} → ${targetNode.id}`
        );
        
        return [...withoutOldParent, newEdge];
      });
    },
    [buildParentMap, getNodes, isAncestor, setEdges, isPointInNode]
  );

  return { onDropToReparent };
}