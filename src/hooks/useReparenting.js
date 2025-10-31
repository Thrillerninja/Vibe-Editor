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
  const { setEdges, screenToFlowPosition, getIntersectingNodes, getEdges } =
    useReactFlow();

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
   * Handles reparenting when a node is dropped
   * @param {string} draggedId - ID of the dragged node
   * @param {number} clientX - Drop position X
   * @param {number} clientY - Drop position Y
   */
  const onDropToReparent = React.useCallback(
    (draggedId, clientX, clientY) => {
      console.log(`${LOG_PREFIX.REPARENT} Drop attempt for ${draggedId} at (${clientX}, ${clientY})`);
      
      const parentMap = buildParentMap();
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });

      // Find nodes under cursor (excluding the dragged node)
      const nodesUnder = getIntersectingNodes(
        {
          x: flowPosition.x - 1,
          y: flowPosition.y - 1,
          width: 2,
          height: 2,
        },
        false
      ).filter((n) => n.id !== draggedId);

      if (!nodesUnder.length) {
        console.log(`${LOG_PREFIX.REPARENT} No nodes under cursor, no reparenting`);
        return;
      }

      // Find closest node
      nodesUnder.sort(
        (a, b) =>
          (a.position.x - flowPosition.x) ** 2 +
          (a.position.y - flowPosition.y) ** 2 -
          ((b.position.x - flowPosition.x) ** 2 +
            (b.position.y - flowPosition.y) ** 2)
      );
      const targetNode = nodesUnder[0];

      console.log(`${LOG_PREFIX.REPARENT} Closest node: ${targetNode.id}`);

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
          `${LOG_PREFIX.REPARENT} Reparenting ${draggedId}: ${parentMap.get(draggedId)} → ${targetNode.id}`
        );
        
        return [...withoutOldParent, newEdge];
      });
    },
    [buildParentMap, screenToFlowPosition, getIntersectingNodes, isAncestor, setEdges]
  );

  return { onDropToReparent };
}