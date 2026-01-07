import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import posthog from '../utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '../utils/constants';

const REORDER_THRESHOLD = 60;

export function useReordering() {
  const { getNodes, getEdges } = useReactFlow();

  /**
   * Determines if a node is a leaf node (sentence, not a group)
   */
  const isLeafNode = useCallback((nodeId, nodes) => {
    const node = nodes.find(n => n.id === nodeId);
    // A leaf node is one that is a sentence (data.type === 'sentence' or no children)
    if (!node) return false;
    
    const edges = getEdges();
    const hasChildren = edges.some(e => e.source === nodeId);
    
    return !hasChildren; // Leaf if no outgoing edges
  }, [getEdges]);

  /**
   * Get all leaf nodes at the same hierarchical level as the dragged node
   */
  const getLeafNodesAtSameLevel = useCallback(
    (nodeId) => {
      const nodes = getNodes();
      const edges = getEdges();
      
      // Get depth of dragged node
      const depths = new Map();
      const allTargets = new Set(edges.map(e => e.target));
      const allSources = new Set(edges.map(e => e.source));
      const roots = [...allSources].filter(id => !allTargets.has(id));

      const queue = roots.map(id => ({ id, depth: 0 }));
      const visited = new Set();

      while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        depths.set(id, depth);

        const children = edges.filter(e => e.source === id).map(e => e.target);
        for (const childId of children) {
          queue.push({ id: childId, depth: depth + 1 });
        }
      }

      const draggedDepth = depths.get(nodeId);
      if (draggedDepth === undefined) return [];

      // Find all leaf nodes at same depth (excluding dragged node)
      const leafNodesAtLevel = [];
      for (const [id, depth] of depths.entries()) {
        if (depth === draggedDepth && id !== nodeId) {
          if (isLeafNode(id, nodes)) {
            leafNodesAtLevel.push(id);
          }
        }
      }

      return leafNodesAtLevel;
    },
    [getNodes, getEdges, isLeafNode]
  );

  /**
   * Find closest leaf node at same level during drag
   */
  const findClosestSibling = useCallback(
    (draggedId, currentY) => {
      const nodes = getNodes();
      const leafNodesAtLevel = getLeafNodesAtSameLevel(draggedId);

      console.log(
        `${LOG_PREFIX.DRAG} Checking reorder: node ${draggedId}, Y=${currentY.toFixed(
          1
        )}, ${leafNodesAtLevel.length} leaf nodes at same level`
      );

      if (leafNodesAtLevel.length === 0) {
        console.log(`${LOG_PREFIX.DRAG}   ❌ No leaf nodes at same level`);
        return null;
      }

      let closestNode = null;
      let minDistance = Infinity;
      let insertBefore = false;

      for (const nodeId of leafNodesAtLevel) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        const distance = Math.abs(node.position.y - currentY);

        if (distance < minDistance) {
          minDistance = distance;
          closestNode = node;
          insertBefore = currentY < node.position.y;
        }
      }

      if (closestNode && minDistance < REORDER_THRESHOLD) {
        console.log(
          `${LOG_PREFIX.DRAG}   ✅ Found closest leaf node: ${closestNode.id} (${minDistance.toFixed(
            1
          )}px)`
        );
        return { node: closestNode, insertBefore };
      }

      console.log(
        `${LOG_PREFIX.DRAG}   ❌ Closest node too far: ${minDistance.toFixed(
          1
        )}px > ${REORDER_THRESHOLD}px`
      );
      return null;
    },
    [getNodes, getLeafNodesAtSameLevel]
  );

  /**
   * Check if drop should trigger reordering (leaf nodes only)
   */
  const checkReorderDrop = useCallback(
    (draggedId, dropY) => {
      const nodes = getNodes();
      const draggedNode = nodes.find(n => n.id === draggedId);

      // Only allow reordering for leaf nodes
      if (!isLeafNode(draggedId, nodes)) {
        console.log(
          `${LOG_PREFIX.DRAG} Cannot reorder non-leaf node: ${draggedId}`
        );
        return null;
      }

      const closest = findClosestSibling(draggedId, dropY);

      if (closest) {
        console.log(
          `${LOG_PREFIX.DRAG} Reorder detected: ${draggedId} ${
            closest.insertBefore ? 'before' : 'after'
          } ${closest.node.id}`
        );

        posthog.capture('node_reordered', {
          dragged_node_id: draggedId,
          target_node_id: closest.node.id,
          insert_before: closest.insertBefore,
          operation: 'cross_parent_reorder',
        });

        return {
          targetSiblingId: closest.node.id,
          insertBefore: closest.insertBefore,
        };
      }

      return null;
    },
    [getNodes, isLeafNode, findClosestSibling]
  );

  return { checkReorderDrop, findClosestSibling, isLeafNode };
}