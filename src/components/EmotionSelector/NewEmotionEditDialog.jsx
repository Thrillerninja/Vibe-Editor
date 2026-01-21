/**
 * @fileoverview NewEmotionEditDialog - Modal dialog for editing node emotions and content
 *
 * Provides a comprehensive editing interface for both individual sentences and subtrees.
 * Features emotion profile adjustment via radar, content editing with AI suggestions,
 * and batch rewriting for multiple descendant nodes.
 *
 * Manages:
 * - Sentence editing with Claude-powered rewrite suggestions
 * - Subtree emotion propagation with leaf node bulk editing
 * - Emotion profile visualization and adjustment
 * - Change tracking (text vs. emotion modifications)
 *
 * @typedef {import('../../types/node.js').Node} TreeNode
 * @typedef {import('../../types/node.js').NodeEmotion} NodeEmotion
 * @typedef {import('../../types/node.js').SemanticStructure} SemanticStructure
 * @typedef {import('../../types/node.js').InlineElement} InlineElement
 * @typedef {import('../../types/node.js').TextRepresentation} TextRepresentation
 * @typedef {import('../../types/node.js').OperationalMetadata} OperationalMetadata
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';
import EmotionRadar from '../EmotionSelector/EmotionRadar.jsx';
import { deriveLegacyFromProfile, normalizeEmotionProfile } from '@utils/emotionProfiles.js';
import '@components/TreeVisualization/TreeNode.css';
import { LeafSkeletonGroup, SubtreeEditingSkeleton } from '@components/TreeVisualization/animatedNodeComponentRenderers.jsx';
import { isContentNode } from '../../types/node.js';

/**
 * @typedef {Object} NewEmotionEditDialogProps
 * @property {Object} emotionProfile - Current emotion profile
 * @property {Function} setEmotionProfile - Update emotion profile
 * @property {Object} originalEmotionProfile - Original emotion before editing
 * @property {Function} setOriginalEmotionProfile - (unused)
 * @property {string} subtreeEmotion - Dominant emotion for subtree
 * @property {Function} setSubtreeEmotion - Update subtree emotion
 * @property {number} subtreeIntensity - Subtree emotion intensity
 * @property {Function} setSubtreeIntensity - Update subtree intensity
 * @property {Object<string, import('@components/TreeVisualization/AnimatedNodeComponent.jsx').LeafEntry>} leafSuggestions - Map of leaf ID → rewrite options
 * @property {Function} setLeafSuggestions - Update leaf suggestions
 * @property {string[]} leafOrder - Order of leaf IDs for display
 * @property {Function} setLeafOrder - Update leaf order
 * @property {Object} subtreeEmotionProfile - Emotion profile for entire subtree
 * @property {Function} setSubtreeEmotionProfile - Update subtree profile
 * @property {string} emotion - Dominant emotion for current node
 * @property {Function} setEmotion - Update dominant emotion
 * @property {number} intensity - Intensity for current node
 * @property {Function} setIntensity - Update intensity
 * @property {Function} setIsDialogOpen - Close dialog
 * @property {Function} getEmotionColor - Color utility function
 * @property {string} id - Node UUID
 * @property {Object} data - Node data object with applyNodeEdit, applySubtreeChanges, etc.
 */

/**
 * NewEmotionEditDialog - Modal for emotion and content editing
 *
 * Displays two editing modes:
 * 1. **Sentence editing** (data.type === 'sentence'):
 *    - Textarea for content editing
 *    - Emotion radar for profile adjustment
 *    - Claude rewrite suggestion cycling
 *
 * 2. **Subtree editing** (data.type !== 'sentence'):
 *    - List of leaf nodes with individual rewrites
 *    - Bulk emotion application across subtree
 *    - Skeleton loaders during async operations
 *
 * Change tracking:
 * - Text changes: Show save button only if content modified
 * - Emotion changes: Save button shows even if only emotion changed
 * - No changes: Save button hidden
 *
 * @param {NewEmotionEditDialogProps} props - All dialog state and handlers
 * @returns {React.ReactElement} Portal-rendered modal dialog
 */
