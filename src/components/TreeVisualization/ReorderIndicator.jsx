/**
 * Visual indicator showing where node will be placed during reorder
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function ReorderIndicator({ position, isAbove }) {
  if (!position) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scaleX: 0.5 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={{ opacity: 0, scaleX: 0.5 }}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y + (isAbove ? -8 : 8),
          width: 200,
          height: 4,
          backgroundColor: '#3b82f6',
          borderRadius: 2,
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
        }}
      />
    </AnimatePresence>
  );
}