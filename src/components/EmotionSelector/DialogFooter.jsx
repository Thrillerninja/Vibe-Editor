/**
 * @fileoverview DialogFooter - Sticky footer with action buttons
 * 
 * Always-visible footer that sticks to bottom of modal while content scrolls.
 * Handles button styling, hover effects, and layout.
 */

/**
 * DialogFooter - Sticky action buttons footer
 * 
 * Always visible at bottom of modal using CSS sticky positioning.
 * Handles delete, cancel, and save buttons with proper spacing.
 * 
 * @param {Object} props
 * @param {Function} [props.onDelete] - Delete button handler
 * @param {Function} props.onCancel - Cancel button handler (required)
 * @param {Function} [props.onSave] - Save button handler
 * @param {boolean} [props.showDelete=false] - Show delete button
 * @param {boolean} [props.showSave=false] - Show save button
 * @param {boolean} [props.isLoading=false] - Disable buttons during loading
 * @returns {React.ReactElement}
 * 
 * @example
 * <DialogFooter
 *   onDelete={handleDelete}
 *   onCancel={handleCancel}
 *   onSave={handleSave}
 *   showDelete={true}
 *   showSave={hasChanges}
 *   isLoading={isSaving}
 * />
 */
export function DialogFooter({
  onDelete,
  onCancel,
  onSave,
  showDelete = false,
  showSave = false,
  isLoading = false,
}) {
  const buttonBaseStyle = {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '12px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: '14px',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 10,
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 24,
        paddingRight: 24,
        borderTop: '1px solid rgba(0,0,0,0.06)',
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Delete button (left side, if shown) */}
      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const confirmed = window.confirm('Delete this? This cannot be undone.');
            if (confirmed && onDelete) onDelete();
          }}
          disabled={isLoading}
          title="Delete this node"
          style={{
            ...buttonBaseStyle,
            backgroundColor: '#ef4444',
            color: 'white',
            marginRight: 'auto',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
          }}
          onMouseOver={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#ef4444';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          }}
        >
          Delete
        </button>
      )}

      {/* Cancel button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        disabled={isLoading}
        style={{
          ...buttonBaseStyle,
          backgroundColor: 'rgba(0,0,0,0.05)',
          color: '#374151',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
        }}
      >
        Cancel
      </button>

      {/* Save button (if shown) */}
      {showSave && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onSave) onSave();
          }}
          disabled={isLoading}
          style={{
            ...buttonBaseStyle,
            background: '#111827',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
        >
          Save
        </button>
      )}
    </div>
  );
}

export default DialogFooter;