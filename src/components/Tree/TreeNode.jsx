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
  //console.log('[TreeNode] Rendering node:', data);
  function applyChanges() {
    data.setSentence(nodeText);
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
      onClick={() => applyChanges()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          maxWidth: 420,
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
            height: 120,
            padding: 10,
            borderRadius: 6,
            border: "1px solid #bbb",
            marginBottom: 16,
            color: "#000000"
          }}
        />
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
