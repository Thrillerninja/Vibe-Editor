/**
 * Hook for handling node reparenting via drag-and-drop
 * Allows nodes to be dropped onto other nodes to change hierarchy
 */

import React from 'react';
import { useReactFlow } from 'reactflow';
import posthog from '@utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '@utils/constants';

/**
 * useReparenting hook
 * @returns {{onDropToReparent: Function, findReparentTarget: Function}} Reparenting handlers
 */
export function useReparenting() {
  const { getNodes, getEdges } = useReactFlow();

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

  const getNodeSize = (node) => {
    const styleW = node?.style?.width;
    const styleH = node?.style?.height;

    const w =
      node.width ??
      node.measured?.width ??
      (typeof styleW === 'number' ? styleW : parseFloat(styleW)) ??
      200;

    const h =
      node.height ??
      node.measured?.height ??
      (typeof styleH === 'number' ? styleH : parseFloat(styleH)) ??
      60;

    return { w, h };
  };


  /**
   * Check if a point is inside a node's bounding box
   */
  const isPointInNode = React.useCallback((point, node) => {
    const { w, h } = getNodeSize(node);

    // Größere "Trefferzone" für kleine Nodes
    const PADDING = 24;
    const MIN_W = 140;
    const MIN_H = 50;

    const nodeWidth = Math.max(w, MIN_W);
    const nodeHeight = Math.max(h, MIN_H);

    const left = node.position.x - PADDING;
    const right = node.position.x + nodeWidth + PADDING;
    const top = node.position.y - PADDING;
    const bottom = node.position.y + nodeHeight + PADDING;

    return (
      point.x >= left &&
      point.x <= right &&
      point.y >= top &&
      point.y <= bottom
    );
  }, []);


  /**
   * Find potential reparent target during drag (for preview)
   * @param {string} draggedId - ID of the dragged node
   * @param {number} flowX - Current X position in flow coordinates
   * @param {number} flowY - Current Y position in flow coordinates
   * @returns {Object|null} Target node or null
   */
  const findReparentTarget = React.useCallback(
    (draggedId, flowX, flowY) => {
      const parentMap = buildParentMap();
      const nodes = getNodes();

      const draggedNode = nodes.find((n) => n.id === draggedId);
      if (!draggedNode) {
        console.log(`${LOG_PREFIX.REPARENT} ❌ Dragged node not found: ${draggedId}`);
        return null;
      }

      // Calculate the center point of the dragged node
      const { w: draggedWidth, h: draggedHeight } = getNodeSize(draggedNode);
      const draggedCenter = {
        x: flowX + draggedWidth/2 ,
        y: flowY + draggedHeight/2 ,

      };

      console.log(
        `${LOG_PREFIX.REPARENT} Checking reparent: node ${draggedId}`,
        `\n  Dragged size: ${draggedWidth}x${draggedHeight}`,
        `\n  Dragged position: (${flowX.toFixed(1)}, ${flowY.toFixed(1)})`,
        `\n  Dragged center: (${draggedCenter.x.toFixed(1)}, ${draggedCenter.y.toFixed(1)})`
      );

      // Find all nodes that overlap with the dragged node's center
      let targetNode = null;
      let minDistance = Infinity;

      for (const node of nodes) {
        if (node.id === draggedId) continue;

        // Check if dragged node's center is inside this node
        if (isPointInNode(draggedCenter, node)) {
          const nodeCenterX = node.position.x + (node.width || 200) / 2;
          const nodeCenterY = node.position.y + (node.height || 60) / 2;

          const distance = Math.sqrt(
            Math.pow(draggedCenter.x - nodeCenterX, 2) +
            Math.pow(draggedCenter.y - nodeCenterY, 2)
          );

          console.log(
            `${LOG_PREFIX.REPARENT}   ✓ Overlapping with ${node.id}: distance=${distance.toFixed(1)}px`
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

      // Don't show indicator for same parent
      const currentParent = parentMap.get(draggedId);
      if (currentParent === targetNode.id) {
        console.log(
          `${LOG_PREFIX.REPARENT}   ⚠️  Target ${targetNode.id} is already parent`
        );
        return null;
      }

      // Don't show indicator if it would create circular reference
      if (isAncestor(draggedId, targetNode.id, parentMap)) {
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
    [buildParentMap, getNodes, isAncestor, isPointInNode]
  );

  /**
   * Handles reparenting when a node is dropped
   * @param {string} draggedId - ID of the dragged node
   * @param {number} flowX - Drop position X in flow coordinates
   * @param {number} flowY - Drop position Y in flow coordinates
   */
  const onDropToReparent = React.useCallback(
    (draggedId, flowX, flowY) => {
      try {
        const targetNode = findReparentTarget(draggedId, flowX, flowY);

        if (targetNode) {
          console.log(`Reparenting disabled: Would attach ${draggedId} to ${targetNode.id}`);
        }
        console.log(`${LOG_PREFIX.REPARENT} Target node: ${targetNode?.id ? targetNode && targetNode.id : "null"}`);
        posthog.capture('node_reparented', {
          dragged_node_id: draggedId,
          new_parent_id: targetNode.id,
          operation: 'reparent',
        });
      } catch (error) {
        console.error(`${LOG_PREFIX.REPARENT} Error during reparenting:`, error);
      }
    },
    [findReparentTarget]
  );

  return { onDropToReparent, findReparentTarget };
}