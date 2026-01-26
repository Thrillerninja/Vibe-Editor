/**
 * @fileoverview LeafEditingPanel - Content node (sentence/heading) editing interface
 * 
 * Provides text editing with Claude suggestions and emotion profile adjustment.
 * For individual sentence/heading/list-item nodes.
 */

import { useState } from 'react';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';
import EmotionRadar from './EmotionRadar.jsx';
import { EditHeader, SuggestionControls } from './EmotionRadarSection.jsx';

/**
 * LeafEditingPanel - Edit interface for individual content nodes
 * 
 * Left column: Text editing with suggestion cycling
 * Right column: Emotion radar for profile adjustment
 * 
 * @param {Object} props
 * @param {string} props.id - Node ID
 * @param {import('../../types/node.js').NodeData} props.data - Node data with handlers
 * @param {string} props.draftText - Current draft text
 * @param {Function} props.onTextChange - Update draft text
 * @param {import('../../types/node.js').NodeEmotion} props.emotion - Current emotion state
 * @param {Function} props.onEmotionChange - Update emotion (profile object)
 * @param {Function} [props.onDelete] - Delete handler
 * @param {Function} [props.onSave] - Save handler
 * @param {boolean} [props.isLoading=false] - Disable UI during operations
 * @returns {React.ReactElement}
 * 
 * @example
 * <LeafEditingPanel
 *   id="node-123"
 *   data={nodeData}
 *   draftText={draftText}
 *   onTextChange={setDraftText}
 *   emotion={emotion.profile}
 *   onEmotionChange={emotion.updateProfile}
 *   onDelete={() => deleteNode(id)}
 *   onSave={() => saveNode(id)}
 * />
 */
export function LeafEditingPanel({
    id,
    data,
    draftText,
    onTextChange,
    emotion,
    onEmotionChange,
    onDelete,
    onSave,
    isLoading = false,
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
    const [isFetching, setIsFetching] = useState(false);

    /**
     * Fetch rewrite suggestions using current emotion profile
     */
    const handleFetchSuggestions = async (e) => {
        e.stopPropagation();
        if (isFetching) return;

        setIsFetching(true);
        try {
            const options = await rewriteSentenceWithEmotionOptions(
                draftText,
                emotion.profile,
                3
            );
            setSuggestions(options || []);
            setCurrentSuggestionIndex(0);
            if (options?.length > 0) {
                onTextChange(options[0]);
            }
        } catch (err) {
            console.error('[LeafEditingPanel] Failed to fetch suggestions:', err);
        } finally {
            setIsFetching(false);
        }
    };

    const showPrevSuggestion = () => {
        if (!suggestions.length) return;
        const newIdx = (currentSuggestionIndex - 1 + suggestions.length) % suggestions.length;
        setCurrentSuggestionIndex(newIdx);
        onTextChange(suggestions[newIdx]);
    };

    const showNextSuggestion = () => {
        if (!suggestions.length) return;
        const newIdx = (currentSuggestionIndex + 1) % suggestions.length;
        setCurrentSuggestionIndex(newIdx);
        onTextChange(suggestions[newIdx]);
    };

    return (
        <div style={{ padding: '20px 24px 16px 24px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <EditHeader
                title="Edit Content"
                metadata={data.emotion}
                onRewrite={handleFetchSuggestions}
                isLoading={isFetching}
            />
            
            {/* Main content area - two columns */}
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                {/* Left: Text editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>


                    {suggestions.length > 0 && (
                        <SuggestionControls
                            suggestions={suggestions}
                            currentIdx={currentSuggestionIndex}
                            onPrev={showPrevSuggestion}
                            onNext={showNextSuggestion}
                            isLoading={isFetching}
                        />
                    )}

                    <textarea
                        value={draftText}
                        onChange={(e) => onTextChange(e.target.value)}
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            flex: 1,
                            minHeight: 320,
                            padding: '16px',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            background: 'rgba(255, 255, 255, 0.95)',
                            marginBottom: 16,
                            color: '#111827',
                            resize: 'none',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            outline: 'none',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
                            opacity: isLoading ? 0.6 : 1,
                            cursor: isLoading ? 'not-allowed' : 'text',
                        }}
                    />
                </div>

                {/* Right: Emotion radar */}
                <div style={{ width: 340, flexShrink: 0, paddingTop: 28, opacity: isFetching ? 0.5 : 1, pointerEvents: isFetching ? 'none' : 'auto' }}>
                    <div style={{ position: 'relative' }}>
                        <EmotionRadar
                            profile={emotion.profile}
                            onChange={onEmotionChange}
                            size={340}
                            label="Emotion profile"
                        />
                        {isFetching && (
                            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.3)' }} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LeafEditingPanel;