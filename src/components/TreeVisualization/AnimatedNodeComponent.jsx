// In AnimatedNodeComponent.jsx

import React, { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { motion } from 'framer-motion';
import { measureLabel } from '../../utils/measurements';
import {
  NODE_STYLES,
  NODE_WIDTH,
  LOGGING_ENABLED,
  LOG_PREFIX,
  EMOTION_COLORS,
  EMOTIONS,
} from '../../utils/constants';
import { EmotionSelectorPortal } from '../EmotionSelector/EmotionSelectorPortal';

/**
 * Gets node background color based on emotion
 */
function getEmotionColor(emotion, intensity, type) {
  if (!emotion || emotion === EMOTIONS.NEUTRAL) {
    return NODE_STYLES[type]?.background || NODE_STYLES.argument.background;
  }

  const colors = EMOTION_COLORS[emotion];
  if (!colors) return NODE_STYLES[type]?.background;

  if (intensity < 33) return colors.light;
  if (intensity < 66) return colors.medium;
  return colors.strong;
}

/**
 * Gets border color based on emotion
 */
function getBorderColor(emotion, intensity, type) {
  if (!emotion || emotion === EMOTIONS.NEUTRAL) {
    return NODE_STYLES[type]?.border || NODE_STYLES.argument.border;
  }

  const colors = EMOTION_COLORS[emotion];
  return colors?.strong || NODE_STYLES[type]?.border;
}

/**
 * AnimatedNodeComponent - Renders a single node in the tree
 */
export function AnimatedNodeComponent({ id, data }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { flowToScreenPosition, getZoom } = useReactFlow();
  const size = measureLabel(data.label);
  const [isHovered, setIsHovered] = useState(false);

  // Use state from parent
  const isEmotionModalOpen = data.isEmotionModalOpen || false;
  const setIsEmotionModalOpen = data.setIsEmotionModalOpen || (() => {});

  // Get screen position for modal
  const getNodeScreenPosition = () => {
    if (!data.nodePosition) return null;
    
    const screenPos = flowToScreenPosition({
      x: data.nodePosition.x,
      y: data.nodePosition.y,
    });
    
    const zoom = getZoom();
    
    return {
      x: screenPos.x,
      y: screenPos.y,
      width: NODE_WIDTH * zoom,
      height: size.height * zoom,
    };
  };

  // Update internal dimensions when label changes
  useEffect(() => {
    if (LOGGING_ENABLED) {
      console.log(`${LOG_PREFIX.NODE} Updating internals for node ${id}`);
    }
    const timer = setTimeout(() => updateNodeInternals(id), 0);
    return () => clearTimeout(timer);
  }, [id, data.label, updateNodeInternals]);
  
  const handleEmotionClick = (e) => {
    e.stopPropagation();
    console.log(`[Node] Opening emotion selector for ${id}`);
    setIsEmotionModalOpen(true);
  };

  const handleEmotionSelect = (emotion, intensity) => {
    console.log(`[Node] Selected emotion for ${id}:`, emotion, intensity);
    if (data.onEmotionChange) {
      data.onEmotionChange(id, emotion, intensity);
    }
  };

  const bg = getEmotionColor(data.emotion, data.intensity || 50, data.type);
  const border = getBorderColor(data.emotion, data.intensity || 50, data.type);
  const color = data.type === 'root' ? 'white' : '#1f2937';

  return (
    <>
      <div style={{ position: 'relative' }}>
        {/* Connection handles */}
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        {/* Animated node content */}
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 44 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            width: NODE_WIDTH,
            height: size.height,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            boxShadow: isHovered
              ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              : '0 1px 2px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily:
              '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
            userSelect: 'none',
            transition: 'box-shadow 0.2s',
          }}
        >
          {/* Emotion Button (top-right) */}
          <button
            onClick={handleEmotionClick}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 24,
              height: 24,
              borderRadius: 6,
              border: `1px solid ${border}`,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              padding: 0,
              opacity: isHovered ? 1 : 0.6,
              transition: 'opacity 0.2s',
            }}
            title="Set emotion"
            draggable={false}
            className="nodrag nopan"
          >
            😊
          </button>

          {/* Node Label */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 32px 8px 8px',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: data.type === 'root' ? 600 : 500,
              color,
              lineHeight: 1.45,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {data.label}
          </div>
        </motion.div>
      </div>

      {/* Emotion Selector Modal via Portal */}
      {isEmotionModalOpen && (
        <EmotionSelectorPortal
          isOpen={isEmotionModalOpen}
          onClose={() => setIsEmotionModalOpen(false)}
          onSelect={handleEmotionSelect}
          currentEmotion={data.emotion || EMOTIONS.NEUTRAL}
          currentIntensity={data.intensity || 50}
          nodeLabel={data.label}
          nodeScreenPosition={getNodeScreenPosition()}
        />
      )}
    </>
  );
}