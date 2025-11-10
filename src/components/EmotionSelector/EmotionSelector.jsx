// In EmotionSelector.jsx

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmotionPad from "./EmotionPad";
import {
  EMOTIONS,
  EMOTION_LABELS,
  EMOTION_COLORS,
} from "../../utils/constants";

const TABS = [
  { key: "emotion", label: "Emotion" },
  { key: "style", label: "Stil" },
  { key: "direct", label: "Direkt" },
];

export function EmotionSelector({
  isOpen,
  onClose,
  onSelect,
  currentEmotion = EMOTIONS.NEUTRAL,
  currentIntensity = 50,
  nodeLabel = "",
  nodeScreenPosition = null,
  plutchikImage = "/Plutchiks-emotional-wheel.png",
  getNodeScreenPosition,
}) {
  const [activeTab, setActiveTab] = useState("emotion");
  const [selectedEmotion, setSelectedEmotion] = useState(currentEmotion);
  const [intensity, setIntensity] = useState(currentIntensity);
  const [livePosition, setLivePosition] = useState(nodeScreenPosition);
  const modalRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedEmotion(currentEmotion);
      setIntensity(currentIntensity);
      setActiveTab("emotion");
    }
  }, [isOpen, currentEmotion, currentIntensity]);

  // Update position continuously while open
  useEffect(() => {
    if (!isOpen || !getNodeScreenPosition) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const updatePosition = () => {
      const newPos = getNodeScreenPosition();
      setLivePosition(newPos);
      animationFrameRef.current = requestAnimationFrame(updatePosition);
    };

    updatePosition();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isOpen, getNodeScreenPosition]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleApply = () => {
    const payload = {
      model: "plutchik",
      label: selectedEmotion,
      intensity: Math.max(0, Math.min(1, intensity / 100)),
    };
    onSelect(payload, intensity);
    onClose();
  };

  // Calculate modal position
  const getModalStyle = () => {
    const position = livePosition || nodeScreenPosition;
    
    if (!position) {
      // Fallback to center
      return {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const { x, y, width, height } = position;
    const nodeCenterX = x + width / 2;
    const nodeBottom = y + height;

    // Position modal below node, centered
    return {
      position: "fixed",
      top: nodeBottom + 12,
      left: nodeCenterX,
      transform: "translateX(-50%)",
    };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - REMOVED onClick to allow canvas interaction */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 9998,
              backdropFilter: 'blur(2px)',
              pointerEvents: 'none',
            }}
          />

          {/* Modal content */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              ...getModalStyle() // Apply position in animation
            }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ 
              opacity: { duration: 0.15 },
              scale: { duration: 0.15 },
              y: { duration: 0.15 },
              top: { duration: 0 }, // No transition for position updates
              left: { duration: 0 },
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag nopan"
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              boxShadow:
                "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
              zIndex: 99999,
              overflow: "hidden",
              width: 380,
              maxHeight: "80vh",
              overflowY: "auto",
              pointerEvents: "auto",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: 6,
                    }}
                  >
                    Ton einstellen
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#6b7280",
                      lineHeight: 1.4,
                      maxHeight: 34,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {nodeLabel}
                  </p>
                </div>
                {/* Close button */}
                <button
                  onClick={onClose}
                  style={{
                    marginLeft: 12,
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                    backgroundColor: "white",
                    color: "#6b7280",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    padding: 0,
                  }}
                  title="Close (ESC)"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "8px 12px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: `1px solid ${active ? "#2563eb" : "#d1d5db"}`,
                      backgroundColor: active ? "#eff6ff" : "white",
                      color: active ? "#1d4ed8" : "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div style={{ padding: 16 }}>
              {activeTab === "emotion" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                    }}
                  >
                    Plutchik-Rad
                  </label>

                  <EmotionPad
                    size={320} // Reduced from 360
                    emotion={selectedEmotion}
                    intensityPercent={intensity}
                    backgroundImage={plutchikImage}
                    onChange={({ label, intensityPercent }) => {
                      setSelectedEmotion(label);
                      setIntensity(intensityPercent);
                    }}
                  />
                </div>
              )}

              {activeTab === "style" && (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "20px 0" }}>
                  Stil-Tab (kommt später).
                </div>
              )}

              {activeTab === "direct" && (
                <div style={{ fontSize: 12, color: "#6b7280", padding: "20px 0" }}>
                  Direktes Bearbeiten (kommt später).
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: "7px 14px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Anwenden
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}