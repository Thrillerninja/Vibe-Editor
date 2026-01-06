/**
 * Hook for handling node reparenting via drag-and-drop
 * Works with nodeMap-based hierarchy
 */

import React from 'react';
import { useReactFlow } from 'reactflow';
import posthog from '../utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '../utils/constants';

/**
 * useReparenting hook
 * @returns {{onDropToReparent: Function, findReparentTarget: Function}}
 */
export function useReparenting() {
  const { getNodes } = useReactFlow();

  /**
   * Check if maybeAncestor is an ancestor of node
   * Prevents circular references
   *
   * @param {string} nodeId - Node to check
   * @param {string} maybeAncestor - Potential ancestor
   * @param {Map} nodeMap - Node hierarchy map
   * @returns {boolean}
   */
  const isAncestor = React.useCallback(
    (nodeId, maybeAncestor, nodeMap) => {
      if (!nodeMap) return false;

      let current = nodeId;
      const visited = new Set();

      while (current) {
        const node = nodeMap.get(current);
        if (!node) break;

        current = node.hierarchy.parentId;

        if (current === maybeAncestor) {
          console.log(
            `${LOG_PREFIX.REPARENT} ${maybeAncestor} is ancestor of ${nodeId}`
          );
          return true;
        }

        // Prevent infinite loops
        if (visited.has(current)) {
          console.warn(
            `${LOG_PREFIX.REPARENT} Circular reference detected at ${current}`
          );
          return true;
        }

        visited.add(current);
      }

      return false;
    },
    []
  );

  /**
   * Check if a point is inside a node's bounding box
   *
   * @param {Object} point - { x, y }
   * @param {Object} node - ReactFlow node
   * @returns {boolean}
   */
  const isPointInNode = React.useCallback((point, node) => {
    const nodeWidth = node.width || 200;
    const nodeHeight = node.height || 60;

    const isInside =
      point.x >= node.position.x &&
      point.x <= node.position.x + nodeWidth &&
      point.y >= node.position.y &&
      point.y <= node.position.y + nodeHeight;

    if (LOGGING_ENABLED) {
      console.log(
        `${LOG_PREFIX.REPARENT}     Hitbox check for ${node.id}:`,
        `\n      Bounds: X[${node.position.x.toFixed(1)} → ${(
          node.position.x + nodeWidth
        ).toFixed(1)}] Y[${node.position.y.toFixed(1)} → ${(
          node.position.y + nodeHeight
        ).toFixed(1)}]`,
        `\n      Point: (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
        `\n      Result: ${isInside ? '✅ INSIDE' : '❌ OUTSIDE'}`
      );
    }

    return isInside;
  }, []);

  /**
   * Find potential reparent target during drag
   *
   * @param {string} draggedId - ID of dragged node
   * @param {number} flowX - Current X in flow coords
   * @param {number} flowY - Current Y in flow coords
   * @param {Map} nodeMap - Node hierarchy map
   * @returns {Object|null} Target node or null
   */
  const findReparentTarget = React.useCallback(
    (draggedId, flowX, flowY, nodeMap) => {
      if (!nodeMap) return null;

      const nodes = getNodes();
      const draggedNode = nodes.find(n => n.id === draggedId);

      if (!draggedNode) {
        console.log(
          `${LOG_PREFIX.REPARENT} ❌ Dragged node not found: ${draggedId}`
        );
        return null;
      }

      const draggedWidth = draggedNode.width || 200;
      const draggedHeight = draggedNode.height || 60;
      const draggedCenter = {
        x: flowX + draggedWidth / 2,
        y: flowY + draggedHeight / 2,
      };

      console.log(
        `${LOG_PREFIX.REPARENT} Checking reparent: node ${draggedId}`,
        `\n  Dragged size: ${draggedWidth}x${draggedHeight}`,
        `\n  Dragged position: (${flowX.toFixed(1)}, ${flowY.toFixed(1)})`,
        `\n  Dragged center: (${draggedCenter.x.toFixed(1)}, ${draggedCenter.y.toFixed(
          1
        )})`
      );

      // Find overlapping nodes
      let targetNode = null;
      let minDistance = Infinity;

      for (const node of nodes) {
        if (node.id === draggedId) continue;

        // Check if dragged center is inside this node
        if (isPointInNode(draggedCenter, node)) {
          const nodeCenterX = node.position.x + (node.width || 200) / 2;
          const nodeCenterY = node.position.y + (node.height || 60) / 2;

          const distance = Math.sqrt(
            Math.pow(draggedCenter.x - nodeCenterX, 2) +
              Math.pow(draggedCenter.y - nodeCenterY, 2)
          );

          console.log(
            `${LOG_PREFIX.REPARENT}   ✓ Overlapping with ${node.id}: distance=${distance.toFixed(
              1
            )}px`
          );

          if (distance < minDistance) {
            minDistance = distance;
            targetNode = node;
          }
        }
      }

      if (!targetNode) {
        console.log(`${LOG_PREFIX.REPARENT}   ❌ No overlapping nodes found`);
        return null;
      }

      // Don't reparent to same parent
      const draggedNodeData = nodeMap.get(draggedId);
      const currentParent = draggedNodeData?.hierarchy.parentId;

      if (currentParent === targetNode.id) {
        console.log(
          `${LOG_PREFIX.REPARENT}   ⚠️  Target ${targetNode.id} is already parent`
        );
        return null;
      }

      // Don't create circular references
      if (isAncestor(draggedId, targetNode.id, nodeMap)) {
        console.log(
          `${LOG_PREFIX.REPARENT}   ⚠️  Would create circular reference with ${targetNode.id}`
        );
        return null;
      }

      console.log(
        `${LOG_PREFIX.REPARENT}   ✅ Valid reparent target: ${targetNode.id}`
      );
      return targetNode;
    },
    [getNodes, isAncestor, isPointInNode]
  );

  /**
   * Handle reparenting on drop
   *
   * @param {string} draggedId - Node being dropped
   * @param {number} flowX - Drop X position
   * @param {number} flowY - Drop Y position
   * @param {Map} nodeMap - Node hierarchy map
   */
  const onDropToReparent = React.useCallback(
    (draggedId, flowX, flowY, nodeMap) => {
      try {
        const targetNode = findReparentTarget(draggedId, flowX, flowY, nodeMap);

        if (targetNode) {
          console.log(
            `${LOG_PREFIX.REPARENT} ✅ Ready to reparent ${draggedId} → ${targetNode.id}`
          );

          posthog.capture('node_reparented', {
            dragged_node_id: draggedId,
            new_parent_id: targetNode.id,
            operation: 'reparent',
          });

          return targetNode;
        }
      } catch (error) {
        console.error(`${LOG_PREFIX.REPARENT} Error during reparenting:`, error);
      }

      return null;
    },
    [findReparentTarget]
  );

  return { onDropToReparent, findReparentTarget };
}