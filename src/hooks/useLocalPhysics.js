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
import { measureLabel } from '../utils/measurements';
import {
  LAYER_GAP,
  PHYSICS_RADIUS,
  PHYSICS_CONFIG,
  LOGGING_ENABLED,
  LOG_PREFIX,
} from '../utils/constants';

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
        fx: n.id === draggedId ? n.position.x : null,
        fy: n.id === draggedId ? n.position.y : null,
        r: Math.max(28, measureLabel(n.data.label).height / 2),
        type: n.data.type,
      }));

      // Store original X positions for column alignment
      const originalX = new Map(neighborhood.map((n) => [n.id, n.position.x]));

      // Configure force simulation
      const sim = forceSimulation(simNodes)
        .alpha(PHYSICS_CONFIG.alpha)
        .alphaDecay(PHYSICS_CONFIG.alphaDecay)
        .velocityDecay(PHYSICS_CONFIG.velocityDecay)
        .force(
          'charge',
          forceManyBody()
            .strength((d) =>
              d.id === draggedId
                ? PHYSICS_CONFIG.repulsion * PHYSICS_CONFIG.repulsionMultiplier
                : PHYSICS_CONFIG.repulsion
            )
            .distanceMax(PHYSICS_RADIUS)
        )
        .force(
          'collide',
          forceCollide()
            .radius((d) => d.r + PHYSICS_CONFIG.collide)
            .iterations(PHYSICS_CONFIG.collideIterations)
        )
        .force(
          'x',
          forceX((d) =>
            d.id === draggedId ? d.fx ?? d.x : originalX.get(d.id) ?? d.x
          ).strength((d) => (d.id === draggedId ? 1 : PHYSICS_CONFIG.forceX))
        )
        .force(
          'y',
          forceY((d) => (d.id === draggedId ? d.fy ?? d.y : d.y)).strength(
            (d) => (d.id === draggedId ? 1 : PHYSICS_CONFIG.forceY)
          )
        );

      simRef.current = sim;

      // Animation loop
      let tickCount = 0;
      const tick = () => {
        // Guard: ensure simulation is still valid
        if (!simRef.current || !isRunningRef.current) {
          console.log(`${LOG_PREFIX.PHYSICS} Tick stopped (sim invalid)`);
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          return;
        }

        tickCount++;
        if (tickCount % 10 === 0 && LOGGING_ENABLED) {
          console.log(
            `${LOG_PREFIX.PHYSICS} Tick ${tickCount}, alpha: ${sim.alpha().toFixed(3)}`
          );
        }

        // Get updated positions from simulation
        const positionMap = new Map(sim.nodes().map((n) => [n.id, n]));

        // Apply positions to React Flow nodes
        setNodes((nodes) =>
          nodes.map((n) => {
            const simNode = positionMap.get(n.id);
            if (!simNode) return n;
            if (!neighborhoodIdsRef.current.has(n.id)) return n;
            
            // Don't update dragged node - React Flow handles it
            if (n.id === draggedIdRef.current) return n;

            return {
              ...n,
              position: { x: simNode.x, y: simNode.y },
            };
          })
        );

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [getNodes, setNodes, stop]
  );

  /**
   * Updates the dragged node's position in the simulation
   * @param {number} x - New X position
   * @param {number} y - New Y position
   */
  const updateDraggedPosition = useCallback((x, y) => {
    if (!simRef.current || !draggedIdRef.current || !isRunningRef.current) {
      return;
    }

    const draggedId = draggedIdRef.current;
    const node = simRef.current.nodes().find((d) => d.id === draggedId);

    if (!node) {
      console.warn(`${LOG_PREFIX.PHYSICS} Dragged node not found in simulation: ${draggedId}`);
      return;
    }

    // Lock dragged node to cursor position
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;

    // Restart simulation with moderate alpha
    simRef.current.alpha(0.35).restart();
  }, []);

  return { start, stop, updateDraggedPosition };
}