/**
 * Hook for local physics simulation during drag
 * Pushes neighboring nodes away from the dragged node using D3 forces
 */

import { useCallback, useRef } from 'react';
import { useReactFlow } from 'reactflow';
import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceY,
  forceX,
} from 'd3-force';
import { measureLabel } from '@utils/measurements';
import {
  LAYER_GAP,
  PHYSICS_RADIUS,
  PHYSICS_CONFIG,
  LOGGING_ENABLED,
  LOG_PREFIX,
} from '@utils/constants';

/**
 * useLocalPhysics hook
 * Manages D3 force simulation for drag interactions
 * 
 * @returns {{
 *   start: Function,
 *   stop: Function,
 *   updateDraggedPosition: Function
 * }}
 */
export function useLocalPhysics() {
  const { getNodes, setNodes } = useReactFlow();

  // Simulation state
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const neighborhoodIdsRef = useRef(new Set());
  const draggedIdRef = useRef(null);
  const isRunningRef = useRef(false);

  /**
   * Stops the physics simulation and cleans up
   */
  const stop = useCallback(() => {
    console.log(`${LOG_PREFIX.PHYSICS} Stopping simulation`);

    isRunningRef.current = false;

    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    neighborhoodIdsRef.current = new Set();
    draggedIdRef.current = null;
  }, []);

  /**
   * Starts physics simulation for a dragged node
   * @param {string} draggedId - ID of the node being dragged
   */
  const start = useCallback(
    (draggedId) => {
      console.log(`${LOG_PREFIX.PHYSICS} Starting simulation for ${draggedId}`);

      stop();
      isRunningRef.current = true;
      draggedIdRef.current = draggedId;

      const rfNodes = getNodes();
      const dragged = rfNodes.find((n) => n.id === draggedId);

      if (!dragged) {
        console.error(`${LOG_PREFIX.PHYSICS} Dragged node not found: ${draggedId}`);
        return;
      }

      // Select neighborhood based on layer and distance
      const layerByX = (x) => Math.round(x / LAYER_GAP);
      const centerLayer = layerByX(dragged.position.x);

      const neighborhood = rfNodes.filter((n) => {
        const dx = n.position.x - dragged.position.x;
        const dy = n.position.y - dragged.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const layer = layerByX(n.position.x);
        const isClose = distanceSquared < PHYSICS_RADIUS * PHYSICS_RADIUS;
        const isInLayerRange = Math.abs(layer - centerLayer) <= 1;

        return isInLayerRange && isClose;
      });

      neighborhoodIdsRef.current = new Set(neighborhood.map((n) => n.id));
      console.log(
        `${LOG_PREFIX.PHYSICS} Neighborhood: ${neighborhood.length} nodes in range`
      );

      // Create simulation nodes
      const simNodes = neighborhood.map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        // Fix ALL nodes during drag - only the dragged node moves via ReactFlow
        fx: n.position.x,
        fy: n.position.y,
        r: Math.max(28, measureLabel(n.data.content).height / 2),
        type: n.data.type,
      }));

      // Store original X positions for column alignment
      const originalX = new Map(neighborhood.map((n) => [n.id, n.position.x]));

      // Configure force simulation
      // NOTE: Forces are disabled by fixing all nodes - simulation runs but nodes don't move
      // This keeps the infrastructure in place if we want to re-enable physics later
      const sim = forceSimulation(simNodes)
        .alpha(0) // Set to 0 - no simulation needed when all nodes are fixed
        .stop(); // Stop immediately since all nodes are fixed

      simRef.current = sim;

      // No animation loop needed - all nodes are fixed during drag
      // The dragged node position is updated via updateDraggedPosition if needed
      console.log(`${LOG_PREFIX.PHYSICS} Simulation initialized (nodes fixed during drag)`);
    },
    [getNodes, setNodes, stop]
  );

  /**
   * Updates the dragged node's position in the simulation
   * @param {number} x - New X position
   * @param {number} y - New Y position
   */
  const updateDraggedPosition = useCallback((x, y) => {
    // No-op: All nodes are fixed during drag, so no simulation updates needed
    // ReactFlow handles the dragged node position directly
  }, []);

  return { start, stop, updateDraggedPosition };
}