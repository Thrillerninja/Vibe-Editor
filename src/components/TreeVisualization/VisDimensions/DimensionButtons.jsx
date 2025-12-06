import { useState } from 'react';
import { ControlButton } from 'reactflow';

/**
 * This is an option for letting the user select what dimension of the text is visualized by the node colors.
 * We should add a legend somewhere that explains what the colors mean in each dimension.
 * For now, this is just the placeholder.
 * 
 * @param {string} iconBw - Black-and-white image representing the dimension
 * @param {string} iconRgb - RGB image representing the dimension
 * @param {string} label - Label for the dimension
 * @param {Function} onClick - Click handler for the button
 * @returns DimensionButton component
 * 
 * @example
 * <DimensionButton 
 *   iconBw="path/to/bw-image.png"
 *   iconRgb="path/to/rgb-image.png"
 *   label="Sentiment"
 *   onClick={() => setDimension('sentiment')}
 * />
 */

export const DimensionButton = ({ iconBw, iconRgb, label, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <ControlButton
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        fontSize: "20px",
        width: "auto", // Collapsed width when not hovered
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "8px",
        transition: "width 0.3s ease-in-out",
        overflow: "hidden",
        whiteSpace: "nowrap",
        color: "#333",
        backgroundColor: "#f7f7f7",
        boxShadow: "0 0 2px 1px rgba(0, 0, 0, 0.08)",
        padding: "4px 0px 4px 6px",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "24px",
          height: "24px",
          overflow: "hidden",
        }}
      >
        <img
          src={iconBw}
          alt="icon-bw"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transition: "opacity 0.3s ease-in-out",
            opacity: isHovered ? 0 : 1,
          }}
        />
        <img
          src={iconRgb}
          alt="icon-rgb"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transition: "opacity 0.3s ease-in-out",
            opacity: isHovered ? 1 : 0,
          }}
        />
      </div>
      <span
        style={{
          fontSize: "14px",
          fontWeight: "500",
          opacity: isHovered ? 1 : 0,
          maxWidth: isHovered ? "200px" : "0px", // Limit max width when hovered
          overflow: "hidden",
          transition: "opacity 0.3s ease-in-out, max-width 0.3s ease-in, padding-right 0.3s ease-out",
          paddingRight: isHovered ? "8px" : "0px"
        }}
      >
        {label}
      </span>
    </ControlButton>
  );
};