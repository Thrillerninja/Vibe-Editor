// In AnimatedNodeComponent.jsx

import React, { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { measureLabel } from '../../utils/measurements';
import { NODE_STYLES, NODE_WIDTH, LOGGING_ENABLED, LOG_PREFIX, EMOTION_COLORS, EMOTIONS } from '../../utils/constants';
import { EmotionSelectorPortal } from '../EmotionSelector/EmotionSelectorPortal';
import '../../components/TreeVisualization/TreeNode.css';

/**
 * Gets node background color based on emotion
 */
function getEmotionColor(emotion, intensity, type) {
  // Try to get color from EMOTION_COLORS, fallback to a default
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  console.log('[AnimatedNodeComponent] getEmotionColor for', emotion, 'intensity', intensity, 'type', type, '=>', colors);
  if (!colors) return '#ffffff';
  if (typeof intensity === 'number') {
    if (intensity < 33) return colors.light;
    if (intensity < 66) return colors.medium;
    return colors.strong;
  }
  return colors.medium;
}

/**
 * Gets border color based on emotion
 */
function getBorderColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion];
  return colors?.strong || '#222';
}

/**
 * AnimatedNodeComponent - Renders a single node in the tree
 */
export function AnimatedNodeComponent({ id, data }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [isHovered, setIsHovered] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeEmotion, setNodeEmotion] = useState(data.emotion);
  const [nodeText, setNodeText] = useState(data.content || data.label || "");
  const [isNodeRewriting, setIsNodeRewriting] = useState(false);
  const [nodeModified, setNodeModified] = useState(data.isDirty);
  const border = getBorderColor(nodeEmotion, data.intensity, data.type);
  const emotionColor = getEmotionColor(nodeEmotion, data.intensity, data.type);

  useEffect(() => {
    setNodeEmotion(data.emotion);
    setNodeText(data.content || data.label || "");
    setNodeModified(data.isDirty);
  }, [data.emotion, data.content, data.label, data.isDirty]);

  // Update node internals on label/content change
  useEffect(() => {
    const timer = setTimeout(() => updateNodeInternals(id), 0);
    return () => clearTimeout(timer);
  }, [id, nodeText, updateNodeInternals]);

  function handleSave() {
    if ((data.content || data.label) === nodeText && data.emotion === nodeEmotion) {
      setIsDialogOpen(false);
      return;
    }
    if (data.onEmotionChange) {
      data.onEmotionChange(id, nodeEmotion, data.intensity);
    }
    if (data.onContentChange) {
      data.onContentChange(id, nodeText);
    }
    setNodeModified(true);
    setIsDialogOpen(false);
  }

  function handleCancel() {
    setNodeText(data.content || data.label || "");
    setNodeEmotion(data.emotion);
    setIsDialogOpen(false);
  }

  function applyEmotion(emotion) {
    setNodeEmotion(emotion);
  }

  // Dialog/modal for editing node
  const dialog = isDialogOpen ? createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          maxWidth: 800,
          width: "90%",
          border: "3px solid #000000",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          value={nodeText}
          onChange={(e) => setNodeText(e.target.value)}
          readOnly={isNodeRewriting}
          style={{
            width: "100%",
            height: 400,
            padding: 10,
            borderRadius: 6,
            border: "1px solid #bbb",
            marginBottom: 16,
            color: "#000000",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {isNodeRewriting ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "8px 0",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: "4px solid #ccc",
                  borderTop: `4px solid ${getEmotionColor(nodeEmotion)}`,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            </div>
          ) : (
            <>
              {Object.entries(EMOTION_COLORS).map(([emotion, colorObj]) => (
                <button
                  key={emotion}
                  onClick={() => applyEmotion(emotion)}
                  disabled={isNodeRewriting || emotion === nodeEmotion}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 6,
                    backgroundColor: colorObj.medium,
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 600,
                    textAlign: "center",
                    transition: "all 0.2s ease",
                    minWidth: 110,
                    boxShadow:
                      nodeEmotion === emotion
                        ? `0 0 10px 2px ${getEmotionColor(emotion)}`
                        : "none",
                    border:
                      nodeEmotion === emotion
                        ? `2px solid ${getEmotionColor(emotion)}`
                        : "1px solid #777",
                  }}
                >
                  {emotion}
                </button>
              ))}
            </>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={handleCancel}
            disabled={isNodeRewriting}
            style={{
              padding: '6px 12px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isNodeRewriting}
            style={{
              padding: "8px 14px",
              background: "#10B981",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <motion.div
        className={nodeModified ? "animated-border" : ""}
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: 12,
          borderRadius: 8,
          color: "black",
          textAlign: "center",
          cursor: "pointer",
          width: 200,
          background: emotionColor,
          border: nodeModified ? `2px solid ${border}` : '2px solid transparent',
          boxShadow: isHovered
            ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            : '0 1px 2px rgba(0,0,0,0.04)',
          position: 'relative',
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
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
            color: '#000',
            lineHeight: 1.45,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {data.label}{"\n"}
          {nodeEmotion}{"\n"}
          {data.intensity}{"\n"}
          {data.type}
        </div>
        {nodeModified && (
          <div className="modified-indicator" title="This node has been modified.">
            !
          </div>
        )}
      </motion.div>
      {dialog}
    </>
  );
}