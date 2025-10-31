/**
 * ELK layout engine integration
 * Handles automatic graph layout using ELK
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import { measureLabel } from './measurements';
import { ELK_OPTIONS, LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH } from './constants';

const elk = new ELK();

/**
 * Runs ELK layout algorithm on nodes and edges
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
      const size = measureLabel(n.data.label);
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

    // Extract positions
    const positionMap = new Map();
    (result.children || []).forEach((child) => {
      positionMap.set(child.id, { x: child.x, y: child.y });
      if (LOGGING_ENABLED) {
        console.log(
          `${LOG_PREFIX.LAYOUT}   Node ${child.id}: (${child.x.toFixed(1)}, ${child.y.toFixed(1)})`
        );
      }
    });

    // Apply positions to nodes
    return nodes.map((node) => ({
      ...node,
      position: positionMap.get(node.id) || node.position,
      draggable: true,
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX.LAYOUT} ELK layout failed:`, error);
    return nodes;
  }
}