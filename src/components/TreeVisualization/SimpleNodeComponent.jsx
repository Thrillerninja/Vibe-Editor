import React, { useState } from 'react';
// Assuming paths - these are from the original AnimatedNodeComponent
import { EMOTION_COLORS, EMOTIONS, NODE_STYLES } from '../../utils/constants';
import { EmotionSelector } from '../EmotionSelector';

// --- Default values for safety ---
const SAFE_EMOTIONS = EMOTIONS || { NEUTRAL: 'neutral' };
const SAFE_NODE_STYLES = NODE_STYLES || {
  argument: { background: '#ffffff', border: '#cccccc' },
  root: { background: '#333333', border: '#111111' },
  chapter: { background: '#f3f4f6', border: '#d1d5db' },
  section: { background: '#fefce8', border: '#fde68a' },
};
const SAFE_EMOTION_COLORS = EMOTION_COLORS || {
  joy: { light: '#fef3c7', medium: '#fde68a', strong: '#fcd34d' },
  sadness: { light: 'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)', medium: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', strong: 'linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)' },
  anger: { light: '#fee2e2', medium: '#fecaca', strong: '#fca5a5' },
  default: { light: '#f3f4f6', medium: '#d1d5db', strong: '#6b7280' },
};
// --- End safety defaults ---


function getEmotionColor(emotion, intensity, type) {
  if (!emotion || emotion === SAFE_EMOTIONS.NEUTRAL) {
    return SAFE_NODE_STYLES[type]?.background || SAFE_NODE_STYLES.argument.background;
  }
  const colors = SAFE_EMOTION_COLORS[emotion] || SAFE_EMOTION_COLORS.default;
  if (intensity < 33) return colors.light;
  if (intensity < 66) return colors.medium;
  return colors.strong;
}
function getBorderColor(emotion, intensity, type) {
  if (!emotion || emotion === SAFE_EMOTIONS.NEUTRAL) {
    return SAFE_NODE_STYLES[type]?.border || SAFE_NODE_STYLES.argument.border;
  }
  const colors = SAFE_EMOTION_COLORS[emotion] || SAFE_EMOTION_COLORS.default;
  return colors?.strong || SAFE_NODE_STYLES[type]?.border;
}


/**
 * Simple, recursive node component.
 * Renders one node and all its children with indentation and lines.
 */
export function SimpleNodeComponent({ node, onNodeEmotionChange, applyTreeModification }) {
  // node structure is: { id, children, data: { label, type, startIdx, emotion, intensity } }
  const { id, data, children } = node;
  const { label, startIdx, emotion, intensity, type } = data;

  const [isEmotionModalOpen, setIsEmotionModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleEmotionClick = (e) => {
    e.stopPropagation();
    setIsEmotionModalOpen(true);
  };

  const handleEmotionSelect = (selectedEmotion, selectedIntensity) => {
    if (onNodeEmotionChange) {
      onNodeEmotionChange(id, selectedEmotion, selectedIntensity || 50);
    }
  };

  const bg = getEmotionColor(emotion, intensity, type);
  const border = getBorderColor(emotion, intensity, type);
  // Make root text white, others dark
  const color = (type === 'root') ? '#ffffff' : '#1f2937';
  return (
    <div style={{ position: 'relative' }}>
      {/* Node Content */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 8,
          boxShadow: isHovered
            ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            : '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          fontFamily: '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
          padding: '8px 40px 8px 12px', // Space for button
          marginBottom: '8px', // Space between nodes
          minHeight: '40px',
        }}
      >
        {/* Emotion Button */}
        <button
          onClick={handleEmotionClick}
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: 8,
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
          }}
          title="Set emotion"
        >
          😊
        </button>

        {/* Node Label */}
        <div
          style={{
            fontSize: 14,
            fontWeight: (type === 'root' || type === 'chapter') ? 600 : 500,
            color,
            lineHeight: 1.45,
          }}
        >
          {label}
        </div>
      </div>

      {/* --- Children Rendering (The recursive part) --- */}
      {children && children.length > 0 && (
        <div style={{ 
          paddingLeft: '24px', // The indent for the children block
          marginLeft: '12px', // Margin from the parent node
          borderLeft: '2px solid #e5e7eb', // The main vertical line
          position: 'relative',
        }}>
          {children.map((childNode) => (
            <div key={childNode.id} style={{ position: 'relative' }}>
              {/* This is the horizontal connector line */}
              <div style={{
                position: 'absolute',
                top: '21px', // Aligns with middle of the node (minHeight 40px / 2 + 1px border)
                left: '-24px', // Connects to the parent's vertical line
                width: '22px', // Length of the horizontal line (paddingLeft - border)
                height: '2px',
                backgroundColor: '#e5e7eb', // Match vertical line color
              }} />
              
              {/* Render the child node recursively */}
              <SimpleNodeComponent
                node={childNode}
                onNodeEmotionChange={onNodeEmotionChange}
                applyTreeModification={applyTreeModification}
              />
            </div>
          ))}
        </div>
      )}

      {/* Emotion Selector Modal */}
      {isEmotionModalOpen && (
        <EmotionSelector
          data={{
            isOpen: isEmotionModalOpen,
            onClose: () => setIsEmotionModalOpen(false),
            onSelect: ({ emotion, intensity }) => {
              handleEmotionSelect(emotion, intensity);
              setIsEmotionModalOpen(false);
            },
            id,
            startIdx: startIdx,
            label: label,
            emotion: emotion,
            applyTreeModification: applyTreeModification,
          }}
        />
      )}
    </div>
  );
}