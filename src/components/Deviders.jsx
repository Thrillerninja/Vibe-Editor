/**
 * Vertical divider handle for horizontal panel resizing
 * @param {{onMouseDown: Function}} props
 * @returns {React.ReactElement}
 */
export function VerticalDividerHandle({ onMouseDown }) {
  return (
    <button
      aria-label="Resize panels left and right"
      title="Drag to resize"
      onMouseDown={onMouseDown}
      className="relative group"
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: 'white',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        className="block h-full bg-gray-300 group-hover:bg-gray-400 transition-colors"
        style={{ width: '2px', margin: '0 auto' }}
      />
    </button>
  );
}

/**
 * Horizontal divider handle for vertical panel resizing
 * @param {{onMouseDown: Function}} props
 * @returns {React.ReactElement}
 */
export function HorizontalDividerHandle({ onMouseDown }) {
  return (
    <button
      aria-label="Resize panels top and bottom"
      title="Drag to resize"
      onMouseDown={onMouseDown}
      className="relative group"
      style={{
        height: '6px',
        cursor: 'row-resize',
        background: 'white',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden
        className="block w-full bg-gray-300 group-hover:bg-gray-400 transition-colors"
        style={{ height: '2px', margin: 'auto 0' }}
      />
    </button>
  );
}