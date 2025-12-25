// In AnimatedNodeComponent.jsx

import React, { use, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { measureLabel } from '../../utils/measurements';
import { NODE_STYLES, NODE_WIDTH, LOGGING_ENABLED, LOG_PREFIX, EMOTION_COLORS, EMOTIONS } from '../../utils/constants';
import { EmotionSelectorPortal } from '../EmotionSelector/EmotionSelectorPortal';
import '../../components/TreeVisualization/TreeNode.css';
import { EMOTION_LABELS } from '../../utils/constants';


/**
 * Gets node background color based on emotion
 */
function getEmotionColor(emotion, intensity, type) {
  // Try to get color from EMOTION_COLORS, fallback to a default
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  //console.log('[AnimatedNodeComponent] getEmotionColor for', emotion, 'intensity', intensity, 'type', type, '=>', colors);
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
  const [isHovered, setIsHovered] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeEmotion, setNodeEmotion] = useState(data.emotion);
  const [nodeIntensity, setNodeIntensity] = useState(data.intensity || 50);
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


  useEffect(() => {
    console.log("[AnimatedNodeComponent] Node data changed:", data, "ID:", id);
  }, []);

  function handleSave() {
    data.applyNodeSentenceEdit(id, nodeText);
    setIsDialogOpen(false);
  }

  function handleCancel() {
    setIsDialogOpen(false);
  }

  function applyEmotion(emotion) {
    setNodeEmotion(emotion);
  }

  function selectEmotion(emotion) {
    if(isNodeRewriting) return;
    if(emotion === nodeEmotion) return;
    setNodeEmotion(emotion);
    alert(`Selected emotion: ${emotion} (${EMOTION_LABELS[emotion] || 'No label'})`);
  }

  // Dialog/modal for editing node - redesigned
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
          padding: 0,
          maxWidth: 600,
          width: "90%",
          border: "3px solid #000000",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#000"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top: General Info Section */}
        <div style={{
          padding: "24px 24px 16px 24px",
          borderBottom: "1px solid #eee",
          background: "#f9fafb"
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Information</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div><strong>Content:</strong> {data.content || data.label || "-"}</div>
            <div><strong>Emotion:</strong> {nodeEmotion || "-"}</div>
            <div><strong>Intensity:</strong> {data.intensity ?? "-"}</div>
            <div><strong>Type:</strong> {data.type || "-"}</div>
            {data.author && <div><strong>Author:</strong> {data.author}</div>}
            {data.timestamp && <div><strong>Timestamp:</strong> {data.timestamp}</div>}
            {/* Add more fields as needed */}
          </div>
        </div>
        {/* Bottom: Editing Section (if editable) */}
        {data.type === "sentence" && !isNodeRewriting && (
          <div style={{ padding: "20px 24px 16px 24px", background: "#fff" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Edit Content</div>
            <textarea
              value={nodeText}
              onChange={(e) => setNodeText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 120,
                padding: 10,
                borderRadius: 6,
                border: "1px solid #bbb",
                marginBottom: 16,
                color: "#000000",
                resize: "vertical"
              }}
            />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Select Emotion:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(EMOTION_COLORS).map(([emotion, colors]) => {
                  const isSelected = nodeEmotion === emotion;
                  return (
                    <button
                      key={emotion}
                      onClick={() => selectEmotion(emotion)}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: isSelected ? colors.medium : '#f5f5f5',
                        color: isSelected ? '#fff' : '#333',
                        border: `1px solid ${isSelected ? colors.strong : '#ccc'}`,
                        borderRadius: '4px',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: isSelected ? '600' : '400',
                        textTransform: 'capitalize'
                      }}
                    >
                      {emotion}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Intensity: {nodeIntensity}</div>
              <input
                type="range"
                min="0"
                max="99"
                value={nodeIntensity}
                onChange={(e) => setNodeIntensity(parseInt(e.target.value))}
                disabled={isNodeRewriting}
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  background: '#ddd',
                  outline: 'none',
                  cursor: isNodeRewriting ? 'not-allowed' : 'pointer'
                }}
              />
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
          
        )}
        {/* Close button for non-editable nodes */}
        {data.type !== "sentence" && (
          <div style={{ padding: "16px 24px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleCancel}
              disabled={isNodeRewriting}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}
        {/* Loading spinner if rewriting */}
        {isNodeRewriting && (
          <div style={{ padding: "32px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: "5px solid #ccc",
                borderTop: `5px solid ${getEmotionColor(nodeEmotion)}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
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