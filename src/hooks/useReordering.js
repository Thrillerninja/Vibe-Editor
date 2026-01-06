/**
 * Hook for reordering sibling nodes (same parent)
 * Works with nodeMap-based hierarchy
 */

import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import posthog from '../utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '../utils/constants';

const REORDER_THRESHOLD = 100; // pixels

/**
 * @typedef {Object} ReorderResult
 * @property {Object} node - ReactFlow node object
 * @property {boolean} insertBefore - Insert before or after
 * @property {number} distance - Distance in pixels
 */

export function useReordering() {
  const { getNodes } = useReactFlow();

  /**
   * Get all sibling node IDs (same parent)
   *
   * @param {string} nodeId - Node to find siblings for
   * @param {Map} nodeMap - Node hierarchy map
   * @returns {string[]} Array of sibling node IDs
   */
  const getSiblings = useCallback((nodeId, nodeMap) => {
    if (!nodeMap) return [];

    const node = nodeMap.get(nodeId);
    if (!node) {
      console.log(`${LOG_PREFIX.DRAG} [getSiblings] Node not found: ${nodeId}`);
      return [];
    }

    const parentId = node.hierarchy.parentId;
    if (!parentId) {
      console.log(
        `${LOG_PREFIX.DRAG} [getSiblings] No parent for ${nodeId}`
      );
      return [];
    }

    const parent = nodeMap.get(parentId);
    if (!parent) {
      console.log(
        `${LOG_PREFIX.DRAG} [getSiblings] Parent not found: ${parentId}`
      );
      return [];
    }

    const siblings = (parent.hierarchy.childIds || []).filter(
      id => id !== nodeId
    );

    console.log(
      `${LOG_PREFIX.DRAG} [getSiblings] Node ${nodeId}: parent=${parentId}, siblings=${siblings.length}`
    );

    return siblings;
  }, []);

  /**
   * Find closest sibling during drag for reorder indicator
   *
   * @param {string} draggedId - ID of dragged node
   * @param {number} currentY - Current Y position in flow coords
   * @param {Map} nodeMap - Node hierarchy map
   * @returns {ReorderResult|null}
   */
  const findClosestSibling = useCallback(
    (draggedId, currentY, nodeMap) => {
      if (!nodeMap) {
        console.log(`${LOG_PREFIX.DRAG} [findClosestSibling] No nodeMap provided`);
        return null;
      }

      const rfNodes = getNodes();
      const siblingIds = getSiblings(draggedId, nodeMap);

      console.log(
        `${LOG_PREFIX.DRAG} [findClosestSibling] Checking node ${draggedId}, Y=${currentY.toFixed(
          1
        )}, siblings=${siblingIds.length}`
      );

      if (siblingIds.length === 0) {
        console.log(`${LOG_PREFIX.DRAG}   ❌ No siblings found`);
        return null;
      }

      let closestNode = null;
      let minDistance = Infinity;
      let insertBefore = false;

      // Find closest sibling by Y distance
      for (const siblingId of siblingIds) {
        const rfNode = rfNodes.find(n => n.id === siblingId);
        if (!rfNode) {
          console.log(
            `${LOG_PREFIX.DRAG}   ⚠️  Sibling ${siblingId} not in ReactFlow nodes`
          );
          continue;
        }

        const distance = Math.abs(rfNode.position.y - currentY);

        console.log(
          `${LOG_PREFIX.DRAG}   Check sibling ${siblingId}: Y=${rfNode.position.y.toFixed(
            1
          )}, distance=${distance.toFixed(1)}px`
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestNode = rfNode;
          insertBefore = currentY < rfNode.position.y;
        }
      }

      if (!closestNode) {
        console.log(`${LOG_PREFIX.DRAG}   ❌ No sibling nodes found in ReactFlow`);
        return null;
      }

      console.log(
        `${LOG_PREFIX.DRAG}   Closest: ${closestNode.id}, distance=${minDistance.toFixed(1)}px, threshold=${REORDER_THRESHOLD}px`
      );

      if (minDistance < REORDER_THRESHOLD) {
        console.log(
          `${LOG_PREFIX.DRAG}   ✅ Valid reorder target: ${closestNode.id} (${
            insertBefore ? 'before' : 'after'
          })`
        );
        return { node: closestNode, insertBefore, distance: minDistance };
      }

      console.log(
        `${LOG_PREFIX.DRAG}   ❌ Too far: ${minDistance.toFixed(1)}px > ${REORDER_THRESHOLD}px`
      );
      return null;
    },
    [getNodes, getSiblings]
  );

  /**
   * Check if drop should trigger reordering
   *
   * @param {string} draggedId - Node ID
   * @param {number} dropY - Drop Y position
   * @param {Map} nodeMap - Node hierarchy map
   * @returns {Object|null} { targetSiblingId, insertBefore } or null
   */
  const checkReorderDrop = useCallback(
    (draggedId, dropY, nodeMap) => {
      const closest = findClosestSibling(draggedId, dropY, nodeMap);

      if (closest) {
        console.log(
          `${LOG_PREFIX.DRAG} ✅ Reorder drop: ${draggedId} ${
            closest.insertBefore ? 'before' : 'after'
          } ${closest.node.id}`
        );

        return {
          targetSiblingId: closest.node.id,
          insertBefore: closest.insertBefore,
        };
      }

      console.log(`${LOG_PREFIX.DRAG} ❌ No reorder target`);
      return null;
    },
    [findClosestSibling]
  );

  /**
   * Apply reordering (for tracking/analytics)
   *
   * @param {string} draggedId - Node being reordered
   * @param {string} targetSiblingId - Target sibling
   * @param {boolean} insertBefore - Insert before or after
   * @returns {boolean}
   */
  const reorderNodes = useCallback((draggedId, targetSiblingId, insertBefore) => {
    console.log(
      `${LOG_PREFIX.DRAG} Reorder applied: ${draggedId} ${
        insertBefore ? 'before' : 'after'
      } ${targetSiblingId}`
    );

    posthog.capture('node_reordered', {
      dragged_node_id: draggedId,
      target_node_id: targetSiblingId,
      insert_before: insertBefore,
      operation: 'reorder',
    });

    return true;
  }, []);

  return {
    checkReorderDrop,
    reorderNodes,
    findClosestSibling,
    getSiblings,
  };
}