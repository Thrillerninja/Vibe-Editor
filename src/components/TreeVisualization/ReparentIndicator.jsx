/**
 * Visual indicator showing the target node for reparenting
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ReparentIndicator - Highlights the target parent node
 * @param {Object} targetNode - The node that will become the new parent
 * @param {Object} screenPosition - Screen position of the target node
 */
export function ReparentIndicator({ targetNode, screenPosition }) {
  if (!targetNode || !screenPosition) return null;

  const width = targetNode.width || 200;
  const height = targetNode.height || 60;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'absolute',
          left: screenPosition.x,
          top: screenPosition.y,
          width: width,
          height: height,
          border: '3px solid #10b981',
          borderRadius: 10,
          pointerEvents: 'none',
          zIndex: 999,
          boxShadow: '0 0 20px rgba(16, 185, 129, 0.6), inset 0 0 20px rgba(16, 185, 129, 0.1)',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
        }}
      >
        {/* Corner indicators */}
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            width: 16,
            height: 16,
            backgroundColor: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 16,
            height: 16,
            backgroundColor: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: -8,
            width: 16,
            height: 16,
            backgroundColor: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            right: -8,
            width: 16,
            height: 16,
            backgroundColor: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
          }}
        />
        
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
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
          }}
        >
          Drop to attach here
        </div>
      </motion.div>
    </AnimatePresence>
  );
}