/**
 * EmotionSelector - Modal card for selecting node emotion
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EMOTIONS, EMOTION_LABELS, EMOTION_COLORS } from '../../utils/constants';

/**
 * EmotionSelector Component
 * @param {boolean} isOpen - Whether modal is open
 * @param {Function} onClose - Close handler
 * @param {Function} onSelect - Selection handler (emotion, intensity)
 * @param {string} currentEmotion - Currently selected emotion
 * @param {number} currentIntensity - Current intensity (0-100)
 * @param {string} nodeLabel - Label of the node being edited
 */
export function EmotionSelector({
  isOpen,
  onClose,
  onSelect,
  currentEmotion = EMOTIONS.NEUTRAL,
  currentIntensity = 50,
  nodeLabel = '',
}) {
  const [selectedEmotion, setSelectedEmotion] = useState(currentEmotion);
  const [intensity, setIntensity] = useState(currentIntensity);

  useEffect(() => {
    if (isOpen) {
      setSelectedEmotion(currentEmotion);
      setIntensity(currentIntensity);
    }
  }, [isOpen, currentEmotion, currentIntensity]);

  const handleApply = () => {
    console.log('[EmotionSelector] Applying:', selectedEmotion, intensity);
    onSelect(selectedEmotion, intensity);
    onClose();
  };

  const getIntensityColor = () => {
    const colors = EMOTION_COLORS[selectedEmotion];
    if (intensity < 33) return colors.light;
    if (intensity < 66) return colors.medium;
    return colors.strong;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: 480,
              backgroundColor: 'white',
              borderRadius: 16,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              zIndex: 9999,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#111827',
                  marginBottom: 8,
                }}
              >
                Set Emotion
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#6b7280',
                  lineHeight: 1.5,
                  maxHeight: 40,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {nodeLabel}
              </p>
            </div>

            {/* Content */}
            <div style={{ padding: 24 }}>
              {/* Emotion Selection */}
              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: 12,
                  }}
                >
                  Emotion Type
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                  }}
                >
                  {Object.entries(EMOTIONS).map(([key, value]) => {
                    const isSelected = selectedEmotion === value;
                    const colors = EMOTION_COLORS[value];

                    return (
                      <button
                        key={value}
                        onClick={() => setSelectedEmotion(value)}
                        style={{
                          padding: '12px 16px',
                          border: `2px solid ${isSelected ? colors.strong : '#e5e7eb'}`,
                          borderRadius: 8,
                          backgroundColor: isSelected ? colors.light : 'white',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          color: isSelected ? colors.strong : '#6b7280',
                          transition: 'all 0.2s',
                          textAlign: 'left',
                        }}
                      >
                        {EMOTION_LABELS[value]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Intensity Slider */}
              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: 8,
                  }}
                >
                  Intensity: {intensity}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  style={{
                    width: '100%',
                    height: 6,
                    borderRadius: 3,
                    outline: 'none',
                    background: `linear-gradient(to right, ${getIntensityColor()} ${intensity}%, #e5e7eb ${intensity}%)`,
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    fontSize: 11,
                    color: '#9ca3af',
                  }}
                >
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>

              {/* Preview */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: getIntensityColor(),
                  border: `1px solid ${EMOTION_COLORS[selectedEmotion].strong}`,
                  fontSize: 12,
                  color: '#374151',
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                Preview: {EMOTION_LABELS[selectedEmotion]} ({intensity}%)
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}