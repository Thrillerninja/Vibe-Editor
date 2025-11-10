import React, { useState, useEffect } from "react";
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
  plutchikImage = "/public/Plutchiks-emotional-wheel.png", // pass your image URL here
}) {
  const [activeTab, setActiveTab] = useState("emotion");
  const [selectedEmotion, setSelectedEmotion] = useState(currentEmotion);
  const [intensity, setIntensity] = useState(currentIntensity);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSelectedEmotion(currentEmotion);
      setIntensity(currentIntensity);
      setActiveTab("emotion");
    }
  }, [isOpen, currentEmotion, currentIntensity]);

  const handleApply = () => {
    const payload = {
      model: "plutchik",
      label: selectedEmotion,
      intensity: Math.max(0, Math.min(1, intensity / 100)),
    };
    onSelect(payload, intensity);
    onClose();
  };

  const previewBg =
    intensity < 33
      ? EMOTION_COLORS[selectedEmotion]?.light
      : intensity < 66
      ? EMOTION_COLORS[selectedEmotion]?.medium
      : EMOTION_COLORS[selectedEmotion]?.strong;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(111, 111, 111, 0.2)",
              zIndex: 9998,
              // backdropFilter: "blur(2px)",
              borderRadius: '8px',
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{
              position: "fixed",
              top: "15%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "white",
              borderRadius: 16,
              boxShadow:
                "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              zIndex: 9909,
              overflow: 'hidden',
              maxHeight: '90vh',
              maxWidth: '400px',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Ton einstellen
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#6b7280",
                  lineHeight: 1.5,
                  maxHeight: 40,
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

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 8,
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
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${active ? "#2563eb" : "#d1d5db"}`,
                      backgroundColor: active ? "#eff6ff" : "white",
                      color: active ? "#1d4ed8" : "#374151",
                      fontSize: 13,
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
            <div style={{ padding: 20 }}>
              {activeTab === "emotion" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                    }}
                  >
                    Plutchik-Rad
                  </label>

                  <EmotionPad
                    size={360}
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
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Stil-Tab (kommt später).
                </div>
              )}

              {activeTab === "direct" && (
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Direktes Bearbeiten (kommt später).
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: 13,
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