/**
 * ELK layout engine integration
 * Handles automatic graph layout using ELK
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import { measureLabel } from './measurements';
import { logError } from './errorTracking';
import { ELK_OPTIONS, LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH } from './constants';

const elk = new ELK();

/**
 * Runs ELK layout algorithm on nodes and edges
 * Respects node order for same-level positioning
 * @param {Array} nodes - ReactFlow nodes
 * @param {Array} edges - ReactFlow edges
 * @returns {Promise<Array>} Nodes with calculated positions
 */
export async function runElk(nodes, edges) {
  console.log(`${LOG_PREFIX.LAYOUT} Starting ELK layout for ${nodes.length} nodes`);
  const startTime = performance.now();

  // Build ELK graph structure
  const elkGraph = {
    id: 'root',
    layoutOptions: ELK_OPTIONS,
    children: nodes.map((n) => {
      const size = n.size || measureLabel(n.data?.content ?? n.data?.label ?? '');
      return {
        id: n.id,
        width: size.width,
        height: size.height,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  try {
    // Run layout
    const result = await elk.layout(elkGraph);
    const elapsed = performance.now() - startTime;
    console.log(`${LOG_PREFIX.LAYOUT} ELK layout complete in ${elapsed.toFixed(2)}ms`);

    // Extract positions and dimensions
    const positionMap = new Map();
    (result.children || []).forEach((child) => {
      positionMap.set(
        child.id, 
        { 
          x: child.x, 
          y: child.y,
          width: child.width,
          height: child.height,
        }
      );
      if (LOGGING_ENABLED) {
        console.log(
          `${LOG_PREFIX.LAYOUT}   Node ${child.id}: (${child.x.toFixed(1)}, ${child.y.toFixed(1)}) ${child.width}x${child.height}`
        );
      }
    });

    // Apply positions to nodes
    return nodes.map((node) => {
      const p = positionMap.get(node.id);
      if (!p) return node; // fallback if ELK didn’t return this child

      return {
        ...node,
        position: { x: p.x, y: p.y },
        width: p.width,
        height: p.height,
        draggable: true,
      };
    });
  } catch (error) {
    logError(`${LOG_PREFIX.LAYOUT} ELK layout failed:` + error);
    console.error(`${LOG_PREFIX.LAYOUT} ELK layout failed:`, error);
    return nodes;
  }
}