import { Handle, Position } from "reactflow";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from 'framer-motion';
import { ALTERNATIVE_EMOTION_COLORS, EMOTION_COLORS, EMOTIONS } from "../../utils/constants";
import { em } from "framer-motion/client";


function getEmotionColor(emotion) {
  const colors = EMOTION_COLORS[emotion];
  return ALTERNATIVE_EMOTION_COLORS[emotion];
}

export default function TreeNode({ data }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeText, setNodeText] = useState(data.sentence || "");
  const [editable, setEditable] = useState(data.isLeaf || false);
  const [nodeEmotion, setNodeEmotion] = useState(data.emotion || "NEUTRAL");
  //console.log('[TreeNode] Rendering node:', data);
  function applyChanges() {
    data.setSentence(nodeText);
    setIsDialogOpen(false);
  }
  function handleSave() {
  data.setSentence(nodeText);
  data.setEmotion?.(tempEmotion);     // call parent if provided
  setIsDialogOpen(false);
  }

  function handleCancel() {
    setNodeText(data.sentence || "");
    setNodeEmotion(data.emotion || "NEUTRAL");
    setIsDialogOpen(false);
  }
  // Init node display text with the sentence
  useEffect(() => {
    setNodeText(data.sentence || "");
  }, [data.sentence]);

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
          border: "3px solid #DC2626",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          value={nodeText}
          onChange={(e) => setNodeText(e.target.value)}
          readOnly={!editable}
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
        <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          Emotion
        </label>

        <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                justifyContent: "space-between",
                width: "100%",
              }}
            >
          {Object.entries(ALTERNATIVE_EMOTION_COLORS).map(([emotion, color]) => (
            <button
              key={emotion}
              onClick={() => setNodeEmotion(emotion)}
              style={{
                flex: 1,                                  // equal size
                padding: "8px 0",
                borderRadius: 6,
                backgroundColor: color,
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
                textAlign: "center",
                transition: "all 0.2s ease",
                minWidth: 110, 

                // green shimmer when selected
                boxShadow:
                  nodeEmotion === emotion
                    ? "0 0 10px 2px rgba(16, 185, 129, 0.7)"
                    : "none",
                border:
                  nodeEmotion === emotion
                    ? "2px solid #10B981"                  // emerald green highlight
                    : "1px solid #777",
              }}
            >
              {emotion}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={handleCancel}
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
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        style={{
          padding: 12,
          borderRadius: 8,
          background: getEmotionColor(data.emotion),
          color: "white",
          textAlign: "center",
          cursor: "pointer",
          width: 200,
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
