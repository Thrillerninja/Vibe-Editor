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
function getEmotionColor(emotion) {
  if (emotion == undefined){
    emotion = EMOTIONS.NEUTRAL;
  }
  const colors = EMOTION_COLORS[emotion];
  return '#10b981';
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
  const setIsEmotionModalOpen = data.setIsEmotionModalOpen || (() => { });

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

  const handleEmotionSelect = (emotionPayload, intensity) => {
    console.log(`[Node] Selected emotion for ${id}:`, emotionPayload, intensity);
    if (data.onEmotionChange) {
      // Extract label from payload if it's an object, otherwise use as-is
      const emotionLabel = emotionPayload?.label || emotionPayload;
      data.onEmotionChange(id, emotionLabel, intensity);
    }
  };

  const bg = getEmotionColor(data.emotion);
  const border = getBorderColor(data.emotion, data.intensity || 0, data.type);
  const color = data.type === 'root' ? 'white' : '#1f2937';

  // Visual indicator for dirty nodes
  const isDirty = data.isDirty || false;
  const dirtyBorder = isDirty ? '2px dashed #f59e0b' : `1px solid ${border}`;
  const dirtyBg = isDirty ? `repeating-linear-gradient(45deg, ${bg}, ${bg} 10px, rgba(245, 158, 11, 0.1) 10px, rgba(245, 158, 11, 0.1) 20px)` : bg;

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
            background: dirtyBg,
            border: dirtyBorder,
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
            onMouseDown={(e) => e.stopPropagation()} // Prevent node drag
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
              backgroundImage: `url(/pen.png)`,
              backgroundSize: "12px",
              backgroundPosition: "center",

            }}
            title="Set emotion"
            className="nodrag nopan" // Prevent ReactFlow interaction
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(/pen2.png)`,
                backgroundSize: "12px",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            />
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
          currentIntensity={data.intensity || 0}
          nodeLabel={data.label}
          getNodeScreenPosition={getNodeScreenPosition}
        />
      )}
    </>
  );
}