import { useState } from 'react';

/**
 * VerticalDivider with animated arrow indicators and resize functionality
 * @param {number} direction - Arrow direction: 1 for right, -1 for left, 0 for hidden
 * @param {function} onMouseDown - Handler for mouse down (resize)
 * @param {function} onTouchStart - Handler for touch start (resize)
 */
export const VerticalDivider = ({ 
  direction = 0, 
  onMouseDown, 
  onTouchStart 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Opacity gradient for the 5 arrows (outside to center)
  const opacities = [0.2, 0.6, 1, 0.6, 0.2];

  // Styles for arrow elements
  const arrowStyles = {
    base: {
      position: 'relative',
      width: '12px',
      height: '30px',
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      display: 'inline-block',
      flexShrink: 0,
      backgroundImage: `url(arrow-right-bold.svg)`,
      transition: 'none',
      ml: "-5px",
      mr: "-5px",
    },
    left: {
      transform: 'scaleX(-1)',
    },
  };

  // Animation keyframes
  const animationStyles = `
    @keyframes bounceArrowRight {
      0% {
        opacity: 1;
        transform: translateX(0px) scale(1);
      }
      25% {
        opacity: 0;
        transform: translateX(6px) scale(0.9);
      }
      26% {
        opacity: 0;
        transform: translateX(-6px) scale(0.9);
      }
      55% {
        opacity: 1;
        transform: translateX(0px) scale(1);
      }
      100% {
        opacity: 1;
        transform: translateX(0px) scale(1);
      }
    }

    @keyframes bounceArrowLeft {
      0% {
        opacity: 1;
        transform: translateX(0px) scaleX(-1) scale(1);
      }
      25% {
        opacity: 0;
        transform: translateX(-6px) scaleX(-1) scale(0.9);
      }
      26% {
        opacity: 0;
        transform: translateX(6px) scaleX(-1) scale(0.9);
      }
      55% {
        opacity: 1;
        transform: translateX(0px) scaleX(-1) scale(1);
      }
      100% {
        opacity: 1;
        transform: translateX(0px) scaleX(-1) scale(1);
      }
    }

    .bounce-arrow-right {
      animation: bounceArrowRight 1.2s infinite linear;
    }

    .bounce-arrow-left {
      animation: bounceArrowLeft 1.2s infinite linear;
    }
  `;

  return (
    <>
      <style>{animationStyles}</style>
      
      <button
        aria-label="Resize panels"
        title="Drag to resize"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="relative group"
        style={{
          width: '6px',
          cursor: 'col-resize',
          background: 'white',
          border: 'none',
          padding: 0,
        }}
      >
        {/* Visible center line */}
        <span
          aria-hidden
          className="block h-full bg-gray-300 group-hover:bg-gray-400"
          style={{ width: '2px', margin: '0 auto' }}
        />

        {/* Arrow indicators - only show if direction is set */}
        {direction !== 0 && (
          <div
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-0.5"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ 
              height: '60px',
              width: '100px',
              alignItems: 'center',
              flexDirection: 'row', // maybe try column for interesting effect
              zIndex: 99991
             }}
          >
          </div>
        )}
      </button>
    </>
  );
};


/*
 * Transfer Chagnes to other side
 * Replacement for Update Hierarchy Layout Button
*/

function transferChangesToSide(direction) {
  alert('Activated transfer if changes to side: ' + direction)
}