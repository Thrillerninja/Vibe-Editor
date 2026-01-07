/**
 * @fileoverview TreeInner - Core tree visualization and interaction logic
 *
 * Manages ReactFlow visualization, drag-and-drop reordering/reparenting,
 * automatic layout, and node editing with emotion support.
 *
 * ARCHITECTURE:
 * - ReactFlow for visualization
 * - ELK for automatic hierarchical layout
 * - Physics engine for drag-drop feedback
 * - nodeMap as single source of truth
 *
 * @typedef {import('../types/node').Node} Node
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useReactFlow,
  useEdgesState,
  useNodesState,
  addEdge,
} from 'reactflow';

import { AnimatedNodeComponent } from './AnimatedNodeComponent';

// Utils
import posthog from '../../utils/posthog';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';
import { runElk } from '../../utils/layoutEngine';
import { useFlowScreenConverters } from '../../utils/coords';

// Hooks
import { useReparenting } from '../../hooks/useReparenting';
import { useLocalPhysics } from '../../hooks/useLocalPhysics';
import { useReordering } from '../../hooks/useReordering';

// Node Utils
import {
  cloneNode,
  markNodeDirty,
  getDescendants,
  isGroupNode,
  isContentNode,
} from '../../types/node';

// Constants
const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner - Renders and manages tree visualization
 *
 * Responsibilities:
 * - Build ReactFlow nodes/edges from nodeMap
 * - Layout visualization using ELK
 * - Handle drag-drop (reorder, reparent)
 * - Manage node editing and deletion
 * - Sync tree changes back to parent
 *
 * @param {Object} props
 * @param {string} props.rootId - Root node ID
 * @param {Map<string, Node>} props.nodeMap - All nodes
 * @param {(nodeMap: Map<string, Node>) => void} props.onTreeUpdate - Update callback
 * @returns {React.ReactElement}
 */
