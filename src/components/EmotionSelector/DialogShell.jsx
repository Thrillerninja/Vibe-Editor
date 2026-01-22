/**
 * @fileoverview DialogShell - Modal backdrop and container wrapper
 * 
 * Provides consistent modal styling and behavior without business logic.
 * Handles backdrop, sizing, and layout structure only.
 */

import { createPortal } from 'react-dom';

/**
 * DialogShell - Reusable modal backdrop and container
 * 
 * Features:
 * - Fixed position backdrop with click handling
 * - Centered modal container with theme color accent border
 * - Scrollable content area with overflow handling
 * - Proper z-index stacking
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to render inside modal
 * @param {string} [props.accentColor='#3b82f6'] - Border accent color (emotion-based)
 * @param {Function} [props.onBackdropClick] - Callback when backdrop clicked
 * @returns {React.ReactElement} Portal-rendered modal shell
 * 
 * @example
 * <DialogShell accentColor={emotionColor} onBackdropClick={handleCancel}>
 *   <ModalContent />
 * </DialogShell>
 */
export function DialogShell({
  children,
  accentColor = '#3b82f6',
  onBackdropClick,
}) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '10vh',
        zIndex: 9999999,
      }}
      onClick={onBackdropClick}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderRadius: '24px',
          padding: 0,
          maxWidth: 800,
          width: '90%',
          height: 'auto',
          maxHeight: '80vh',
          border: `3px solid ${accentColor}`,
          boxShadow: `0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 0 30px ${accentColor}66`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#111827',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export default DialogShell;