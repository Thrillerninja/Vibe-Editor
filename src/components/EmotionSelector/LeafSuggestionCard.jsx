/**
 * @fileoverview LeafSuggestionCard - Single leaf node suggestion card
 * 
 * Displays one leaf's suggestion options with rotation controls and textarea editing.
 */

/**
 * LeafSuggestionCard - Rendered card for a single leaf suggestion
 * 
 * Features:
 * - Previous/Next suggestion buttons
 * - Current option counter
 * - Editable textarea with current text
 * - Disabled state during loading
 * 
 * @param {Object} props
 * @param {string} props.leafId - Leaf node ID
 * @param {string} props.currentText - Current/selected text
 * @param {number} props.optionCount - Total options available
 * @param {number} props.currentIndex - Currently selected option index
 * @param {Function} props.onPrev - Previous button handler
 * @param {Function} props.onNext - Next button handler
 * @param {Function} props.onTextChange - Textarea change handler
 * @param {boolean} [props.isLoading=false] - Disable during loading
 * @returns {React.ReactElement}
 * 
 * @example
 * <LeafSuggestionCard
 *   leafId="leaf-123"
 *   currentText="Some text"
 *   optionCount={3}
 *   currentIndex={0}
 *   onPrev={() => rotatePrev('leaf-123')}
 *   onNext={() => rotateNext('leaf-123')}
 *   onTextChange={(text) => updateText('leaf-123', text)}
 * />
 */
export function LeafSuggestionCard({
  leafId,
  currentText,
  optionCount,
  currentIndex,
  onPrev,
  onNext,
  onTextChange,
  isLoading = false,
}) {
  const hasOptions = optionCount > 0;

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 12,
        padding: 16,
        background: 'rgba(255,255,255,0.9)',
      }}
    >
      {/* Suggestion controls (prev/next + counter) */}
      {hasOptions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={onPrev}
            disabled={isLoading || !hasOptions}
            title="Previous option"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(255,255,255,0.8)',
              cursor: isLoading || !hasOptions ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: 12,
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              if (!isLoading && hasOptions) {
                e.currentTarget.style.background = '#e5e7eb';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.8)';
            }}
          >
            ◀
          </button>

          <div style={{ fontSize: 12, color: '#555' }}>
            Option {currentIndex + 1} / {optionCount}
          </div>

          <button
            onClick={onNext}
            disabled={isLoading || !hasOptions}
            title="Next option"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(255,255,255,0.8)',
              cursor: isLoading || !hasOptions ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: 12,
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              if (!isLoading && hasOptions) {
                e.currentTarget.style.background = '#e5e7eb';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.8)';
            }}
          >
            ▶
          </button>
        </div>
      )}

      {/* Editable textarea */}
      <textarea
        value={currentText}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={isLoading}
        style={{
          width: '100%',
          minHeight: 100,
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#111827',
          resize: 'vertical',
          fontFamily: 'inherit',
          fontSize: '14px',
          outline: 'none',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)',
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'not-allowed' : 'text',
          transition: 'all 0.2s ease',
        }}
      />
    </div>
  );
}

export default LeafSuggestionCard;