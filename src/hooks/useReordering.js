/**
 * Hook for reordering sibling nodes
 * Allows nodes to be reordered within the same parent
 */

import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import posthog from '../utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '../utils/constants';

const REORDER_THRESHOLD = 60; // pixels - tighter threshold

export function useReordering() {
  const { getNodes, getEdges, setEdges } = useReactFlow();

  /**
   * Get parent of a node
   */
  const getParent = useCallback(
    (nodeId) => {
      const edges = getEdges();
      const edge = edges.find((e) => e.target === nodeId);
      return edge?.source || null;
    },
    [getEdges]
  );

  /**
   * Build map of parent -> children in order
   */
  const buildParentChildrenMap = useCallback(() => {
    const map = new Map();
    getEdges().forEach((edge) => {
      if (!map.has(edge.source)) {
        map.set(edge.source, []);
      }
      map.get(edge.source).push(edge.target);
    });
    return map;
  }, [getEdges]);

  /**
   * Get siblings of a node (same parent)
   */
  const getSiblings = useCallback(
    (nodeId) => {
      const parent = getParent(nodeId);
      if (!parent) return [];

      const parentChildrenMap = buildParentChildrenMap();
      return (parentChildrenMap.get(parent) || []).filter(
        (id) => id !== nodeId
      );
    },
    [getParent, buildParentChildrenMap]
  );

  /**
   * Find closest sibling during drag for indicator
   */
  const findClosestSibling = useCallback(
    (draggedId, currentY) => {
      const nodes = getNodes();
      const siblings = getSiblings(draggedId);

      console.log(
        `${LOG_PREFIX.DRAG} Checking reorder: node ${draggedId}, Y=${currentY.toFixed(1)}, ${siblings.length} siblings`
      );

      if (siblings.length === 0) {
        console.log(`${LOG_PREFIX.DRAG}   ❌ No siblings found`);
        return null;
      }

      let closestSibling = null;
      let minDistance = Infinity;
      let insertBefore = false;

      for (const siblingId of siblings) {
        const siblingNode = nodes.find((n) => n.id === siblingId);
        if (!siblingNode) continue;

        const distance = Math.abs(siblingNode.position.y - currentY);
        console.log(
          `${LOG_PREFIX.DRAG}   Sibling ${siblingId}: Y=${siblingNode.position.y.toFixed(1)}, distance=${distance.toFixed(1)}px`
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestSibling = siblingNode;
          insertBefore = currentY < siblingNode.position.y;
        }
      }

      if (closestSibling && minDistance < REORDER_THRESHOLD) {
        console.log(
          `${LOG_PREFIX.DRAG}   ✅ Found closest sibling: ${closestSibling.id} (${minDistance.toFixed(1)}px, threshold=${REORDER_THRESHOLD}px)`
        );
        return { node: closestSibling, insertBefore };
      }

      console.log(
        `${LOG_PREFIX.DRAG}   ❌ Closest sibling too far: ${minDistance.toFixed(1)}px > ${REORDER_THRESHOLD}px`
      );
      return null;
    },
    [getNodes, getSiblings]
  );

  /**
   * Check if drop should trigger reordering
   * @returns {Object|null} { targetSiblingId, insertBefore, parent } or null
   */
  const checkReorderDrop = useCallback(
    (draggedId, dropY) => {
      const closest = findClosestSibling(draggedId, dropY);

      if (closest) {
        const parent = getParent(draggedId);
        console.log(
          `${LOG_PREFIX.DRAG} Reorder detected: ${draggedId} ${closest.insertBefore ? 'before' : 'after'
          } ${closest.node.id}`
        );
        return {
          targetSiblingId: closest.node.id,
          insertBefore: closest.insertBefore,
          parent,
        };
      }

      return null;
    },
    [findClosestSibling, getParent]
  );

  /**
   * Reorder nodes by changing edge order
   */
  const reorderNodes = useCallback(
    (draggedId, targetSiblingId, insertBefore) => {
      // Track reordering
      posthog.capture('node_reordered', {
        dragged_node_id: draggedId,
        target_node_id: targetSiblingId,
        insert_before: insertBefore,
        operation: 'reorder',
      });

      const parent = getParent(draggedId);
      if (!parent) return;

      setEdges((edges) => {
        // Separate edges by parent
        const parentEdges = edges.filter(
          (e) => e.source === parent
        );
        const otherEdges = edges.filter((e) => e.source !== parent);

        // Get current sibling IDs
        const siblings = parentEdges.map((e) => e.target);

        // Remove dragged node
        const filtered = siblings.filter((id) => id !== draggedId);

        // Insert at new position
        const targetIndex = filtered.indexOf(targetSiblingId);
        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        filtered.splice(insertIndex, 0, draggedId);

        console.log(
          `${LOG_PREFIX.DRAG} New sibling order for parent ${parent}:`,
          filtered
        );

        // Rebuild edges in new order
        const newParentEdges = filtered.map((childId, index) => ({
          id: `${parent}-${childId}`,
          source: parent,
          target: childId,
          animated: false,
        }));

        return [...otherEdges, ...newParentEdges];
      });
    },
    [getParent, setEdges]
  );

  return { checkReorderDrop, reorderNodes, findClosestSibling };
}