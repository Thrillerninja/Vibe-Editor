/**
 * NodeReordering.js
 * 
 * Centralizes all node reordering logic for the tree structure
 */

import { useState, useCallback } from 'react';
import { useReordering } from '../../hooks/useReordering';
import { useFlowScreenConverters } from '../../utils/coords';

/**
 * Find the parent of a given node in the tree
 */
function findParent(curr, childId) {
  if (!curr?.children?.length) return null;
  if (curr.children.some((c) => c.id === childId)) return curr;
  for (const ch of curr.children) {
    const res = findParent(ch, childId);
    if (res) return res;
  }
  return null;
}

/**
 * Find a node by ID in the tree
 */
function findNode(curr, id) {
  if (!curr) return null;
  if (curr.id === id) return curr;
  if (!curr.children) return null;
  for (const ch of curr.children) {
    const res = findNode(ch, id);
    if (res) return res;
  }
  return null;
}

/**
 * Remove a node from its parent's children
 * Marks the parent as modified
 */
function removeDragged(curr, draggedParentId, draggedId) {
  if (!curr?.children?.length) return curr;
  if (curr.id === draggedParentId) {
    const children = curr.children.filter((c) => c.id !== draggedId);
    console.log('[NodeReordering] Marking parent', curr.id, 'as modified (child removed)');
    return { ...curr, children, isModified: true };
  }
  const newChildren = curr.children.map(c => removeDragged(c, draggedParentId, draggedId));
  for (let i = 0; i < newChildren.length; i++) {
    if (newChildren[i] !== curr.children[i]) {
      return { ...curr, children: newChildren };
    }
  }
  return curr;
}

/**
 * Insert a dragged node into target parent's children at position relative to targetId
 * Marks both the dragged node and target parent as modified
 */
function insertIntoTargetParent(curr, targetParentId, targetId, insertBefore, draggedNode) {
  if (!curr?.children?.length) return curr;
  if (curr.id === targetParentId) {
    const children = [...curr.children];
    const to = children.findIndex((c) => c.id === targetId);
    if (to === -1) return curr;
    const insertIndex = insertBefore ? to : to + 1;
    // Mark the dragged node as modified (it was reordered)
    const modifiedDraggedNode = { ...draggedNode, isModified: true };
    children.splice(insertIndex, 0, modifiedDraggedNode);
    console.log('[NodeReordering] Marking parent', curr.id, 'as modified (child added at index', insertIndex, ')');
    console.log('[NodeReordering] Marking dragged node', draggedNode.id, 'as modified');
    return { ...curr, children, isModified: true };
  }
  const newChildren = curr.children.map((c) => insertIntoTargetParent(c, targetParentId, targetId, insertBefore, draggedNode));
  for (let i = 0; i < newChildren.length; i++) {
    if (newChildren[i] !== curr.children[i]) {
      return { ...curr, children: newChildren };
    }
  }
  return curr;
}

/**
 * Mark the current node and all its descendants as modified
 */
function markNodeAndDescendantsModified(curr, targetIds) {
  if (!curr) return curr;
  const newChildren = curr.children?.map(c => markNodeAndDescendantsModified(c, targetIds)) || [];
  if (targetIds.includes(curr.id)) {
    console.log('[NodeReordering] Marking node', curr.id, 'and all descendants as modified');
    return { ...curr, children: newChildren, isModified: true };
  }
  return { ...curr, children: newChildren, isModified: curr.isModified };
}

/**
 * Reorder tree children by moving a dragged node before/after a target node
 * Handles reordering across different parents on the same level
 * 
 * @param {Object} tree - The root tree node
 * @param {string} draggedId - ID of the node being dragged
 * @param {string} targetId - ID of the target node (reference point)
 * @param {boolean} insertBefore - Whether to insert before (true) or after (false) the target
 * @returns {Object} The new tree with reordered nodes
 */
