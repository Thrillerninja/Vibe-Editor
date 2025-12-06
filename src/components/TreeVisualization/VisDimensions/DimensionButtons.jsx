import { useState } from 'react';
import { ControlButton } from 'reactflow';

/**
 * This is a option for letting the user select what dimension of the text is visualized by the node colors.
 * We should add a legend somewhere that explains what the colors mean in each dimension.
 * For now this is just the placeholder
 * 
 * @param {string} emoji - Emoji representing the dimension
 * @param {string} label - Label for the dimension
 * @param {Function} onClick - Click handler for the button
 * @returns DimensionButton component
 * 
 * @example
 * <DimensionButton 
 *    emoji="🎭"
 *   label="Sentiment"
 *   onClick={() => setDimension('sentiment')}
 * />
 */

export const DimensionButton = ({ emoji, label, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <ControlButton
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        fontSize: "20px",
        width: isHovered ? "110px" : "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        transition: "width 0.3s ease-in-out",
        overflow: "hidden",
        whiteSpace: "nowrap",
        color: "#333",
        boxShadow: "0 0 2px 1px rgba(0, 0, 0, 0.08)",
      }}
    >
      <span>{emoji}</span>
      {isHovered && <span style={{ fontSize: "14px", fontWeight: "500" }}>{label}</span>}
    </ControlButton>
  );
};