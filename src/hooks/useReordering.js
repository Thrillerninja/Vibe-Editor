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
   * Calculate the depth/level of each node in the tree
   */
  const getNodeDepths = useCallback(() => {
    const depths = new Map();
    const edges = getEdges();

    // Find root nodes (nodes with no incoming edges)
    const allTargets = new Set(edges.map(e => e.target));
    const allSources = new Set(edges.map(e => e.source));
    const roots = [...allSources].filter(id => !allTargets.has(id));

    // BFS to calculate depths
    const queue = roots.map(id => ({ id, depth: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
      const { id, depth } = queue.shift();

      if (visited.has(id)) continue;
      visited.add(id);
      depths.set(id, depth);

      // Add children to queue
      const children = edges.filter(e => e.source === id).map(e => e.target);
      for (const childId of children) {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }

    return depths;
  }, [getEdges]);

  /**
   * Get all nodes at the same level (depth) as the given node
   */
  const getNodesAtSameLevel = useCallback(
    (nodeId) => {
      const depths = getNodeDepths();
      const nodeDepth = depths.get(nodeId);

      if (nodeDepth === undefined) return [];

      // Find all nodes at the same depth, excluding the dragged node
      const nodesAtLevel = [];
      for (const [id, depth] of depths.entries()) {
        if (depth === nodeDepth && id !== nodeId) {
          nodesAtLevel.push(id);
        }
      }

      return nodesAtLevel;
    },
    [getNodeDepths]
  );

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
   * Find closest node at same level during drag for indicator
   * Now supports cross-parent reordering on same level
   * Also supports inserting after the last child
   */
  const findClosestSibling = useCallback(
    (draggedId, currentY) => {
      const nodes = getNodes();
      const nodesAtLevel = getNodesAtSameLevel(draggedId);

      console.log(
        `${LOG_PREFIX.DRAG} Checking reorder: node ${draggedId}, Y=${currentY.toFixed(1)}, ${nodesAtLevel.length} nodes at same level`
      );

      if (nodesAtLevel.length === 0) {
        console.log(`${LOG_PREFIX.DRAG}   ❌ No nodes at same level found`);
        return null;
      }

      let closestNode = null;
      let minDistance = Infinity;
      let insertBefore = false;

      // Find the node with minimum distance
      for (const nodeId of nodesAtLevel) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const distance = Math.abs(node.position.y - currentY);

        if (distance < minDistance) {
          minDistance = distance;
          closestNode = node;
          insertBefore = currentY < node.position.y;
        }
      }

      // Check if we're within threshold of the closest node
      if (closestNode && minDistance < REORDER_THRESHOLD) {
        console.log(
          `${LOG_PREFIX.DRAG}   ✅ Found closest node at same level: ${closestNode.id} (${minDistance.toFixed(1)}px, threshold=${REORDER_THRESHOLD}px)`
        );
        return { node: closestNode, insertBefore };
      }

      // Special case: Check if we're below the last child (to insert after it)
      // Find the bottommost node at this level
      const nodesWithPositions = nodesAtLevel
        .map(nodeId => nodes.find(n => n.id === nodeId))
        .filter(Boolean)
        .sort((a, b) => b.position.y - a.position.y); // Sort descending by Y

      if (nodesWithPositions.length > 0) {
        const lastNode = nodesWithPositions[0];
        const nodeHeight = lastNode.height || 60;
        const distanceBelowLast = currentY - (lastNode.position.y + nodeHeight);

        // If we're below the last node and within a reasonable distance, show indicator
        if (distanceBelowLast > 0 && distanceBelowLast < REORDER_THRESHOLD * 2) {
          console.log(
            `${LOG_PREFIX.DRAG}   ✅ Below last child: ${lastNode.id} (${distanceBelowLast.toFixed(1)}px below)`
          );
          return { node: lastNode, insertBefore: false };
        }
      }

      console.log(
        `${LOG_PREFIX.DRAG}   ❌ Closest node too far: ${minDistance.toFixed(1)}px > ${REORDER_THRESHOLD}px`
      );
      return null;
    },
    [getNodes, getNodesAtSameLevel]
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
   * Supports both same-parent and cross-parent reordering
   * Returns reorder info so the caller can apply it to the sentences array
   */
  const reorderNodes = useCallback(
    (draggedId, targetSiblingId, insertBefore) => {
      console.log(
        `${LOG_PREFIX.DRAG} Preparing reorder: ${draggedId} → ${targetSiblingId} (${insertBefore ? 'before' : 'after'})`
      );
      // Track reordering
      posthog.capture('node_reordered', {
        dragged_node_id: draggedId,
        target_node_id: targetSiblingId,
        insert_before: insertBefore,
        operation: 'reorder',
      });

      // Return reorder info so TreeInner can apply it to sentences
      return {
        draggedId,
        targetSiblingId,
        insertBefore,
      };
    },
    []
  );

  return { checkReorderDrop, reorderNodes, findClosestSibling };
}