/**
 * @fileoverview SubtreeEditingPanel - Subtree (group/organizational node) editing interface
 * 
 * Provides bulk editing of descendant leaf nodes with collective emotion adjustment.
 * For group, chapter, or section nodes.
 */

import { LeafSkeletonGroup } from '../TreeVisualization/animatedNodeComponentRenderers.jsx';
import EmotionRadar from '../EmotionSelector/old/EmotionRadar.jsx';
import { EditHeader } from './EmotionRadarSection.jsx';
import LeafSuggestionCard from './LeafSuggestionCard.jsx';

/**
 * SubtreeEditingPanel - Edit interface for subtree/group nodes
 * 
 * Left column: List of leaf node suggestions with editing
 * Right column: Emotion radar for collective emotion adjustment
 * 
 * @param {Object} props
 * @param {string} props.id - Subtree node ID
 * @param {import('../../types/node.js').NodeData} props.data - Node data with handlers
 * @param {Object<string, import('./useLeafSuggestions.js').LeafSuggestionEntry>} props.suggestions - Map of leafId → suggestion entry
 * @param {string[]} props.leafOrder - Ordered leaf IDs
 * @param {import('../../types/node.js').NodeEmotion} props.emotion - Current emotion state
 * @param {Function} props.onEmotionChange - Update emotion (profile object)
 * @param {Function} props.onFetchSuggestions - Fetch suggestions handler
 * @param {Function} props.onRotatePrev - Rotate prev handler
 * @param {Function} props.onRotateNext - Rotate next handler
 * @param {Function} props.onUpdateText - Update text handler
 * @param {boolean} [props.isLoading=false] - Currently fetching
 * @returns {React.ReactElement}
 * 
 * @example
 * <SubtreeEditingPanel
 *   id="group-456"
 *   data={nodeData}
 *   suggestions={suggestions}
 *   leafOrder={leafOrder}
 *   emotion={emotion.profile}
 *   onEmotionChange={emotion.updateProfile}
 *   onFetchSuggestions={handleFetch}
 *   onRotatePrev={rotatePrev}
 *   onRotateNext={rotateNext}
 *   onUpdateText={updateText}
 *   isLoading={isLoading}
 * />
 */
export function SubtreeEditingPanel({
    id,
    data,
    suggestions,
    leafOrder,
    emotion,
    onEmotionChange,
    onFetchSuggestions,
    onRotatePrev,
    onRotateNext,
    onUpdateText,
    isLoading = false,
}) {
    return (
        <div style={{ padding: '20px 24px 16px 24px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <EditHeader
                title={data.content || 'Subtree Content'}
                metadata={data.emotion}
                onRewrite={onFetchSuggestions}
                isLoading={isLoading}
            />

            {/* Main content area - two columns */}
            <div style={{ display: 'flex', gap: 32, flex: 1, minHeight: 0 }}>
                {/* Left: Suggestions list */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                    {/* Loading state */}
                    {isLoading && leafOrder.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <LeafSkeletonGroup count={3} />
                        </div>
                    ) : leafOrder.length > 0 ? (
                        // Loaded suggestions
                        <div
                            style={{
                                flex: 1,              // Take available space
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                                minHeight: 0,
                                height: 0,
                                overflowY: 'auto',      // Changed from 'hidden' to 'auto'
                                overflowX: 'hidden',
                                paddingRight: 20,
                            }}>
                            {leafOrder.map((leafId) => {
                                const entry = suggestions[leafId];
                                if (!entry) return null;

                                const currentText = entry.editedText ?? entry.original;
                                const optionCount = entry.options?.length ?? 0;

                                return (
                                    <LeafSuggestionCard
                                        key={leafId}
                                        leafId={leafId}
                                        currentText={currentText}
                                        optionCount={optionCount}
                                        currentIndex={entry.selectedIdx >= 0 ? entry.selectedIdx : 0}
                                        onPrev={() => onRotatePrev(leafId)}
                                        onNext={() => onRotateNext(leafId)}
                                        onTextChange={(newText) => onUpdateText(leafId, newText)}
                                        isLoading={isLoading}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        // Empty state: Before rewrite button clicked
                        <div
                            style={{
                                padding: '32px 16px',
                                textAlign: 'center',
                                color: '#9ca3af',
                                fontSize: 14,
                                borderRadius: 12,
                                background: 'rgba(0,0,0,0.02)',
                                border: '1px dashed rgba(0,0,0,0.1)',
                            }}
                        >
                            <div style={{ marginBottom: 8 }}>No suggestions yet</div>
                            <div style={{ fontSize: 12, color: '#d1d5db' }}>
                                Click the ↻ button to generate rewrite options
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Emotion radar */}
                <div
                    style={{
                        width: 340,
                        flexShrink: 0,
                        paddingTop: 28,
                        opacity: isLoading ? 0.5 : 1,
                        pointerEvents: isLoading ? 'none' : 'auto',
                        transition: 'opacity 0.2s ease',
                    }}
                >
                    <div style={{ position: 'relative' }}>
                        <EmotionRadar
                            profile={emotion.profile}
                            onChange={onEmotionChange}
                            size={340}
                            label="Subtree emotion profile"
                        />
                        {isLoading && (
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    borderRadius: '50%',
                                    background: 'rgba(255, 255, 255, 0.3)',
                                    zIndex: 10,
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SubtreeEditingPanel;