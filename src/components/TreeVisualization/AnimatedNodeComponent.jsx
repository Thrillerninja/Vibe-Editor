/**
 * Custom animated node component for ReactFlow
 * Displays tree nodes with type-specific styling and automatic sizing
 */

import React, { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { motion } from 'framer-motion';
import { measureLabel } from '../../utils/measurements';
import { NODE_STYLES, NODE_WIDTH, LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';

/**
 * AnimatedNodeComponent - Renders a single node in the tree
 * @param {string} id - Unique node identifier
 * @param {Object} data - Node data containing label and type
 */
export function AnimatedNodeComponent({ id, data }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const size = measureLabel(data.label);

  // Update internal dimensions when label changes
  useEffect(() => {
    if (LOGGING_ENABLED) {
      console.log(`${LOG_PREFIX.NODE} Updating internals for node ${id}`);
    }
    const timer = setTimeout(() => updateNodeInternals(id), 0);
    return () => clearTimeout(timer);
  }, [id, data.label, updateNodeInternals]);

  // Get styling based on node type
  const style = NODE_STYLES[data.type] || NODE_STYLES.argument;

  return (
    <div style={{ position: 'relative' }}>
      {/* Connection handles */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* Animated node content */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        style={{
          width: NODE_WIDTH,
          height: size.height,
          background: style.background,
          border: `1px solid ${style.border}`,
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: data.type === 'root' ? 600 : 500,
          color: style.color,
          lineHeight: 1.45,
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
        }}
      >
        {data.label}
      </motion.div>
    </div>
  );
}