export function TreeInner({ rootId, nodeMap, onTreeUpdate }) {
  console.log('[TreeInner] Component rendering with', nodeMap.size, 'nodes');

  // =========================================================================
  // ReactFlow State
  // =========================================================================

  /** @type {[Array, Function, Function]} */
  const [nodes, setNodes, onNodesChange] = useNodesState([]);

  /** @type {[Array, Function, Function]} */
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  /** @type {React.MutableRefObject<any>} */
  const rfRef = useRef(null);

  /** @type {React.MutableRefObject<HTMLDivElement>} */
  const containerRef = useRef(null);

  
  // =========================================================================
  //    Drag State
  // =========================================================================

  /**
   * Is currently dragging a node
   * @type {React.MutableRefObject<boolean>}
   */
  const isDraggingRef = useRef(false);

  /**
   * ID of node being dragged
   * @type {React.MutableRefObject<string | null>}
   */
  const draggedNodeIdRef = useRef(null);

  /**
   * Tree structure changed during drag
   * @type {React.MutableRefObject<boolean>}
   */
  const treeChangedRef = useRef(false);

  /**
   * Original positions before drag (for snap-back)
   * @type {React.MutableRefObject<Object>}
   */
  const originalNodePositionsRef = useRef({});

  /**
   * Animate layout after drop
   * @type {React.MutableRefObject<boolean>}
   */
  const animateNextRef = useRef(false);

  // =========================================================================
  //     Visual Feedback State
  // =========================================================================

  /**
   * Reorder indicator (shows where node will go)
   * @type {[Object | null, Function]}
   */
  const [reorderIndicator, setReorderIndicator] = useState(null);

  /**
   * Reparent target (shows drop zone)
   * @type {[Object | null, Function]}
   */
  const [reparentTarget, setReparentTarget] = useState(null);

  /**
   * Show debug hitboxes (F8 key)
   * @type {[boolean, Function]}
   */
  const [showDebugHitboxes, setShowDebugHitboxes] = useState(false);

  // =========================================================================
  //     References (Keep in Sync)
  // =========================================================================

  /**
   * Keep nodeMap ref current
   * @type {React.MutableRefObject<Map<string, Node>>}
   */
  const nodeMapRef = useRef(nodeMap);

  useEffect(() => {
    nodeMapRef.current = nodeMap;
  }, [nodeMap]);

  /**
   * Track previous nodeMap structure
   * @type {React.MutableRefObject<string | null>}
   */
  const prevNodeMapKeyRef = useRef(null);

  // =========================================================================
  //     Custom hooks
  // =========================================================================

  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();
  const { onDropToReparent, findReparentTarget } = useReparenting();
  const physics = useLocalPhysics();
  const { checkReorderDrop, findClosestSibling } = useReordering();
  const {
    flowToScreenPosition,
    setCenter,
    getZoom,
    zoomIn,
    zoomOut,
    fitView,
  } = useReactFlow();

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  // =========================================================================
  // SECTION: Initialization
  // =========================================================================

  /**
   * Component lifecycle logging
   */
  useEffect(() => {
    return () => {
      physics.stop();
    };
  }, []);

  /**
   * Toggle debug hitboxes with F8
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F8') {
        setShowDebugHitboxes((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebugHitboxes]);

  // =========================================================================
  // SECTION: Node Modification Helpers
  // =========================================================================

  /**
   * Reparent a node under a new parent
   * Updates hierarchy and marks dirty
   *
   * @param {string} nodeId - Node to reparent
   * @param {string} newParentId - New parent ID
   */
  const reparentNode = useCallback(
    (nodeId, newParentId) => {
      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);
      const newParent = updated.get(newParentId);

      if (!node) {
        console.error(`[TreeInner] Cannot reparent: node ${nodeId} not found`);
        return;
      }

      if (!newParent) {
        console.error(
          `[TreeInner] Cannot reparent: parent ${newParentId} not found`
        );
        return;
      }

      if (nodeId === newParentId) {
        console.warn('[TreeInner] Cannot reparent node to itself');
        return;
      }

      // Remove from old parent
      if (node.hierarchy.parentId) {
        const oldParent = updated.get(node.hierarchy.parentId);
        if (oldParent) {
          const oldParentClone = cloneNode(oldParent);
          oldParentClone.hierarchy.childIds =
            oldParentClone.hierarchy.childIds.filter((id) => id !== nodeId);
          updated.set(oldParent.id, oldParentClone);
        }
      }

      // Update node
      const nodeClone = cloneNode(node);
      nodeClone.hierarchy.parentId = newParentId;
      nodeClone.hierarchy.level = newParent.hierarchy.level + 1;
      nodeClone.metadata.isDirty = true;
      nodeClone.metadata.modifiedAt = new Date().toISOString();
      updated.set(nodeId, nodeClone);

      // Add to new parent
      const newParentClone = cloneNode(newParent);
      if (!newParentClone.hierarchy.childIds.includes(nodeId)) {
        newParentClone.hierarchy.childIds.push(nodeId);
      }
      updated.set(newParentId, newParentClone);

      treeChangedRef.current = true;
      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Reorder a node relative to a sibling (same parent)
   * Validates and updates hierarchy
   *
   * @param {string} nodeId - Node to reorder
   * @param {string} targetSiblingId - Target sibling
   * @param {boolean} insertBefore - Insert before or after
   */
  const reorderNode = useCallback(
    (nodeId, targetSiblingId, insertBefore) => {
      console.log(
        `[TreeInner] Reorder START: ${nodeId.substring(0, 8)} ${
          insertBefore ? 'BEFORE' : 'AFTER'
        } ${targetSiblingId.substring(0, 8)}`
      );

      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);
      const sibling = updated.get(targetSiblingId);

      // ===== VALIDATION =====
      if (!node) {
        console.error(`[TreeInner] ❌ Node ${nodeId} not found`);
        return false;
      }

      if (!sibling) {
        console.error(`[TreeInner] ❌ Sibling ${targetSiblingId} not found`);
        return false;
      }

      const sameParent = node.hierarchy.parentId === sibling.hierarchy.parentId;
      console.log(
        `[TreeInner] Same parent? ${sameParent} (${node.hierarchy.parentId} vs ${sibling.hierarchy.parentId})`
      );

      if (!sameParent) {
        console.error('[TreeInner] ❌ Different parents - not reordering');
        return false;
      }

      const parentId = node.hierarchy.parentId;
      const parent = updated.get(parentId);

      if (!parent) {
        console.error(`[TreeInner] ❌ Parent ${parentId} not found`);
        return false;
      }

      console.log(
        `[TreeInner] Parent found: ${parentId.substring(0, 8)}, current children: [${parent.hierarchy.childIds
          .slice(0, 3)
          .map((id) => id.substring(0, 8))
          .join(', ')}]`
      );

      // ===== PERFORM REORDER =====
      const parentClone = cloneNode(parent);
      const childIds = [...parentClone.hierarchy.childIds];

      const nodeIndex = childIds.indexOf(nodeId);
      if (nodeIndex === -1) {
        console.error(`[TreeInner] ❌ Node not in parent's children`);
        return false;
      }

      console.log(`[TreeInner] Node at index ${nodeIndex}, removing...`);
      childIds.splice(nodeIndex, 1);

      const siblingIndex = childIds.indexOf(targetSiblingId);
      if (siblingIndex === -1) {
        console.error(
          `[TreeInner] ❌ Sibling not in parent's children after removal`
        );
        return false;
      }

      const insertIndex = insertBefore ? siblingIndex : siblingIndex + 1;
      console.log(
        `[TreeInner] Inserting at index ${insertIndex} (insertBefore=${insertBefore})`
      );

      childIds.splice(insertIndex, 0, nodeId);

      console.log(
        `[TreeInner] New order: [${childIds
          .slice(0, 3)
          .map((id) => id.substring(0, 8))
          .join(', ')}]`
      );

      // ===== UPDATE PARENT =====
      parentClone.hierarchy.childIds = childIds;
      parentClone.metadata.modifiedAt = new Date().toISOString();
      updated.set(parentId, parentClone);

      // ===== MARK NODE DIRTY =====
      const nodeClone = cloneNode(node);
      nodeClone.metadata.isDirty = true;
      nodeClone.metadata.modifiedAt = new Date().toISOString();
      updated.set(nodeId, nodeClone);

      console.log('[TreeInner] ✅ Reorder complete: parent and node updated');

      treeChangedRef.current = true;
      onTreeUpdate(updated);
      return true;
    },
    [onTreeUpdate]
  );

  // =========================================================================
  // SECTION: Tree Building & Layout
  // =========================================================================

  /**
   * Check if nodeMap structure has changed (not just position)
   * Uses structure hash to avoid redundant layouts
   *
   * @returns {boolean}
   */
  const hasNodeMapStructureChanged = useCallback(() => {
    if (!prevNodeMapKeyRef.current) return true;

    const structureKey = Array.from(nodeMap.values())
      .map((n) => {
        const children = (n.hierarchy.childIds ?? []).join(',');
        return `${n.id}:${n.hierarchy.parentId ?? ''}:[${children}]`;
      })
      .sort()
      .join('|');

    const changed = structureKey !== prevNodeMapKeyRef.current;
    prevNodeMapKeyRef.current = structureKey;

    return changed;
  }, [nodeMap]);

  /**
   * Build ReactFlow nodes and edges from nodeMap
   * Validates all edge references
   *
   * @returns {{nodes: Array, edges: Array}}
   */
  const buildFlowStructure = useCallback(() => {
  const flowNodes = [];
  const flowEdges = [];

  const visited = new Set();
  const orderedIds = [];

  const dfs = (id) => {
    if (visited.has(id)) return;
    visited.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    orderedIds.push(id);

    const children = node.hierarchy.childIds ?? [];
    for (const childId of children) dfs(childId);
  };

  dfs(rootId);

  // include any disconnected/orphan nodes deterministically
  for (const id of nodeMap.keys()) {
    if (!visited.has(id)) orderedIds.push(id);
  }

  for (const id of orderedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;

    flowNodes.push({
      id: node.id,
      data: {
        label: node.content,
        content: node.content,
        type: node.type,
        level: node.hierarchy.level,
        emotion: node.emotion,
        metadata: node.metadata,
        isDirty: node.metadata.isDirty,
        structure: node.structure,
      },
      position: { x: 0, y: 0 },
      type: 'animatedNode',
      style: { width: 'auto', height: 'auto' },
    });

    if (node.hierarchy.parentId && nodeMap.has(node.hierarchy.parentId)) {
      flowEdges.push({
        id: `${node.hierarchy.parentId}-${node.id}`,
        source: node.hierarchy.parentId,
        target: node.id,
        animated: false,
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges };
}, [nodeMap, rootId]);

  /**
   * Apply layout to nodes using ELK algorithm
   * Skips if structure hasn't changed or dragging
   */
  const layoutRunIdRef = useRef(0);
  const applyLayout = useCallback(async () => {
    const runId = ++layoutRunIdRef.current;
    if (isDraggingRef.current) return;

    if (!hasNodeMapStructureChanged()) return;

    try {
      const { nodes: flowNodes, edges: flowEdges } = buildFlowStructure();

      if (flowNodes.length === 0) return;

      const laidOut = await runElk(flowNodes, flowEdges);


      if (runId !== layoutRunIdRef.current) return; // discard stale result
      if (isDraggingRef.current) return;
      
      if (!isDraggingRef.current) {
        if (animateNextRef.current && containerRef.current) {
          containerRef.current.classList.add('rf-animate-drop');
        }

        setNodes(laidOut);
        setEdges(flowEdges);

        if (animateNextRef.current && containerRef.current) {
          setTimeout(() => {
            containerRef.current?.classList.remove('rf-animate-drop');
            animateNextRef.current = false;
          }, 300);
        }
      }
    } catch (err) {
      console.error('[TreeInner] Layout error:', err);
    }
  }, [buildFlowStructure, hasNodeMapStructureChanged, setNodes, setEdges]);

  /**
   * Apply layout when structure changes
   */
  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  /**
   * Re-apply layout when tree changed during drag
   */
  useEffect(() => {
    if (treeChangedRef.current && !isDraggingRef.current) {
      applyLayout();
      treeChangedRef.current = false;
    }
  }, [nodeMap, applyLayout]);

  // =========================================================================
  // SECTION: Node Utilities
  // =========================================================================

  /**
   * Get all descendant leaf nodes
   * Used for subtree editing in dialog
   *
   * @param {string} nodeId - Starting node
   * @returns {Node[]}
   */
  const getDescendantLeaves = useCallback((nodeId) => {
    const node = nodeMapRef.current.get(nodeId);
    if (!node) return [];

    const leaves = [];
    const queue = [node];

    while (queue.length) {
      const current = queue.shift();

      if (!current.hierarchy.childIds || current.hierarchy.childIds.length === 0) {
        leaves.push(current);
      } else {
        current.hierarchy.childIds.forEach((childId) => {
          const child = nodeMapRef.current.get(childId);
          if (child) queue.push(child);
        });
      }
    }

    return leaves;
  }, []);

  // =========================================================================
  // SECTION: ReactFlow Handlers
  // =========================================================================

  /**
   * ReactFlow initialization
   * @param {Object} instance
   */
  const onInit = useCallback((instance) => {
    rfRef.current = instance;
  }, []);

  /**
   * Drag start - store original position, start physics
   * @param {React.DragEvent} event
   * @param {Object} rfNode - ReactFlow node
   */
  const onNodeDragStart = useCallback(
    (event, rfNode) => {
      isDraggingRef.current = true;
      draggedNodeIdRef.current = rfNode.id;
      treeChangedRef.current = false;

      originalNodePositionsRef.current[rfNode.id] = {
        x: rfNode.position.x,
        y: rfNode.position.y,
      };

      physics.start(rfNode.id);
      physics.updateDraggedPosition(rfNode.position.x, rfNode.position.y);
    },
    [physics]
  );

  /**
   * During drag - update physics, show indicators
   * @param {React.DragEvent} event
   * @param {Object} rfNode - ReactFlow node
   */
  const onNodeDrag = useCallback(
    (event, rfNode) => {
      physics.updateDraggedPosition(rfNode.position.x, rfNode.position.y);

      // Check for reorder (same parent)
      const closest = findClosestSibling(
        rfNode.id,
        rfNode.position.y,
        nodeMapRef.current
      );

      if (closest) {
        const screenPos = toScreenPoint({
          x: closest.node.position.x,
          y: closest.node.position.y,
        });
        const screenSize = toScreenSize({
          width: closest.node.width ?? 200,
          height: closest.node.height ?? 60,
        });

        setReorderIndicator({
          x: screenPos.x + screenSize.width / 2,
          y: screenPos.y + (closest.insertBefore ? 0 : screenSize.height),
          width: screenSize.width,
          isAbove: closest.insertBefore,
        });
        setReparentTarget(null);
      } else {
        // Check for reparent (different parent)
        setReorderIndicator(null);

        const target = findReparentTarget(
          rfNode.id,
          rfNode.position.x,
          rfNode.position.y,
          nodeMapRef.current
        );

        if (target) {
          const screenPos = toScreenPoint({
            x: target.position.x,
            y: target.position.y,
          });
          const screenSize = toScreenSize({
            width: target.width || 200,
            height: target.height || 60,
          });

          setReparentTarget({
            node: target,
            screenPosition: screenPos,
            screenSize: screenSize,
          });
        } else {
          setReparentTarget(null);
        }
      }
    },
    [physics, findClosestSibling, findReparentTarget, toScreenPoint, toScreenSize]
  );

  /**
   * Drag end - perform reorder/reparent or snap back
   * @param {React.DragEvent} event
   * @param {Object} rfNode - ReactFlow node
   */
  const onNodeDragStop = useCallback(
    (event, rfNode) => {
      isDraggingRef.current = false;
      setReorderIndicator(null);
      setReparentTarget(null);
      animateNextRef.current = true;

      let actionTaken = false;

      // Try reorder first (tighter threshold)
      const reorderInfo = checkReorderDrop(
        rfNode.id,
        rfNode.position.y,
        nodeMapRef.current
      );

      if (reorderInfo) {
        reorderNode(
          rfNode.id,
          reorderInfo.targetSiblingId,
          reorderInfo.insertBefore
        );
        actionTaken = true;
      } else {
        // Try reparent
        const target = findReparentTarget(
          rfNode.id,
          rfNode.position.x,
          rfNode.position.y,
          nodeMapRef.current
        );

        if (target) {
          reparentNode(rfNode.id, target.id);
          actionTaken = true;
        }
      }

      physics.stop();

      // Snap back if no action
      if (!actionTaken) {
        const originalPos = originalNodePositionsRef.current[rfNode.id];
        if (originalPos) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === rfNode.id ? { ...n, position: originalPos } : n
            )
          );
        }
      }

      delete originalNodePositionsRef.current[rfNode.id];
    },
    [checkReorderDrop, findReparentTarget, reorderNode, reparentNode, physics, setNodes]
  );

  /**
   * Handle edge connections
   * @param {Object} params
   */
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({ ...params, animated: false }, eds));
    },
    [setEdges]
  );

  // =========================================================================
  // SECTION: Node Editing
  // =========================================================================

  /**
   * Edit node content and emotion
   * @param {string} nodeId
   * @param {string} newContent
   * @param {Object} emotionProfile
   */
  const applyNodeEdit = useCallback(
    (nodeId, newContent, emotionProfile) => {
      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) return;

      const editedNode = cloneNode(node);
      const contentChanged = editedNode.content !== newContent;
      editedNode.content = newContent;

      if (emotionProfile) {
        editedNode.emotion = emotionProfile;
      }

      if (contentChanged) {
        editedNode.metadata.isDirty = true;
        editedNode.metadata.modifiedAt = new Date().toISOString();
        editedNode.metadata.version += 1;
      }

      updated.set(nodeId, editedNode);
      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Apply emotion to subtree
   * @param {string} nodeId
   * @param {Object} emotionProfile
   */
  const applyEmotionToSubtree = useCallback(
    (nodeId, emotionProfile) => {
      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) return;

      const updatedNode = cloneNode(node);
      updatedNode.emotion = emotionProfile;
      updated.set(nodeId, updatedNode);

      const descendants = getDescendants(node, nodeMapRef.current);
      descendants.forEach((descendant) => {
        const cloned = cloneNode(descendant);
        cloned.emotion = updatedNode.emotion;
        updated.set(descendant.id, cloned);
      });

      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Apply changes to subtree (emotion + text edits)
   * @param {string} nodeId
   * @param {Object} emotionProfile
   * @param {Object} edits - Map of leafId → newContent
   */
  const applySubtreeChanges = useCallback(
    (nodeId, emotionProfile, edits) => {
      const updated = new Map(nodeMapRef.current);

      // Apply emotion to subtree
      const node = updated.get(nodeId);
      if (node) {
        const nodeClone = cloneNode(node);
        nodeClone.emotion = emotionProfile;
        nodeClone.metadata.isDirty = true;
        updated.set(nodeId, nodeClone);
      }

      // Apply text edits
      for (const [leafId, newContent] of Object.entries(edits)) {
        const leaf = updated.get(leafId);
        if (leaf && leaf.content !== newContent) {
          const leafClone = cloneNode(leaf);
          leafClone.content = newContent;
          leafClone.metadata.isDirty = true;
          leafClone.metadata.modifiedAt = new Date().toISOString();
          updated.set(leafId, leafClone);
        }
      }

      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Delete a node from tree
   * @param {string} nodeId
   */
  const deleteNode = useCallback(
    (nodeId) => {
      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) return;

      // Remove from parent
      if (node.hierarchy.parentId) {
        const parent = updated.get(node.hierarchy.parentId);
        if (parent) {
          const parentClone = cloneNode(parent);
          parentClone.hierarchy.childIds = parentClone.hierarchy.childIds.filter(
            (id) => id !== nodeId
          );
          updated.set(node.hierarchy.parentId, parentClone);
        }
      }

      // Remove node and edges
      updated.delete(nodeId);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );

      onTreeUpdate(updated);
    },
    [onTreeUpdate, setNodes, setEdges]
  );

  // =========================================================================
  // SECTION: Node Data Enrichment
  // =========================================================================

  /**
   * Attach handlers and utilities to all nodes
   * Makes them available to node components
   */
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((rfNode) => ({
        ...rfNode,
        data: {
          ...rfNode.data,
          applyNodeEdit,
          applyEmotionToSubtree,
          applySubtreeChanges,
          deleteNode,
          getDescendantLeaves,
        },
      })),
    [nodes, applyNodeEdit, applyEmotionToSubtree, applySubtreeChanges, deleteNode, getDescendantLeaves]
  );

  // =========================================================================
  // SECTION: Render
  // =========================================================================

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onInit={onInit}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
        elevateEdgesOnSelect
        minZoom={0.2}
        maxZoom={1.5}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" color="#e0e3e7ff" gap={40} size={4} />
        <MiniMap pannable zoomable position="bottom-left" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {/* Reorder Indicator */}
      {reorderIndicator && (
        <div
          style={{
            position: 'fixed',
            left: reorderIndicator.x - reorderIndicator.width / 2,
            top: reorderIndicator.y + (reorderIndicator.isAbove ? -10 : 10),
            width: reorderIndicator.width,
            height: 4,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 10000,
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.7)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -25,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Reorder {reorderIndicator.isAbove ? '↑' : '↓'}
          </div>
        </div>
      )}

      {/* Reparent Indicator */}
      {reparentTarget && (
        <div
          style={{
            position: 'fixed',
            left: reparentTarget.screenPosition.x,
            top: reparentTarget.screenPosition.y,
            width: reparentTarget.screenSize.width || 200,
            height: reparentTarget.screenSize.height || 60,
            border: '3px solid #10b981',
            borderRadius: 10,
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.6)',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
          }}
        >
          {/* Corner indicators */}
          {[
            { top: -8, left: -8 },
            { top: -8, right: -8 },
            { bottom: -8, left: -8 },
            { bottom: -8, right: -8 },
          ].map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                ...pos,
                width: 16,
                height: 16,
                backgroundColor: '#10b981',
                borderRadius: '50%',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
              }}
            />
          ))}

          {/* Label */}
          <div
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#10b981',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Drop to attach here
          </div>
        </div>
      )}

      {/* Debug Hitboxes */}
      {showDebugHitboxes &&
        nodes.map((rfNode) => {
          const screenPos = toScreenPoint({
            x: rfNode.position.x,
            y: rfNode.position.y,
          });
          const screenSize = toScreenSize({
            width: rfNode.width || 200,
            height: rfNode.height || 60,
          });

          return (
            <div
              key={`hitbox-${rfNode.id}`}
              style={{
                position: 'fixed',
                left: screenPos.x,
                top: screenPos.y,
                width: screenSize.width,
                height: screenSize.height,
                border: '2px dashed rgba(255, 0, 255, 0.5)',
                backgroundColor: 'rgba(255, 0, 255, 0.05)',
                pointerEvents: 'none',
                zIndex: 8888,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: 'magenta',
                fontWeight: 'bold',
              }}
            >
              {rfNode.id}
              <br />
              {rfNode.width?.toFixed(0)}x{rfNode.height?.toFixed(0)}
            </div>
          );
        })}
    </div>
  );
}

export default TreeInner;