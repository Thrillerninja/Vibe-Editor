/**
 * @fileoverview Indentation visualization for nested list items
 * 
 * Provides visual feedback for list nesting depth with
 * indentation offset and subtle visual guides.
 */

/**
 * Calculate left padding based on indent level
 * @param {number} indentLevel - Nesting depth (0, 1, 2, ...)
 * @param {number} pixelsPerLevel - Pixels per indent (default: 16)
 * @returns {number} Total left padding in pixels
 */
export function getIndentPadding(indentLevel, pixelsPerLevel = 16) {
  return (indentLevel || 0) * pixelsPerLevel;
}

/**
 * Render indentation visual guide
 * Shows subtle lines/dots to indicate nesting depth
 * 
 * @param {number} indentLevel - Nesting depth
 * @param {string} [type='lines'] - 'lines' | 'dots' | 'bars'
 * @returns {React.ReactElement|null}
 */
export function renderIndentationGuide(indentLevel, type = 'lines') {
  if (!indentLevel || indentLevel === 0) return null;

  const pixelsPerLevel = 16;
  const padding = getIndentPadding(indentLevel, pixelsPerLevel);

  switch (type) {
    case 'lines': {
      // Vertical lines for each level
      const lines = [];
      for (let i = 0; i < indentLevel; i++) {
        const x = i * pixelsPerLevel + pixelsPerLevel / 2;
        lines.push(
          <line
            key={`line-${i}`}
            x1={x}
            y1="0"
            x2={x}
            y2="100%"
            stroke="rgba(200, 200, 200, 0.15)"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        );
      }

      return (
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: padding + 4,
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
          preserveAspectRatio="none"
        >
          {lines}
        </svg>
      );
    }

    case 'dots': {
      // Subtle dots to show indentation
      return (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: padding,
            height: '100%',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
          }}
        >
          {Array.from({ length: indentLevel }).map((_, i) => (
            <div
              key={`dot-${i}`}
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: 'rgba(150, 150, 150, 0.2)',
                marginRight: pixelsPerLevel - 6,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      );
    }

    case 'bars': {
      // Left border segments
      return (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: padding,
            height: '100%',
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 14px,
              rgba(200, 200, 200, 0.1) 14px,
              rgba(200, 200, 200, 0.1) 16px
            )`,
          }}
        />
      );
    }

    default:
      return null;
  }
}

/**
 * Get indentation styling for content wrapper
 * @param {number} indentLevel
 * @param {number} pixelsPerLevel
 * @returns {Object} CSS style object
 */
export function getIndentationStyle(indentLevel, pixelsPerLevel = 16) {
  const padding = getIndentPadding(indentLevel, pixelsPerLevel);

  return {
    paddingLeft: padding,
    position: 'relative',
  };
}

export default {
  getIndentPadding,
  renderIndentationGuide,
  getIndentationStyle,
};