export function NewEmotionEditDialog(
    {
        emotionProfile, setEmotionProfile,
        originalEmotionProfile, setOriginalEmotionProfile,
        subtreeEmotion, setSubtreeEmotion,
        subtreeIntensity, setSubtreeIntensity,
        leafSuggestions, setLeafSuggestions,
        leafOrder, setLeafOrder,
        subtreeEmotionProfile, setSubtreeEmotionProfile,
        emotion, setEmotion,
        intensity, setIntensity,

        setIsDialogOpen,

        getEmotionColor,
        id,
        data
    }) {

        
    // =========================================================================
    // STATE: Node Content
    // =========================================================================

    const [previousText, setPreviousText] = useState(
    data.content || ''
    );
    // =========================================================================
    // STATE: Suggestions & Variants
    // =========================================================================

    const [suggestions, setSuggestions] = useState([]);
    const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);

    const [activeTab, setActiveTab] = useState('information');
    const [isNodeRewriting, setIsNodeRewriting] = useState(false);



    // =========================================================================
    // HANDLERS: Sentence Editing
    // =========================================================================

    /**
     * Handle sentence content save
     * Reverts emotion to original if text didn't change
     * Creates new emotion object for new unified system
     */
    const handleSave = () => {
        const textChanged = data.content !== previousText;
        const finalProfile = textChanged ? emotionProfile : originalEmotionProfile;

        // Create new emotion object with metadata
        const newEmotion = {
            profile: finalProfile,
            dominantEmotion: emotion,
            dominantIntensity: intensity,
            source: 'manual',
            timestamp: new Date().toISOString(),
        };

        if (typeof data.applyNodeEdit === 'function') {
            data.applyNodeEdit(id, data.content, newEmotion);
        }

        setSuggestions([]);
        setCurrentSuggestionIndex(0);
        setIsDialogOpen(false);

        // Delete node if text is empty
        if (data.content.length === 0 && typeof data.deleteNode === 'function') {
            data.deleteNode(id);
        }
    };

    /**
     * Handle dialog cancellation
     * Reverts all changes to original state
     */
    const handleCancel = () => {
        setEmotionProfile(originalEmotionProfile);
        setEmotion(data.emotion?.dominantEmotion || 'interest');
        setSuggestions([]);
        setCurrentSuggestionIndex(0);
        setLeafSuggestions({});
        setLeafOrder([]);
        setSubtreeEmotionProfile(originalEmotionProfile);
        setSubtreeEmotion(data.emotion?.dominantEmotion || 'interest');
        setSubtreeIntensity(data.emotion?.dominantIntensity ?? 0);
        setIsDialogOpen(false);

        data.content = previousText;
    };

    /**
     * Fetch Claude-powered rewrite suggestions
     * Updates emotion profile and fetches 3 alternatives
     */
    const fetchRewriteOptions = async () => {
        if (isNodeRewriting) return;

        setIsNodeRewriting(true);

        try {
            const options = await rewriteSentenceWithEmotionOptions(
                data.content,
                emotionProfile,
                3
            );
            setSuggestions(options);
            setCurrentSuggestionIndex(0);

            if (options && options.length > 0) {
                data.content = options[0];
            }
        } catch (e) {
            console.error('Failed to get rewrite options:', e);
        }

        setIsNodeRewriting(false);
    };

    /**
     * Cycle to previous suggestion
     */
    const showPrevSuggestion = () => {
        if (!suggestions || suggestions.length === 0) return;

        const newIdx =
            (currentSuggestionIndex - 1 + suggestions.length) % suggestions.length;
        setCurrentSuggestionIndex(newIdx);
        data.content = suggestions[newIdx];
    };

    /**
     * Cycle to next suggestion
     */
    const showNextSuggestion = () => {
        if (!suggestions || suggestions.length === 0) return;

        const newIdx = (currentSuggestionIndex + 1) % suggestions.length;
        setCurrentSuggestionIndex(newIdx);
        data.content = suggestions[newIdx];
    };

    // =========================================================================
    // HANDLERS: Subtree Editing
    // =========================================================================

    /**
     * Update emotion intensity for subtree
     *
     * @param {number} inputIntensity - New intensity [0-100]
     */
    const setSubtreeNodeIntensity = (inputIntensity) => {
        setSubtreeIntensity(inputIntensity);
        const next = {
            ...subtreeEmotionProfile,
            [subtreeEmotion]: inputIntensity,
        };
        setSubtreeEmotionProfile(next);
    };

    /**
     * Load rewrite options for all descendant leaf nodes
     * Fetches Claude suggestions for each leaf using subtree emotion profile
     */
    const fetchSubtreeRewriteOptions = async () => {
        if (isNodeRewriting) return;

        setIsNodeRewriting(true);

        try {
            const leaves =
                typeof data.getDescendantLeaves === 'function'
                    ? data.getDescendantLeaves(id)
                    : [];

            setLeafOrder(leaves.map(l => l.id));

            const optionsList = await Promise.all(
                leaves.map(async leaf => {
                    try {
                        const opts = await rewriteSentenceWithEmotionOptions(
                            leaf.content,
                            subtreeEmotionProfile,
                            3
                        );

                        return {
                            id: leaf.id,
                            original: leaf.content,
                            options: opts || [],
                            selectedIdx: opts && opts.length > 0 ? 0 : -1,
                            editedText: opts && opts.length > 0 ? opts[0] : leaf.content,
                        };
                    } catch (e) {
                        console.error('Failed to get options for leaf', leaf.id, e);
                        return {
                            id: leaf.id,
                            original: leaf.content,
                            options: [],
                            selectedIdx: -1,
                            editedText: leaf.content,
                        };
                    }
                })
            );

            const map = {};
            optionsList.forEach(entry => {
                map[entry.id] = entry;
            });
            setLeafSuggestions(map);
        } catch (e) {
            console.error('Failed subtree emotion rewrite:', e);
        }

        setIsNodeRewriting(false);
    };

    /**
     * Cycle leaf node to previous suggestion variant
     *
     * @param {string} leafId - Leaf node ID
     */
    const rotateLeafPrev = (leafId) => {
        const entry = leafSuggestions[leafId];
        if (!entry || !entry.options || entry.options.length === 0) return;

        const newIdx =
            (entry.selectedIdx - 1 + entry.options.length) % entry.options.length;
        setLeafSuggestions(prev => ({
            ...prev,
            [leafId]: {
                ...entry,
                selectedIdx: newIdx,
                editedText: entry.options[newIdx],
            },
        }));
    };

    /**
     * Cycle leaf node to next suggestion variant
     *
     * @param {string} leafId - Leaf node ID
     */
    const rotateLeafNext = (leafId) => {
        const entry = leafSuggestions[leafId];
        if (!entry || !entry.options || entry.options.length === 0) return;

        const newIdx = (entry.selectedIdx + 1) % entry.options.length;
        setLeafSuggestions(prev => ({
            ...prev,
            [leafId]: {
                ...entry,
                selectedIdx: newIdx,
                editedText: entry.options[newIdx],
            },
        }));
    };

    // =========================================================================
    // Misc
    // =========================================================================

    const subtreeEmotionColor = getEmotionColor(
        subtreeEmotion,
        subtreeIntensity,
        data.type
    );
    const modalAccentColor = isContentNode(data) ? getEmotionColor(emotion, intensity, data.type) : subtreeEmotionColor;


    return (createPortal(
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
                    border: `3px solid ${modalAccentColor}`,
                    boxShadow: `0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 0 30px ${modalAccentColor}66`,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    color: '#111827'
                }}
                onClick={e => e.stopPropagation()}
            >

                {/* Scrollable content area */}
                <div
                    style={{
                        overflowY: 'auto',
                        background: 'transparent',
                        maxHeight: 'calc(72vh - 52px)',
                    }}
                >

                    {/* Editing Tab: Sentence editing */}
                    {activeTab === "information" && isContentNode(data) && (
                        <div style={{ padding: "20px 24px 16px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1 }}>
                                {/* Left Column: Text */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                                        <div style={{ fontWeight: 600 }}>Edit Content</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {(data.emotion?.source || data.emotion?.timestamp) && (
                                                <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                                                    {[data.emotion.source && `by ${data.emotion.source}`, data.emotion.timestamp].filter(Boolean).join(' • ')}
                                                </span>
                                            )}
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        fetchRewriteOptions();
                                                    }}
                                                    disabled={isNodeRewriting}
                                                    title="Generate 3 rewrite options using current emotion profile"
                                                    style={{
                                                        width: 36,
                                                        height: 36,
                                                        borderRadius: '50%',
                                                        border: 'none',
                                                        background: isNodeRewriting ? '#e5e7eb' : '#111827',
                                                        color: isNodeRewriting ? '#9ca3af' : '#ffffff',
                                                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 18,
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                                    }}
                                                    onMouseOver={(e) => {
                                                        if (!isNodeRewriting) {
                                                            e.currentTarget.style.background = '#374151';
                                                            e.currentTarget.style.transform = 'scale(1.1)';
                                                        }
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.background = '#111827';
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                    }}
                                                >
                                                    ↻
                                                </button>
                                                {JSON.stringify(emotionProfile) !== JSON.stringify(originalEmotionProfile) && data.content === previousText && (
                                                    <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                                                        !
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {suggestions.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <button
                                                onClick={showPrevSuggestion}
                                                disabled={isNodeRewriting}
                                                title="Previous option"
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                    background: 'rgba(255,255,255,0.8)',
                                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                            >
                                                ◀
                                            </button>
                                            <div style={{ fontSize: 12, color: '#555' }}>
                                                Option {currentSuggestionIndex + 1} / {suggestions.length}
                                            </div>
                                            <button
                                                onClick={showNextSuggestion}
                                                disabled={isNodeRewriting}
                                                title="Next option"
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                    background: 'rgba(255,255,255,0.8)',
                                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                            >
                                                ▶
                                            </button>
                                        </div>
                                    )}
                                    <textarea
                                        value={data.content}
                                        onChange={(e) => data.content = (e.target.value)}
                                        style={{
                                            width: "100%",
                                            flex: 1,
                                            minHeight: 320,
                                            padding: "16px",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(0, 0, 0, 0.1)",
                                            background: "rgba(255, 255, 255, 0.5)",
                                            marginBottom: 16,
                                            color: "#111827",
                                            resize: "none",
                                            fontFamily: "inherit",
                                            fontSize: "14px",
                                            outline: "none",
                                            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)"
                                        }}
                                    />
                                </div>

                                {/* Right Column: Emotion */}
                                <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
                                    <div style={{ position: 'relative' }}>
                                        <EmotionRadar
                                            profile={emotionProfile}
                                            onChange={(next) => {
                                                setEmotionProfile(next);
                                                const legacy = deriveLegacyFromProfile(next);
                                                setEmotion(legacy.emotion);
                                            }}
                                            size={340}
                                            label="Emotion profile"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                <button
                                    title="Delete this sentence"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const ok = window.confirm('Delete this sentence? This cannot be undone.');
                                        if (ok && typeof data.deleteNode === 'function') {
                                            data.deleteNode(id);
                                            setIsDialogOpen(false);
                                        }
                                    }}
                                    disabled={isNodeRewriting}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '12px',
                                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                        marginRight: 'auto',
                                        fontWeight: 500,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                                    }}
                                    onMouseOver={(e) => {
                                        if (!isNodeRewriting) {
                                            e.currentTarget.style.backgroundColor = '#dc2626';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = '#ef4444';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={isNodeRewriting}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: 'rgba(0,0,0,0.05)',
                                        color: '#374151',
                                        border: 'none',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease'
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
                                {((data.content !== previousText || suggestions.length > 0) && isContentNode(data)) &&(
                                    <button
                                        onClick={handleSave}
                                        disabled={isNodeRewriting}
                                        style={{
                                            padding: "8px 20px",
                                            background: "#111827",
                                            color: "white",
                                            borderRadius: "12px",
                                            border: "none",
                                            cursor: "pointer",
                                            fontWeight: 500,
                                            fontSize: '14px',
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                            transition: 'all 0.2s ease'
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
                        </div>
                    )}

                    {/* Editing Tab: Subtree editing */}
                    {!isContentNode(data) && (
                        <div style={{ padding: "20px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                            {/* Header - outside of skeleton/content conditional */}
                            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                                <div style={{ fontWeight: 600 }}>{data.content || 'Subtree Content'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {(data.emotion?.source || data.emotion?.timestamp) && (
                                        <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                                            {[data.emotion?.source && `by ${data.emotion?.source}`, data.emotion?.timestamp].filter(Boolean).join(' • ')}
                                        </span>
                                    )}
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                fetchSubtreeRewriteOptions();
                                            }}
                                            disabled={isNodeRewriting}
                                            title="Generate 3 rewrite options for each sentence"
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: '50%',
                                                border: 'none',
                                                background: isNodeRewriting ? '#e5e7eb' : '#111827',
                                                color: isNodeRewriting ? '#9ca3af' : '#ffffff',
                                                cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 18,
                                                transition: 'all 0.2s ease',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                            }}
                                            onMouseOver={(e) => {
                                                if (!isNodeRewriting) {
                                                    e.currentTarget.style.background = '#374151';
                                                    e.currentTarget.style.transform = 'scale(1.1)';
                                                }
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.background = isNodeRewriting ? '#e5e7eb' : '#111827';
                                                e.currentTarget.style.transform = 'scale(1)';
                                            }}
                                        >
                                            ↻
                                        </button>
                                        {JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile) && (
                                            <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                                                !
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Main content area - two columns layout */}
                            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                                {/* Left Column: Suggestions or Skeleton or Empty State */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflowY: 'auto' }}>
                                    {isNodeRewriting && leafOrder.length === 0 ? (
                                        // Show skeleton while loading - with proper vertical spacing
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <LeafSkeletonGroup count={3} />
                                        </div>
                                    ) : leafOrder.length > 0 ? (
                                        // Show actual suggestions once loaded
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {leafOrder.map(leafId => {
                                                const entry = leafSuggestions[leafId];
                                                if (!entry) return null;
                                                const currentText = entry.editedText ?? ((entry.options && entry.options.length > 0 && entry.selectedIdx >= 0) ? entry.options[entry.selectedIdx] : entry.original);
                                                return (
                                                    <div key={leafId} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.4)" }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                            <button
                                                                onClick={() => rotateLeafPrev(leafId)}
                                                                disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                                                                title="Previous option"
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    borderRadius: 8,
                                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                                    background: 'rgba(255,255,255,0.8)',
                                                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                }}
                                                            >
                                                                ◀
                                                            </button>
                                                            <div style={{ fontSize: 12, color: '#555' }}>
                                                                {entry.options && entry.options.length > 0 ? `Option ${entry.selectedIdx + 1} / ${entry.options.length}` : 'No options'}
                                                            </div>
                                                            <button
                                                                onClick={() => rotateLeafNext(leafId)}
                                                                disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                                                                title="Next option"
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    borderRadius: 8,
                                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                                    background: 'rgba(255,255,255,0.8)',
                                                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                }}
                                                            >
                                                                ▶
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={currentText}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setLeafSuggestions(prev => ({ ...prev, [leafId]: { ...entry, editedText: val } }));
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                minHeight: 100,
                                                                padding: "12px",
                                                                borderRadius: "8px",
                                                                border: "1px solid rgba(0, 0, 0, 0.1)",
                                                                background: "rgba(255, 255, 255, 0.5)",
                                                                color: "#111827",
                                                                resize: 'vertical',
                                                                fontFamily: "inherit",
                                                                fontSize: "14px",
                                                                outline: "none",
                                                                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)"
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // Empty state: Before rewrite button clicked
                                        <div style={{
                                            padding: '32px 16px',
                                            textAlign: 'center',
                                            color: '#9ca3af',
                                            fontSize: 14,
                                            borderRadius: 12,
                                            background: 'rgba(0,0,0,0.02)',
                                            border: '1px dashed rgba(0,0,0,0.1)'
                                        }}>
                                            <div style={{ marginBottom: 8 }}>No suggestions yet</div>
                                            <div style={{ fontSize: 12, color: '#d1d5db' }}>
                                                Click the ↻ button to generate rewrite options
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Emotion Radar - DISABLED during loading */}
                                <div style={{
                                    width: 340,
                                    flexShrink: 0,
                                    paddingTop: 28,
                                    opacity: isNodeRewriting ? 0.5 : 1,
                                    pointerEvents: isNodeRewriting ? 'none' : 'auto',
                                    transition: 'opacity 0.2s ease'
                                }}>
                                    <div style={{ position: 'relative' }}>
                                        <EmotionRadar
                                            profile={subtreeEmotionProfile}
                                            onChange={isNodeRewriting ? undefined : (next) => {
                                                setSubtreeEmotionProfile(next);
                                                const legacy = deriveLegacyFromProfile(next);
                                                setSubtreeEmotion(legacy.emotion);
                                                setSubtreeIntensity(legacy.intensity);
                                            }}
                                            size={340}
                                            label="Subtree emotion profile"
                                        />
                                        {/* Disabled overlay during loading */}
                                        {isNodeRewriting && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: 340,
                                                height: 340,
                                                borderRadius: '50%',
                                                background: 'rgba(255, 255, 255, 0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                zIndex: 10
                                            }}>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                <button
                                    onClick={handleCancel}
                                    disabled={isNodeRewriting}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: 'rgba(0,0,0,0.05)',
                                        color: '#374151',
                                        border: 'none',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease'
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
                                {(() => {
                                    // Only allow saving if suggestions have been generated
                                    const suggestionsGenerated = leafOrder.length > 0;
                                    
                                    const hasTextChanges = Object.keys(leafSuggestions).some(k => {
                                        const e = leafSuggestions[k];
                                        const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                                        return chosen !== e.original;
                                    });
                                    
                                    // Only allow emotion changes if suggestions were actually generated
                                    const hasEmotionChanges = suggestionsGenerated && 
                                        JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile);
                                    return (hasTextChanges || hasEmotionChanges) && (
                                        <button
                                            onClick={() => {
                                                // ✅ LOG HERE - BEFORE save
                                                console.log('[CRITICAL] BEFORE applySubtreeChanges:');
                                                console.log('  Subtree ID:', id);
                                                console.log('  Leaf nodes being edited:', Object.keys(leafSuggestions).length);
                                                console.log('  Leaf IDs:', Object.keys(leafSuggestions).slice(0, 5), '...');
                                                const edits = {};
                                                let anyTextChanged = false;
                                                Object.keys(leafSuggestions).forEach(k => {
                                                    const e = leafSuggestions[k];
                                                    const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                                                    if (chosen && chosen.length > 0) {
                                                        edits[k] = chosen;
                                                        if (chosen !== e.original) anyTextChanged = true;
                                                    }
                                                });
                                                const finalProfile = anyTextChanged ? subtreeEmotionProfile : originalEmotionProfile;
                                                if (typeof data.applySubtreeChanges === 'function') {
                                                    data.applySubtreeChanges(id, normalizeEmotionProfile({ ...finalProfile }), edits);
                                                }
                                                setLeafSuggestions({});
                                                setLeafOrder([]);
                                                setIsDialogOpen(false);
                                            }}
                                            disabled={isNodeRewriting}
                                            style={{
                                                padding: "8px 20px",
                                                background: "#111827",
                                                color: "white",
                                                borderRadius: "12px",
                                                border: "none",
                                                cursor: "pointer",
                                                fontWeight: 500,
                                                fontSize: '14px',
                                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                                transition: 'all 0.2s ease'
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
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    ));
}