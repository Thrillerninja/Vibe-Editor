import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { TreeVisualization, HistoryGraph } from '../components';
import DiffView from '../components/HistoryGraph/DiffView';
import React from 'react';
import posthog from '../utils/posthog';
import { useNavigate } from 'react-router-dom';
import { buildTextFromSentences } from '../utils/treeParser';
import { updateDirtyNodes, evaluateSentenceEmotions } from '../services/claude';
import { useUserIdentification } from '../hooks/useUserIdentification';
import { applyDirtySubtreeRestructure, createPlaceholderHierarchy } from '../utils/hierarchyIntegration';
import { EMOTIONS, EMOTION_COLORS, EMOTION_LABELS } from '../utils/constants';
import { hasDirtyNodes, clearDirtyFlags } from '../utils/dirtyTracking';
import LogoMenu from '../components/LogoMenu/LogoMenu';
import RichTextEditor from '../components/RichTextEditor/RichTextEditor';
import { applySentenceEdit } from '../utils/sentenceEditor';

const EXAMPLE_TEXT =
    'Climate change poses significant challenges to global food security. ' +
    'Rising temperatures and changing precipitation patterns affect crop yields.\n' +
    'Developing drought-resistant crops is one solution. ' +
    'International cooperation on climate policy is essential.\n\n' +
    'Agricultural innovation is crucial for adaptation. ' +
    'Scientists are developing new crop varieties. ' +
    'These innovations may help farmers cope with climate extremes.';