export function reorderTreeChildren(tree, draggedId, targetId, insertBefore) {
  const draggedParent = findParent(tree, draggedId);
  const targetParent = findParent(tree, targetId);
  if (!draggedParent || !targetParent) return tree;

  console.log('[NodeReordering] Reordering:', draggedId, '→', insertBefore ? 'before' : 'after', targetId);
  console.log('[NodeReordering] Dragged parent:', draggedParent.id, ', Target parent:', targetParent.id);

  // Remove dragged from its current parent's children
  const withoutDragged = removeDragged(tree, draggedParent.id, draggedId);

  // Find the dragged node object to reinsert
  const draggedNode = findNode(tree, draggedId);
  if (!draggedNode) return tree;

  // Insert dragged into targetParent's children
  const reorderedTree = insertIntoTargetParent(
    withoutDragged,
    targetParent.id,
    targetId,
    insertBefore,
    draggedNode
  );

  // Mark the dragged node and all its descendants as modified
  function markById(curr, id) {
    if (!curr) return curr;
    if (curr.id === id) {
      // Mark this node and all descendants
      const markAll = node => ({
        ...node,
        isModified: true,
        children: node.children ? node.children.map(markAll) : []
      });
      return markAll(curr);
    }
    return {
      ...curr,
      children: curr.children ? curr.children.map(child => markById(child, id)) : []
    };
  }

  const finalTree = markById(reorderedTree, draggedId);
  console.log('[NodeReordering] Reorder complete, marked dragged node and descendants as modified');
  return finalTree;
}

/**
 * Get reordering indicator state for a dragged node
 * Returns the position and dimensions for the visual reorder indicator
 * 
 * @param {Object} node - The ReactFlow node being dragged
 * @param {Function} findClosestSibling - Function from useReordering hook
 * @param {Function} toScreenPoint - Function from useFlowScreenConverters
 * @param {Function} toScreenSize - Function from useFlowScreenConverters
 * @returns {Object|null} Indicator state or null if no valid reorder target
 */
export function getReorderIndicator(node, findClosestSibling, toScreenPoint, toScreenSize) {
  const closest = findClosestSibling(node.id, node.position.y);
  if (closest) {
    const screenPos = toScreenPoint({ x: closest.node.position.x, y: closest.node.position.y });
    const screenSize = toScreenSize({ width: closest.node.width || 200, height: closest.node.height || 60 });
    return {
      x: screenPos.x,
      y: screenPos.y + (closest.insertBefore ? 0 : screenSize.height),
      width: screenSize.width,
      isAbove: closest.insertBefore,
    };
  }
  return null;
}

/**
 * Custom hook to manage all reordering state and callbacks
 * Encapsulates draggedId, reorderIndicator, reorderActive state and all related handlers
 * This function concerns all issues with node reordering, reparenting etc. Whenever nodes move, this should handle it.
 */
export function useNodeReordering(tree, setTree, rfRef, nodes, setNodes, setEdges, treeToElkNodes, treeToElkEdges, runElk, handleNodeEdit) {
  const [draggedId, setDraggedId] = useState(null);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const [reorderActive, setReorderActive] = useState(false);

  const { findClosestSibling, checkReorderDrop } = useReordering();
  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();

  const onNodeDragStart = useCallback((_, node) => {
    setDraggedId(node.id);
  }, []);

  const onNodeDrag = useCallback((_, node) => {
    // Compute closest sibling at same level and show separator
    const indicator = getReorderIndicator(node, findClosestSibling, toScreenPoint, toScreenSize);
    if (indicator) {
      setReorderIndicator(indicator);
      setReorderActive(true);
    } else {
      setReorderIndicator(null);
      setReorderActive(false);
    }
    
    // Update edges for the dragged node during drag
    if (rfRef.current?.updateNodeInternals) {
      //rfRef.current.updateNodeInternals(node.id);
    }
  }, [findClosestSibling, toScreenPoint, toScreenSize, draggedId]);

  const onNodeDragStop = useCallback((_, node) => {
    const reorder = checkReorderDrop(node.id, node.position.y);
    setReorderIndicator(null);
    setDraggedId(null);
    
    // Only modify tree if there's an actual reorder and indicator was active
    if (reorder && reorderActive) {
      const newTree = reorderTreeChildren(
        tree,
        node.id,
        reorder.targetSiblingId,
        reorder.insertBefore
      );
      setTree(newTree);
    }
    
    // That's it - no snapback, no animations, no timeouts
  }, [checkReorderDrop, tree, setTree, reorderActive]);

  return {
    draggedId,
    reorderIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
