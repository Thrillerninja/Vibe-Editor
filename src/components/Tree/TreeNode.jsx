import { Handle, Position } from "reactflow";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from 'framer-motion';
import { ALTERNATIVE_EMOTION_COLORS, EMOTION_COLORS, EMOTIONS } from "../../utils/constants";
import { em, s } from "framer-motion/client";
import { rewriteTextWithEmotion } from "../../ClaudeAlternative/claudeAPI";


function getEmotionColor(emotion) {
  const colors = EMOTION_COLORS[emotion];
  return ALTERNATIVE_EMOTION_COLORS[emotion];
}

export default function TreeNode({ data }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeText, setNodeText] = useState(data.sentence || "");
  const [editable, setEditable] = useState(data.isLeaf || true);
  const [nodeEmotion, setNodeEmotion] = useState(data.emotion || "NEUTRAL");
  const [nodeModified, setNodeModified] = useState(data.isModified || false);

  const [isNodeRewriting, setIsNodeRewriting] = useState(false);

  //console.log('[TreeNode] Rendering node:', data, 'isModified:', data.isModified);
  function applyChanges() {
    data.setSentence(nodeText);
    setIsDialogOpen(false);
  }
  function handleSave() {
    if (data.sentence === nodeText) {
      return; // No changes made
    }
    data.setSentence(nodeText, nodeEmotion);
    setNodeModified(true);
    setIsDialogOpen(false);
  }

  function applyEmotion(emotion){
    console.log('[TreeNode] Applying emotion', emotion, 'to node', data);
    setIsNodeRewriting(true);
    setNodeEmotion(`${emotion}`);
    if (data.isLeaf == true) {
      (async () => {
        const rewritten = await rewriteTextWithEmotion(nodeText, emotion);
        setNodeText(rewritten);
      })().finally(() => {
        setIsNodeRewriting(false);
      });
    }

  }

  function handleCancel() {
    setNodeText(data.sentence || "");
    setNodeEmotion(data.emotion);
    setIsDialogOpen(false);
  }
  // Init node display text with the sentence
  useEffect(() => {
    setNodeText(data.sentence || "");
  }, [data.sentence]);

  // Sync visual modified state when data.isModified changes (e.g., after refresh)
  useEffect(() => {
    setNodeModified(!!data.isModified);
  }, [data.isModified]);

  // Sync emotion when data.emotion changes (e.g., after Claude reevaluation)
  useEffect(() => {
    //setNodeEmotion(data.emotion || "NEUTRAL");
  }, [data.emotion]);


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
              {editable && (
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

    return (
    <>
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        style={{
          padding: 12,
          borderRadius: 8,
          //background: getEmotionColor(nodeEmotion),
          color: "black",
          textAlign: "center",
          cursor: "pointer",
          width: 200,
          background: nodeModified 
            ? `repeating-linear-gradient(
                45deg,
                ${getEmotionColor(nodeEmotion)},
                ${getEmotionColor(nodeEmotion)} 10px,
                rgba(255, 200, 0, 0.4) 10px,
                rgba(255, 200, 0, 0.4) 20px
              )`
            : getEmotionColor(nodeEmotion),
        }}
      >
        <Handle type="target" position={Position.Left} />
        {
          // The inline command is within these brackets {}
          nodeText.length > 50
            ? nodeText.substring(0, 50) + '...'
            : nodeText
        }
        <Handle type="source" position={Position.Right} />
      </motion.div>
      {dialog}
    </>
  );
}
