import { Handle, Position } from "reactflow";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from 'framer-motion';
import { ALTERNATIVE_EMOTION_COLORS, EMOTION_COLORS, EMOTIONS } from "../../utils/constants";
import { col, em, s } from "framer-motion/client";
import { rewriteTextWithEmotion } from "../../ClaudeAlternative/claudeAPI";
import "./TreeNode.css";


function getEmotionColor(emotion) {
  // Try to get color from ALTERNATIVE_EMOTION_COLORS, fallback to EMOTION_COLORS, then to a default
  var color = (
    ALTERNATIVE_EMOTION_COLORS[emotion] ||'#ffffff' // Default fallback color (light gray)
  );
  if (color === '#ffffff') {
    console.log('[TreeNode] Emotion color not found for', emotion, ', using default #ffffff');
  }
  return color;
}

export default function TreeNode({ data }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeText, setNodeText] = useState(data.content || "");
  const [editable, setEditable] = useState(data.isLeaf);
  const [nodeEmotion, setNodeEmotion] = useState(data.emotion);
  const [nodeModified, setNodeModified] = useState(data.isModified);

  const [isNodeRewriting, setIsNodeRewriting] = useState(false);

  function handleSave() {
    if (data.content === nodeText && data.emotion === nodeEmotion) {
      return; // No changes made
    }
    data.setSentence(nodeText, nodeEmotion);
    setNodeModified(true);
    setIsDialogOpen(false);
    console.log('[TreeNode] Saved changes to node', data.emotion);
    console.log('[TreeNode] New content:', nodeEmotion);
  }

  function applyEmotion(emotion){
    console.log('[TreeNode] applyEmotion called with', nodeEmotion);
    if (data.isLeaf=== false)
    { return;}
    console.log('[TreeNode] Applying emotion', emotion, 'to node', data);
    //alert(nodeEmotion)
    setIsNodeRewriting(true);
    setNodeEmotion(`${emotion}`);

    (async () => {
        const rewritten = await rewriteTextWithEmotion(nodeText, emotion);
        setNodeText(rewritten);
      })().finally(() => {

        setIsNodeRewriting(false);
      });

  }

  function handleCancel() {
    setNodeText(data.content || "");
    setNodeEmotion(data.emotion);
    setIsDialogOpen(false);
  }
  // Init node display text with the content for editing
  useEffect(() => {
    setNodeText(data.content || "");
  }, [data.content]);

  // Sync visual modified state when data.isModified changes (e.g., after refresh)
  useEffect(() => {
    setNodeModified(data.isModified);
  }, [data.isModified]);


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
          readOnly={!editable || isNodeRewriting}
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

        {/* Emotion Selection */}
        {/* Emotion Buttons */}
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
                // ⭐ SHOW ONLY THE SPINNER
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
                // ⭐ NORMAL BUTTON RENDERING
                <>
                  {Object.entries(ALTERNATIVE_EMOTION_COLORS).map(([emotion, color]) => (
                    <button
                      key={emotion}
                      onClick={() => applyEmotion(emotion)}
                      disabled={!editable || isNodeRewriting || emotion == nodeEmotion}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 6,
                        backgroundColor: color,
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

        {/* Buttons */}
        {isNodeRewriting ? <>

        </>:<>
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
              {editable && data.isLeaf && (
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
              )}
            </div>
        </>}

      </div>
    </div>,
      document.body
    ) : null;

    // Determine if the color is missing (i.e., using fallback)
    const emotionColor = getEmotionColor(nodeEmotion);
    const isDefaultColor =
      (!ALTERNATIVE_EMOTION_COLORS[nodeEmotion] && !EMOTION_COLORS[nodeEmotion]);

    return (
      <>
        <motion.div
          className={nodeModified ? "animated-border" : ""}
          transition={{ type: 'spring', stiffness: 520, damping: 44 }}
          onDoubleClick={() => setIsDialogOpen(true)}
          style={{
            padding: 12,
            borderRadius: 8,
            color: "black",
            textAlign: "center",
            cursor: "pointer",
            width: 200,
            background: emotionColor,
          }}
        >
          <Handle type="target" position={Position.Left} />
          {
            // Display label (for non-leaf nodes) or content (for leaf nodes)
            (data.label || "").length > 50
              ? (data.label || "").substring(0, 50) + '...'
              : (data.label || "")
          }
          <Handle type="source" position={Position.Right} />
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