export default function Editor() {
    const historyGraphRef = useRef(null);
    const initialCommitAdded = useRef(false);
    useUserIdentification();

    // SSOT: Store sentences as the primary data structure
    const [sentences, setSentences] = useState([]);

    // Derived state: text is built from sentences
    const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);
    const prevTextRef = useRef(text);

    // AI hierarchy depth control (3-6 levels)
    const [maxDepth, setMaxDepth] = useState(3);
    const [isGenerating, setIsGenerating] = useState(false);
    const [hierarchyState, setHierarchyState] = useState('none'); // 'none', 'generated', 'needs-full-regen', 'has-dirty-nodes'

    // When maxDepth changes, create placeholder hierarchy (even before initial generation)
    useEffect(() => {
        if (sentences.length > 0) {
            // If no hierarchy exists yet, create placeholders when depth changes
            if (!sentences._hierarchyMeta) {
                console.log('[App] Depth changed before initial generation - creating placeholder hierarchy');
                console.log('[App]   Depth:', maxDepth);

                const updated = createPlaceholderHierarchy(sentences, maxDepth);
                setSentences(updated);
                setHierarchyState('has-dirty-nodes');
            }
            // If hierarchy exists and depth changed, recreate placeholders
            else {
                const hierarchyMaxLevel = sentences._hierarchyMeta.maxLevel;
                // Check if depth changed
                // hierarchyMaxLevel is the highest grouping level (e.g., 2 for depth 3)
                // So maxDepth should equal hierarchyMaxLevel + 1
                if (hierarchyMaxLevel !== maxDepth - 1) {
                    console.log('[App] Depth changed - creating placeholder hierarchy with dirty nodes');
                    console.log('[App]   Old depth:', hierarchyMaxLevel + 1, 'New depth:', maxDepth);

                    // Create placeholder hierarchy with all nodes marked as dirty
                    // This triggers the same dirty-update logic as editing text
                    const updated = createPlaceholderHierarchy(sentences, maxDepth);
                    setSentences(updated);
                    setHierarchyState('has-dirty-nodes');
                }
            }
        }
    }, [maxDepth]); // Only depend on maxDepth to avoid loops

    // Create placeholder hierarchy when text is added but no hierarchy exists
    useEffect(() => {
        if (sentences.length > 0 && !sentences._hierarchyMeta) {
            console.log('[App] Text added without hierarchy - creating placeholder hierarchy at depth', maxDepth);
            const updated = createPlaceholderHierarchy(sentences, maxDepth);
            setSentences(updated);
            setHierarchyState('has-dirty-nodes');
        }
    }, [sentences.length, maxDepth]); // Only depend on length and maxDepth, not _hierarchyMeta

    // Add initial commit on mount
    useEffect(() => {
        if (!initialCommitAdded.current && historyGraphRef.current) {
            historyGraphRef.current.addCommit([], "Initial state");
            initialCommitAdded.current = true;
        }
    }, []);

    // Update hierarchy state based on current sentences
    useEffect(() => {
        if (sentences.length === 0) {
            setHierarchyState('none');
        } else if (!sentences._hierarchyMeta) {
            if (hierarchyState === 'generated' || hierarchyState === 'has-dirty-nodes') {
                // Had hierarchy but now it's gone - needs full regen
                setHierarchyState('needs-full-regen');
            } else {
                setHierarchyState('none');
            }
        } else if (hasDirtyNodes(sentences)) {
            setHierarchyState('has-dirty-nodes');
        } else {
            setHierarchyState('generated');
        }
    }, [sentences]);

    // Split state for horizontal divider
    const [leftPct, setLeftPct] = useState(50);
    const horizontalContainerRef = useRef(null);
    const draggingHorizontalRef = useRef(false);
    const textareaRef = useRef(null);

    // Split state for vertical divider
    const [bottomPct, setBottomPct] = useState(12);
    const verticalContainerRef = useRef(null);
    const topPanelRef = useRef(null); // Ref for the top panel
    const draggingVerticalRef = useRef(false);


    const addCommit = useCallback((newSentences, title, options = {}) => {
        historyGraphRef.current?.addCommit(newSentences, title, options);
        prevTextRef.current = text;
    }, [text]);

    const insertExample = () => {
        // Parse example text into sentences
        let newSentences = applySentenceEdit([], EXAMPLE_TEXT, 0);

        // Create placeholder hierarchy immediately before committing
        newSentences = createPlaceholderHierarchy(newSentences, maxDepth);
        setHierarchyState('has-dirty-nodes');

        // Log event
        posthog.capture('example_inserted', {
            text_length: EXAMPLE_TEXT.length,
            sentence_count: newSentences.length,
        });
        setSentences(newSentences);
        addCommit(newSentences, 'Example inserted');
    };

    const clearText = () => {
        setSentences([]);
        addCommit([], 'Text cleared');
    }

    // Handle AI hierarchy generation
    const handleGenerateHierarchy = async () => {
        if (sentences.length === 0) {
            alert('Please add some text first');
            return;
        }

        setIsGenerating(true);
        try {
            // Ensure placeholder hierarchy exists; if not, create it and mark all dirty
            let sentencesToProcess = sentences;
            if (!sentencesToProcess._hierarchyMeta) {
                sentencesToProcess = createPlaceholderHierarchy(sentencesToProcess, maxDepth);
                setSentences(sentencesToProcess);
                setHierarchyState('has-dirty-nodes');
            }

            // Dirty update - restructure dirty portions only
            console.log('[App] Restructuring dirty portions of hierarchy');

            const hierarchyMeta = sentencesToProcess._hierarchyMeta;
            const dirtyNodeIds = hierarchyMeta.dirtyNodeIds || [];
            const dirtySentenceIds = hierarchyMeta.dirtySentenceIds || [];

            console.log('[App] Dirty nodes to restructure:', dirtyNodeIds.length);
            console.log('[App] Dirty sentences:', dirtySentenceIds.length);

            // Ask Claude to restructure dirty subtrees. this contains emotion stuff for hierarchy nodes
            const { dirtyRootNodes, restructuredSubtrees, newRootTitle, newRootEmotion, newRootIntensity, newRootEmotions } = await updateDirtyNodes(
                sentencesToProcess,
                hierarchyMeta,
                dirtyNodeIds,
                dirtySentenceIds,
                maxDepth
            );

            // Apply the restructured subtrees to the existing hierarchy
            let updatedSentences = applyDirtySubtreeRestructure(sentencesToProcess, dirtyRootNodes, restructuredSubtrees, newRootTitle, newRootEmotion, newRootIntensity, newRootEmotions);
            console.log('[TEST0] Updated sentences before applying dirty subtree emotions:', updatedSentences);
            await evaluateSentenceEmotions(updatedSentences).then(result => {
                updatedSentences = result;
            });
            console.log('[TEST1] Updated sentences after applying dirty subtree emotions:', updatedSentences);
            // Clear dirty flags after successful update
            updatedSentences = clearDirtyFlags(updatedSentences);
            console.log('[TEST2] Cleared dirty flags after successful restructure', updatedSentences);

            setSentences(updatedSentences);
            addCommit(updatedSentences, 'Hierarchy regenerated');
            console.log('[App] Dirty subtrees restructured, clean portions preserved');
            setHierarchyState('generated');
        } catch (error) {
            console.error('[App] Error generating hierarchy:', error);
            alert('Failed to generate hierarchy: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Handle text input changes from textarea - DIRECT EDITING
    const handleTextChange = (newText, cursorPosition) => {
        console.log('[App] Text changed, cursor at:', cursorPosition);

        const textLengthChange = newText.length - text.length;

        posthog.capture('text_edited', {
            text_length_change: textLengthChange,
            total_text_length: newText.length,
            cursor_position: cursorPosition,
            operation: textLengthChange > 0 ? 'insert' : 'delete',
        });

        // Apply edit directly to sentence array
        const updatedSentences = applySentenceEdit(sentences, newText, cursorPosition);
        setSentences(updatedSentences);
    };

  const handleTextBlur = () => {
    // Ensure hierarchy exists if text was edited
    if (sentences.length > 0 && !sentences._hierarchyMeta) {
      const updated = createPlaceholderHierarchy(sentences, maxDepth);
      setSentences(updated);
    }
  };

    // Handle tree modifications (e.g., node edits, reordering, emotion changes)
    const handleTreeUpdate = useCallback((updatedSentences) => {
        console.log('[App] Tree updated, updating sentences:', updatedSentences);
        posthog.capture('tree_updated', {
            sentence_count: updatedSentences.length,
        });

        setSentences(updatedSentences);
        addCommit(updatedSentences, 'Tree updated');
    }, [addCommit]);

    const handleRevertComplete = (revertedData) => {
        // Restore sentences exactly as stored in the commit snapshot
        const meta = revertedData._hierarchyMeta;
        let updated = revertedData.map(s => ({ ...s }));

        if (meta) {
            // Preserve the commit's hierarchy metadata without forcing dirty flags
            updated._hierarchyMeta = { ...meta };
            // Restore depth from metadata for the UI controls
            if (meta.maxLevel != null) {
                const restoredDepth = meta.maxLevel + 1;
                setMaxDepth(restoredDepth);
            }
            // Let the existing effect determine hierarchyState from sentences
        } else {
            // No hierarchy present; rely on effect to set state to 'none'
        }

        setSentences(updated);
    };

    // Handle horizontal drag start
    const onHorizontalHandleMouseDown = (e) => {
        e.preventDefault();
        draggingHorizontalRef.current = true;
    };

    // Handle vertical drag start
    const onVerticalHandleMouseDown = (e) => {
        e.preventDefault();
        draggingVerticalRef.current = true;
    };

    useEffect(() => {
        // Track load time
        if (window.performance && window.performance.timing) {
            const perf = window.performance.timing;
            const pageLoadTime = perf.loadEventEnd - perf.navigationStart;

            posthog.capture('page_load_time', {
                load_time_ms: pageLoadTime,
            });
        }
    }, []);

    // Global move/up handlers
    useEffect(() => {
        const onMove = (clientX, clientY) => {
            if (draggingHorizontalRef.current && horizontalContainerRef.current) {
                const rect = horizontalContainerRef.current.getBoundingClientRect();
                const x = Math.min(Math.max(clientX, rect.left), rect.right);
                const pct = ((x - rect.left) / rect.width) * 100;
                const clamped = Math.min(80, Math.max(20, pct));
                setLeftPct(clamped);
            }
            if (draggingVerticalRef.current && verticalContainerRef.current && topPanelRef.current) {
                const rect = verticalContainerRef.current.parentElement.getBoundingClientRect();
                const y = Math.min(Math.max(clientY, rect.top), rect.bottom);
                const pct = ((rect.bottom - y) / rect.height) * 100;
                const clamped = Math.min(80, Math.max(5, pct));
                verticalContainerRef.current.style.flexBasis = `${clamped}%`;
                topPanelRef.current.style.flexBasis = `${100 - clamped}%`;
            }
        };

        const handleMouseMove = (e) => onMove(e.clientX, e.clientY);
        const handleTouchMove = (e) => {
            if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
        };
        const endDrag = () => {
            if (draggingVerticalRef.current && verticalContainerRef.current) {
                const newBottomPct = parseFloat(verticalContainerRef.current.style.flexBasis);
                if (!isNaN(newBottomPct)) {
                    setBottomPct(newBottomPct);
                }

            }
            draggingHorizontalRef.current = false;
            draggingVerticalRef.current = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', endDrag);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', endDrag);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', endDrag);
        };
    }, []);

    function handleTextOnBlur(e) {
        const value = e.target.value;
        if (value === prevTextRef.current) return; // No change

        // Ensure hierarchy exists, mark dirty, but do not auto-commit
        if (sentences.length > 0 && !sentences._hierarchyMeta) {
            const updated = createPlaceholderHierarchy(sentences, maxDepth);
            setSentences(updated);
            setHierarchyState('has-dirty-nodes');
        }
    }

    const handleCommitComplete = (committedSentences) => {
        setSentences(committedSentences);
    }

    const floatingButtonStyle = {
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        border: 'none',
        cursor: 'pointer',
        zIndex: 50,
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <LogoMenu maxDepth={maxDepth} setMaxDepth={setMaxDepth} />

            {/* Main Content Area */}
            <div
                ref={horizontalContainerRef}
                className="flex flex-col h-screen select-none"
                style={{ userSelect: draggingHorizontalRef.current || draggingVerticalRef.current ? 'none' : undefined }}
            >
                <div
                    ref={topPanelRef}
                    className="flex-1 flex"
                    style={{ flexBasis: `${100 - bottomPct}%`, minHeight: 0 }}
                >
                    {/* Left Pane (Text Editor) */}
                    <div
                        className="flex flex-col relative"
                        style={{
                            flexBasis: `${leftPct}%`,
                            minWidth: 0,
                        }}
                    >
                        <RichTextEditor
                            value={text}
                            onChange={handleTextChange}
                            onBlur={handleTextBlur}
                            placeholder="Enter your text here..."
                            hierarchyState={hierarchyState}
                            sentences={sentences}
                            />
                        {/* Floating Buttons for Left Pane */}
                        {/* <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px', zIndex: 50 }}>
                            <button
                                onClick={insertExample}
                                title="Insert example"
                                style={{
                                    ...floatingButtonStyle,
                                    position: 'relative',
                                    backgroundColor: '#000',
                                    color: 'white',
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="12" y1="18" x2="12" y2="12" />
                                    <line x1="9" y1="15" x2="15" y2="15" />
                                </svg>
                            </button>
                            <button
                                onClick={clearText}
                                title="Clear text"
                                style={{
                                    ...floatingButtonStyle,
                                    position: 'relative',
                                    backgroundColor: '#000',
                                    color: 'white',
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                            <button
                                onClick={openCommitPreview}
                                title="Commit changes"
                                style={{
                                    ...floatingButtonStyle,
                                    position: 'relative',
                                    backgroundColor: '#000',
                                    color: 'white',
                                }}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>
                        </div> */}

                        {/* <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={handleTextChange}
                            onBlur={handleTextOnBlur}
                            className="flex-1 p-6 pt-20 bg-white resize-none focus:outline-none text-gray-800 text-base leading-relaxed"
                            placeholder="Enter your text here..."
                            style={{
                                fontFamily:
                                    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
                            }}
                        /> */}
                        {isCommitPreviewOpen && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-black opacity-40" onClick={cancelCommitPreview} />
                                <div className="relative bg-white rounded-lg shadow-lg max-w-xl w-full max-h-[80vh] flex flex-col">
                                    <div className="p-4 border-b border-gray-200">
                                        <div className="text-sm font-semibold text-gray-900">Commit preview</div>
                                        <div className="text-xs text-gray-600 mt-1">Review changes before committing</div>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4">
                                        <span className="text-xs text-gray-500">Changes since last commit:</span>
                                        <div className="mt-2">
                                            <DiffView diff={commitDiff} />
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                                        <button onClick={cancelCommitPreview}
                                            className="px-3 py-1.5 rounded-md text-sm bg-gray-100 text-gray-800 hover:bg-gray-200">Cancel</button>
                                        <button onClick={confirmCommit}
                                            className="px-3 py-1.5 rounded-md text-sm bg-black text-white hover:bg-gray-800">Commit</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Draggable Divider */}
                    <VerticalDividerHandle
                        onMouseDown={onHorizontalHandleMouseDown}
                        onTouchStart={onHorizontalHandleMouseDown}
                    />

                    {/* Right Pane (Canvas) */}
                    <div
                        className="flex flex-col"
                        style={{ flexBasis: `${100 - leftPct}%`, minWidth: 0 }}
                    >
                        <div
                            id="graph-pane"
                            className="flex-1 relative overflow-hidden"
                        >
                            {/* Floating Buttons for Right Pane */}
                            <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px', zIndex: 50 }}>
                                <button
                                    onClick={handleGenerateHierarchy}
                                    disabled={isGenerating || sentences.length === 0 || hierarchyState === 'generated'}
                                    title={hierarchyState === 'has-dirty-nodes' ? 'Update Dirty Nodes' : 'Generate Hierarchy'}
                                    style={{
                                        ...floatingButtonStyle,
                                        backgroundColor: isGenerating || sentences.length === 0 || hierarchyState === 'generated' ? '#555' : '#000',
                                        color: 'white',
                                        cursor: isGenerating || sentences.length === 0 || hierarchyState === 'generated' ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isGenerating ? (
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Emotion Legend - top-left */}
                            <div
                                aria-label="Emotion legend"
                                style={{
                                    position: 'absolute',
                                    top: '12px',
                                    left: '12px',
                                    background: 'rgba(255,255,255,0.95)',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                                    padding: '10px 12px',
                                    zIndex: 50,
                                    fontSize: '13px',
                                    color: '#111827',
                                    maxWidth: '260px',
                                    backdropFilter: 'saturate(180%) blur(4px)'
                                }}
                            >
                                <div style={{ fontWeight: 600, marginBottom: 8 }}>DES Emotions Legend</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 8 }}>
                                    {[
                                        EMOTIONS.INTEREST,
                                        EMOTIONS.JOY,
                                        EMOTIONS.SURPRISE,
                                        EMOTIONS.SADNESS,
                                        EMOTIONS.ANGER,
                                        EMOTIONS.DISGUST,
                                        EMOTIONS.CONTEMPT,
                                        EMOTIONS.FEAR,
                                        EMOTIONS.SHAME,
                                        EMOTIONS.GUILT,
                                    ].map((key) => {
                                        const swatch = EMOTION_COLORS[key]?.medium || '#e5e7eb';
                                        const label = EMOTION_LABELS[key] || key;
                                        return (
                                            <React.Fragment key={key}>
                                                <span
                                                    aria-hidden
                                                    style={{
                                                        display: 'inline-block',
                                                        width: 14,
                                                        height: 14,
                                                        borderRadius: 4,
                                                        background: swatch,
                                                        border: '1px solid rgba(0,0,0,0.1)',
                                                        marginTop: 2,
                                                    }}
                                                />
                                                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>

                            <TreeVisualization
                                sentences={sentences}
                                onTreeUpdate={handleTreeUpdate}
                            />
                        </div>
                    </div>
                </div>
                <HorizontalDividerHandle
                    onMouseDown={onVerticalHandleMouseDown}
                    onTouchStart={onVerticalHandleMouseDown}
                />
                <div
                    ref={verticalContainerRef}
                    className="bg-white bottom-pane"
                    style={{ flexBasis: `${bottomPct}%`, minHeight: 0 }}
                >
                    <div className="pt-3 pr-3 pl-3 h-full">
                        <HistoryGraph
                            ref={historyGraphRef}
                            sentences={sentences}
                            onRevertComplete={handleRevertComplete}
                            onCommitComplete={handleCommitComplete}
                        />
                    </div>
                </div>


            </div>
        </div>
    );
}

// A11y-friendly divider with mouse, touch, and keyboard support
function VerticalDividerHandle({
    onMouseDown,
    onTouchStart,
}) {
    return (
        <button
            aria-label="Resize panels"
            title="Drag to resize"
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            className="relative group"
            style={{
                // Wider hit area for usability; visible 2px line in center
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
        </button>
    );
}

function HorizontalDividerHandle({
    onMouseDown,
    onTouchStart,
}) {
    return (
        <button
            aria-label="Resize panels"
            title="Drag to resize"
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            className="relative group"
            style={{
                height: '6px',
                cursor: 'row-resize',
                background: 'white',
                border: 'none',
                padding: 0,
            }}
        >
            {/* Visible center line */}
            <span
                aria-hidden
                className="block w-full bg-gray-300 group-hover:bg-gray-400"
                style={{ height: '2px', margin: 'auto 0' }}
            />
        </button>
    );
}
