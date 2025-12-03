import {useEffect, useRef, useState, useMemo} from 'react';
import {TreeVisualization, HistoryGraph} from '../components';
import React from 'react';
import posthog from '../utils/posthog';
import {useNavigate} from 'react-router-dom';
import {buildTextFromSentences} from '../utils/treeParser';
import {applySentenceEdit} from '../utils/sentenceEditor';
import {updateDirtyNodes} from '../services/claude';
import {useUserIdentification} from '../hooks/useUserIdentification';
import {applyDirtySubtreeRestructure, createPlaceholderHierarchy} from '../utils/hierarchyIntegration';
import {hasDirtyNodes, clearDirtyFlags} from '../utils/dirtyTracking';

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
    useUserIdentification();
    const navigate = useNavigate();

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
    }, [sentences.length]); // Only trigger when sentence count changes

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
    const [bottomPct, setBottomPct] = useState(18);
    const verticalContainerRef = useRef(null);
    const topPanelRef = useRef(null); // Ref for the top panel
    const draggingVerticalRef = useRef(false);


    function addCommit(newSentences, title) {
        historyGraphRef.current?.addCommit(newSentences, title);
        prevTextRef.current = text;
    }

    const insertExample = () => {
        // Parse example text into sentences
        const newSentences = applySentenceEdit([], EXAMPLE_TEXT, 0);

        // Log event
        posthog.capture('example_inserted', {
            text_length: EXAMPLE_TEXT.length,
            sentence_count: newSentences.length,
        });

        setSentences(newSentences);
        addCommit(newSentences, "Example inserted");
    };

    const clearText = () => setSentences([]);

    // Handle AI hierarchy generation
    const handleGenerateHierarchy = async () => {
        if (sentences.length === 0) {
            alert('Please add some text first');
            return;
        }

        setIsGenerating(true);
        try {
            // At this point, placeholder hierarchy should already exist from slider change
            // (or from previous text edits). We just need to restructure dirty nodes.
            const sentencesToProcess = sentences;

            // Dirty update - restructure dirty portions only
            console.log('[App] Restructuring dirty portions of hierarchy');

            const hierarchyMeta = sentencesToProcess._hierarchyMeta;
            const dirtyNodeIds = hierarchyMeta.dirtyNodeIds || [];
            const dirtySentenceIds = hierarchyMeta.dirtySentenceIds || [];

            console.log('[App] Dirty nodes to restructure:', dirtyNodeIds.length);
            console.log('[App] Dirty sentences:', dirtySentenceIds.length);

            // Ask Claude to restructure dirty subtrees
            const {dirtyRootNodes, restructuredSubtrees, newRootTitle} = await updateDirtyNodes(
                sentencesToProcess,
                hierarchyMeta,
                dirtyNodeIds,
                dirtySentenceIds,
                maxDepth
            );

            // Apply the restructured subtrees to the existing hierarchy
            let updatedSentences = applyDirtySubtreeRestructure(sentencesToProcess, dirtyRootNodes, restructuredSubtrees, newRootTitle);

            // Clear dirty flags after successful update
            updatedSentences = clearDirtyFlags(updatedSentences);
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
    const handleTextChange = (e) => {
        const newText = e.target.value;
        const cursorPosition = e.target.selectionStart;

        console.log('[App] Text changed, cursor at:', cursorPosition);

        const textLengthChange = newText.length - text.length
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

    // Handle tree modifications (e.g., node edits, reordering, emotion changes)
    function handleTreeUpdate(updatedSentences) {
        console.log('[App] Tree updated, updating sentences:', updatedSentences.length);
        posthog.capture('tree_updated', {
            sentence_count: updatedSentences.length,
        });

        setSentences(updatedSentences);
        addCommit(updatedSentences, 'Tree updated');
    }

    const handleRevertComplete = (revertedData) => {
        setSentences(revertedData);
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
        window.addEventListener('touchmove', handleTouchMove, {passive: false});
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
        addCommit(sentences, "Text edited");
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Main Header - Full Width */}
            <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between"
                 style={{zIndex: 100001}}>
                <h1 className="text-xl font-bold text-gray-900">Vibe Editor</h1>
                <div className="flex items-center gap-4">
                    {/* Depth Slider */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                        <label htmlFor="depth-slider" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Depth: {maxDepth}
                        </label>
                        <input
                            id="depth-slider"
                            type="range"
                            min="3"
                            max="6"
                            value={maxDepth}
                            onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                            className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>

                    {/* Generate Hierarchy Button */}
                    <button
                        onClick={handleGenerateHierarchy}
                        disabled={isGenerating || sentences.length === 0 || hierarchyState === 'generated'}
                        className="px-4 py-2 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none"
                                     viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                            strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {hierarchyState === 'has-dirty-nodes' ? 'Updating...' : 'Generating...'}
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                </svg>
                                {hierarchyState === 'has-dirty-nodes' ? 'Update Dirty Nodes' : 'Generate Hierarchy'}
                            </>
                        )}
                    </button>

                    <button
                        onClick={insertExample}
                        className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Insert example
                    </button>
                    <button
                        onClick={clearText}
                        className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => navigate('/stats')}
                        className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                        title="View analytics"
                    >
                        📊 Stats
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div
                ref={horizontalContainerRef}
                className="flex flex-col h-screen select-none"
                style={{userSelect: draggingHorizontalRef.current || draggingVerticalRef.current ? 'none' : undefined}}
            >
                <div
                    ref={topPanelRef}
                    className="flex-1 flex"
                    style={{flexBasis: `${100 - bottomPct}%`, minHeight: 0}}
                >
                    {/* Left Pane (Text Editor) */}
                    <div
                        className="flex flex-col"
                        style={{
                            flexBasis: `${leftPct}%`,
                            minWidth: 0,
                        }}
                    >
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleTextChange}
                        onBlur={handleTextOnBlur}
                        className="flex-1 p-6 bg-white resize-none focus:outline-none text-gray-800 text-base leading-relaxed"
                        placeholder="Enter your text here..."
                        style={{
                            fontFamily:
                                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
                        }}
                    />
                    </div>

                    {/* Draggable Divider */}
                    <VerticalDividerHandle
                        onMouseDown={onHorizontalHandleMouseDown}
                        onTouchStart={onHorizontalHandleMouseDown}
                    />

                    {/* Right Pane (Canvas) */}
                    <div
                        className="flex flex-col"
                        style={{flexBasis: `${100 - leftPct}%`, minWidth: 0}}
                    >
                        <div
                            id="graph-pane"
                            className="flex-1 relative overflow-hidden"
                        >
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
                    style={{flexBasis: `${bottomPct}%`, minHeight: 0}}
                >
                    <div className="p-3 h-full">
                        <HistoryGraph ref={historyGraphRef} onRevertComplete={handleRevertComplete}/>
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
                style={{width: '2px', margin: '0 auto'}}
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
                style={{height: '2px', margin: 'auto 0'}}
            />
        </button>
    );
}
