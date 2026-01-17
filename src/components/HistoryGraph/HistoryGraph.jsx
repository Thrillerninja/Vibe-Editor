/**
 * @fileoverview HistoryGraph Component - Git-style history visualization for node-based documents
 *
 * Manages document history, commits, reverts, and diffs using the node tree system.
 *
 * PROPS:
 * - nodeMap: Map<string, Node> - current document nodes
 * - rootId: string - root node ID
 * - onRevertComplete({nodeMap, rootId}): callback when revert is confirmed
 * - onCommitComplete(nodeMap): callback when commit is completed
 * - className: optional container class
 *
 * INTERNAL STATE:
 * - history: array of commit entries with snapshots
 * - headIndex: current position in history
 * - redoStack: indices for redo functionality
 *
 * @typedef {import('../../types/node').Node} Node
 */

import React, {
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react';
import DiffView from './DiffView';
import { isGroupNode, isContentNode } from '../../types/node';
import { getContentNodesInDocumentOrder } from '@utils/nodeHelpers';

/**
 * @typedef {Object} CommitEntry
 * @property {number} id - Unique commit ID
 * @property {number} ts - Timestamp (ms)
 * @property {Map<string, Node>} nodeMap - Snapshot of node map
 * @property {string} rootId - Root node ID at time of commit
 * @property {string} title - Commit message
 * @property {number | null} parentId - Parent commit ID
 * @property {number} branchId - Branch identifier
 * @property {boolean} [isManual] - Whether manually created
 */

/**
 * @typedef {Object} TooltipState
 * @property {boolean} visible
 * @property {number} x
 * @property {number} y
 * @property {Object | null} node
 */

/**
 * HistoryGraph - Git-style history visualization for node documents
 * Manages commits, reverts, undo/redo with visual graph
 *
 * @param {Object} props
 * @param {string} props.rootId - Root node ID
 * @param {Map<string, Node>} props.nodeMap - Current document nodes
 * @param {string} [props.className='history-graph'] - Container class
 * @param {(snapshot: {nodeMap: Map<string, Node>, rootId: string}) => void} [props.onRevertComplete]
 * @param {(nodeMap: Map<string, Node>) => void} [props.onCommitComplete]
 * @param {React.Ref} ref - Imperative handle for addCommit
 * @returns {React.ReactElement}
 */

// Responsive git-style history graph.
// Props:
// - className: optional container class
// - onRevertComplete(data): function(data) called when a revert is confirmed
const HistoryGraph = forwardRef(
  (
    {
      className = 'history-graph',
      rootId,
      nodeMap,
      onRevertComplete = () => { },
      onCommitComplete = () => { },
    },
    ref
  ) => {
    /** @type {React.MutableRefObject<HTMLDivElement>} */
    const rootRef = useRef(null);

    /**
     * @type {[Array<CommitEntry>, Function]}
     */
    const [history, setHistory] = useState([]);

    /**
     * Current position in history (index into history array)
     * @type {[number | null, Function]}
     */
    const [headIndex, setHeadIndex] = useState(null);

    /**
     * Pending revert: index of commit to revert to
     * @type {[number | null, Function]}
     */
    const [pendingRevert, setPendingRevert] = useState(null);

    /**
     * Redo stack: array of indices that were undone
     * @type {[number[], Function]}
     */
    const [redoStack, setRedoStack] = useState([]);

    /**
     * Commit preview modal state
     * @type {[boolean, Function]}
     */
    const [isCommitPreviewOpen, setIsCommitPreviewOpen] = useState(false);

    /**
     * Commit title for manual commits
     * @type {[string, Function]}
     */
    const [commitTitle, setCommitTitle] = useState('');

    /**
     * Tooltip state
     * @type {[TooltipState, Function]}
     */
    const [tooltip, setTooltip] = useState({
      visible: false,
      x: 0,
      y: 0,
      node: null,
    });

    /**
     * Container width for responsive layout
     * @type {[number, Function]}
     */
    const [containerWidth, setContainerWidth] = useState(0);

    /**
     * SVG ref for measurements
     * @type {React.MutableRefObject<SVGSVGElement>}
     */
    const svgRef = useRef(null);

    /**
     * Scrollable container ref
     * @type {React.MutableRefObject<HTMLDivElement>}
     */
    const scrollContainerRef = useRef(null);


    // =========================================================================
    // HELPERS: Node Map Cloning & Diffing
    // =========================================================================

    /**
     * Deep clone a node map
     * @param {Map<string, Node>} map
     * @returns {Map<string, Node>}
     */
    function cloneNodeMap(map) {
      const cloned = new Map();
      map.forEach((node, id) => {
        cloned.set(id, deepCloneNode(node));
      });
      return cloned;
    }

    /**
     * Deep clone a single node
     * @param {Node} node
     * @returns {Node}
     */
    function deepCloneNode(node) {
      return {
        id: node.id,
        type: node.type,
        content: node.content,
        hierarchy: {
          level: node.hierarchy.level,
          parentId: node.hierarchy.parentId,
          childIds: [...node.hierarchy.childIds],
          role: node.hierarchy.role,
        },
        structure: node.structure ? { ...node.structure } : undefined,
        formatting: node.formatting ? [...node.formatting] : undefined,
        textRep: node.textRep ? { ...node.textRep } : undefined,
        emotion: node.emotion
          ? {
            profile: { ...node.emotion.profile },
            dominantEmotion: node.emotion.dominantEmotion,
            dominantIntensity: node.emotion.dominantIntensity,
            source: node.emotion.source,
            timestamp: node.emotion.timestamp,
          }
          : undefined,
        metadata: {
          isDirty: node.metadata.isDirty,
          createdAt: node.metadata.createdAt,
          modifiedAt: node.metadata.modifiedAt,
          modifiedBy: node.metadata.modifiedBy,
          committedAt: node.metadata.committedAt,
          version: node.metadata.version,
        },
      };
    }

    /**
     * Check if there are changes between two node maps
     * @param {Map<string, Node>} oldMap
     * @param {Map<string, Node>} newMap
     * @returns {boolean}
     */
    function hasChanges(oldMap, newMap) {
      if (oldMap.size !== newMap.size) return true;

      for (const [id, oldNode] of oldMap) {
        const newNode = newMap.get(id);
        if (!newNode) return true;

        // Check if content changed
        if (oldNode.content !== newNode.content) return true;

        // Check if hierarchy changed
        if (oldNode.hierarchy.parentId !== newNode.hierarchy.parentId)
          return true;
        if (oldNode.hierarchy.childIds.length !== newNode.hierarchy.childIds.length)
          return true;
        if (
          !oldNode.hierarchy.childIds.every(
            (id, i) => id === newNode.hierarchy.childIds[i]
          )
        )
          return true;

        // Check if emotions changed
        if (
          JSON.stringify(oldNode.emotion?.profile) !==
          JSON.stringify(newNode.emotion?.profile)
        )
          return true;
      }

      return false;
    }

    /**
     * Compute text-based diff between two node maps
     * Reconstructs text from nodes and shows line-by-line changes
     *
     * @param {Map<string, Node>} oldMap
     * @param {Map<string, Node>} newMap
     * @returns {Array<{type: 'added'|'removed'|'unchanged'|'skip', content: string, count?: number}>}
     */
    function computeTextDiff(oldMap, newMap) {
      const oldText = reconstructTextFromNodes(oldMap);
      const newText = reconstructTextFromNodes(newMap);

      // Split into lines for comparison
      const oldLines = oldText.split('\n').map(line => line.trim()).filter(Boolean);
      const newLines = newText.split('\n').map(line => line.trim()).filter(Boolean);

      // Simple Myers diff algorithm
      return simpleLineDiff(oldLines, newLines);
    }

    /**
     * Reconstruct plain text from node map
     * @param {Map<string, Node>} nodeMap
     * @returns {string}
     */
    function reconstructTextFromNodes(nodeMap) {
      const root = Array.from(nodeMap.values()).find(n => n.hierarchy.role === 'root');
      if (!root) return '';

      const contentNodes = getContentNodesInDocumentOrder(nodeMap, root.id);
      return contentNodes.map(n => n.content).join(' ');
    }

    /**
     * Simple line-by-line diff using longest common subsequence
     * @param {string[]} oldLines
     * @param {string[]} newLines
     * @returns {Array<{type: string, content: string, count?: number}>}
     */
    function simpleLineDiff(oldLines, newLines) {
      const result = [];
      let oldIdx = 0;
      let newIdx = 0;
      let skipCount = 0;

      while (oldIdx < oldLines.length || newIdx < newLines.length) {
        if (oldIdx < oldLines.length && newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
          // Unchanged line
          if (skipCount > 0 && skipCount < 3) {
            // Show skip indicator if there are 3+ unchanged lines
            if (skipCount > 2) {
              result.push({ type: 'skip', count: skipCount });
            }
            skipCount = 0;
          }

          skipCount++;
          if (skipCount > 2) {
            if (result[result.length - 1]?.type !== 'skip') {
              result.push({ type: 'skip', count: skipCount - 1 });
            }
          } else {
            result.push({ type: 'unchanged', content: oldLines[oldIdx] });
          }

          oldIdx++;
          newIdx++;
        } else if (newIdx >= newLines.length || (oldIdx < oldLines.length && oldLines[oldIdx] !== newLines[newIdx])) {
          // Removed line
          skipCount = 0;
          result.push({ type: 'removed', content: oldLines[oldIdx] });
          oldIdx++;
        } else {
          // Added line
          skipCount = 0;
          result.push({ type: 'added', content: newLines[newIdx] });
          newIdx++;
        }
      }

      return result;
    }

    /**
     * Compute diff between current state and history
     */
    const commitDiff = useMemo(() => {
      const oldNodeMap =
        headIndex !== null && history[headIndex]
          ? history[headIndex].nodeMap
          : new Map();
      return computeTextDiff(oldNodeMap, nodeMap);
    }, [nodeMap, headIndex, history]);

    // =========================================================================
    // COMMIT OPERATIONS
    // =========================================================================

    /**
     * Add a commit to history
     * Creates a new branch if headIndex is not the latest commit
     *
     * @param {{nodeMap: Map<string, Node>, rootId: string}} data - Document snapshot
     * @param {string} title - Commit message
     * @param {Object} [options={}] - Additional options
     * @param {boolean} [options.isManual=false] - Whether manually created
     * @returns {void}
     */
    const addCommit = (data, title, options = {}) => {
      const { isManual = false } = options;
      const id = history.length;
      const ts = Date.now();

      // Deep clone the node map to ensure independence
      const clonedNodeMap = cloneNodeMap(data.nodeMap);

      setHistory(h => {
        let parentId = null;
        let branchId = 0;

        if (h.length === 0) {
          // First commit
          const newCommit = {
            id,
            ts,
            nodeMap: clonedNodeMap,
            rootId: data.rootId,
            title,
            parentId,
            branchId,
            isManual,
          };
          setHeadIndex(0);
          return [newCommit];
        }

        // Determine parent and branch
        branchId = h[headIndex]?.branchId ?? 0;
        parentId = h[headIndex]?.id ?? null;

        // Check if parent has other children (branching)
        const parentHasOtherChildren = h.some(
          (item, idx) => idx !== headIndex && item.parentId === parentId
        );

        if (parentHasOtherChildren) {
          // Create a new branch
          branchId = Math.max(...h.map(c => c.branchId), 0) + 1;
        }

        // Add commit
        const newCommit = {
          id,
          ts,
          nodeMap: clonedNodeMap,
          rootId: data.rootId,
          title,
          parentId,
          branchId,
          isManual,
        };

        const newHistory = [...h, newCommit];
        setHeadIndex(newHistory.length - 1);
        setRedoStack([]);
        return newHistory;
      });
    };

    /**
     * Expose addCommit via imperative handle
     */
    useImperativeHandle(ref, () => ({ addCommit }));


    // =========================================================================
    // REVERT OPERATIONS
    // =========================================================================

    /**
     * Initiate revert to a specific commit
     * @param {number} index - History index to revert to
     * @returns {void}
     */
    const handleRevert = index => {
      if (typeof index !== 'number') return;
      if (index === headIndex) return;

      const entry = history[index];
      if (!entry) return;

      setPendingRevert(index);
    };

    /** 
     * Confirm and perform the revert (called by the modal)
     * @returns {void}
     */
    const confirmRevert = () => {
      const index = pendingRevert;
      if (typeof index !== 'number') return setPendingRevert(null);

      const entry = history[index];
      if (!entry) return setPendingRevert(null);

      // Deep clone the data when reverting to ensure the reverted state is independent
      const clonedNodeMap = cloneNodeMap(entry.nodeMap);

      onRevertComplete({
        nodeMap: clonedNodeMap,
        rootId: entry.rootId,
      });
      setHeadIndex(index);
      setPendingRevert(null);
    };

    /**
     * Cancel pending revert
     * @returns {void}
     */
    const cancelRevert = () => setPendingRevert(null);

    // =========================================================================
    // UNDO/REDO OPERATIONS
    // =========================================================================

    /**
     * Move to parent commit in history
     * @returns {void}
     */
    const handleUndo = () => {
      if (headIndex === null) return;

      const currentCommit = history[headIndex];
      if (!currentCommit || currentCommit.parentId === null) return;

      const parentIndex = history.findIndex(
        c => c.id === currentCommit.parentId
      );
      if (parentIndex === -1) return;

      const parentCommit = history[parentIndex];
      const clonedNodeMap = cloneNodeMap(parentCommit.nodeMap);

      onRevertComplete({
        nodeMap: clonedNodeMap,
        rootId: parentCommit.rootId,
      });

      setRedoStack(prev => [headIndex, ...prev]);
      setHeadIndex(parentIndex);
    };

    /**
     * Move to next commit that was undone
     * @returns {void}
     */
    const handleRedo = () => {
      if (redoStack.length === 0) return;

      const [newIndex, ...rest] = redoStack;
      const entry = history[newIndex];
      if (!entry) return;

      const clonedNodeMap = cloneNodeMap(entry.nodeMap);

      onRevertComplete({
        nodeMap: clonedNodeMap,
        rootId: entry.rootId,
      });

      setHeadIndex(newIndex);
      setRedoStack(rest);
    };

    /**
     * Check if undo is available
     * @type {boolean}
     */
    const canUndo =
      headIndex !== null && history[headIndex]?.parentId !== null;

    /**
     * Check if redo is available
     * @type {boolean}
     */
    const canRedo = redoStack.length > 0;

    /**
     * Check if there are changes to commit
     * commitDiff is now an array of diff segments
     * @type {boolean}
     */
    const canCommit = commitDiff.some(
      segment => segment.type === 'added' || segment.type === 'removed'
    );


    // =========================================================================
    // COMMIT MODAL
    // =========================================================================

    /**
     * Open commit preview modal
     * @returns {void}
     */
    const handleCommit = () => {
      setIsCommitPreviewOpen(true);
    };

    /**
     * Confirm and create commit
     * @returns {void}
     */
    const handleConfirmCommit = () => {
      if (canCommit) {
        // Clear dirty flags before committing
        const cleaned = new Map();
        nodeMap.forEach((node, id) => {
          const cleanNode = { ...node };
          cleanNode.metadata = { ...cleanNode.metadata, isDirty: false };
          cleaned.set(id, cleanNode);
        });

        addCommit(
          { nodeMap: cleaned, rootId },
          commitTitle || 'Manual commit',
          { isManual: true }
        );

        onCommitComplete(cleaned);
      }

      setIsCommitPreviewOpen(false);
      setCommitTitle('');
    };

    /**
     * Cancel commit modal
     * @returns {void}
     */
    const cancelCommitPreview = () => {
      setIsCommitPreviewOpen(false);
    };


    // =========================================================================
    // VISUALIZATION LAYOUT
    // =========================================================================

    // Layout parameters
    const xStep = 25;
    const xOffset = 20;
    const yStep = 20;
    const yOffset = 10;

    /**
     * Lane colors for different branches
     * @type {string[]}
     */
    const laneColors = useMemo(() => [
      '#6366f1', // indigo
      '#22c55e', // green
      '#eab308', // yellow
      '#ec4899', // pink
      '#7c3aed', // purple
      '#f97316', // orange
      '#06b6d4', // cyan
      '#ef4444', // red
      '#60a5fa', // sky
      '#f59e0b', // amber
      '#a78bfa', // light purple
      '#34d399', // teal-green
      '#fb7185', // rose
    ], []);


    /**
     * Compute SVG nodes, edges, and dimensions
     * @type {{nodes: Array, edges: Array, laneYs: Array, contentWidth: number, svgHeight: number}}
     */
    const { nodes, edges, laneYs, contentWidth, svgHeight } = useMemo(() => {
      const nodes = [];
      const edges = [];
      let maxLane = 0;
      let maxX = 0;

      history.forEach((commit, i) => {
        const lane = commit.branchId;
        maxLane = Math.max(maxLane, lane);
        const y = lane * yStep + yOffset;
        let x;

        if (commit.parentId == null) {
          // Root commit
          x = xOffset;
          nodes.push({
            i,
            x,
            y,
            lane,
            ts: commit.ts,
            title: commit.title,
            isManual: commit.isManual,
          });
        } else {
          // Child commit
          const parentIndex = history.findIndex((c) => c.id === commit.parentId);
          if (parentIndex !== -1) {
            const parentNode = nodes.find((n) => n.i === commit.parentId);
            if (parentNode) {
              const parent = history[parentIndex];
              const parentLane = parent.branchId;
              const parentX = parentNode.x;
              const parentY = parentNode.y;
              x = parentX + xStep;

              nodes.push({
                i,
                x,
                y,
                lane,
                ts: commit.ts,
                title: commit.title,
                isManual: commit.isManual,
              });

              // Create edge
              const color = laneColors[lane % laneColors.length];
              if (Math.abs(parentLane - lane) === 0) {
                // Same lane - straight line
                edges.push({ d: `M ${parentX} ${parentY} L ${x} ${y}`, color });
              } else {
                // Different lane - bezier curve
                const cx = (parentX + x) / 2;
                const dStr = `M ${parentX} ${parentY} C ${cx + 5} ${parentY} ${cx - 5} ${y} ${x} ${y}`;
                edges.push({ d: dStr, color });
              }
            }
          }
        }
        if (x) {
          maxX = Math.max(maxX, x);
        }
      });


      const calculatedLaneYs = Array(maxLane + 1)
        .fill(0)
        .map((_, i) => i * yStep + yOffset);
      const calculatedContentWidth = maxX + xOffset * 2;
      const calculatedHeight = maxLane * yStep + yOffset * 2;

      return {
        nodes,
        edges,
        laneYs: calculatedLaneYs,
        contentWidth: calculatedContentWidth,
        svgHeight: calculatedHeight,
      };
    }, [history, laneColors, xStep, yStep, yOffset, xOffset]);

    const n = history.length;

    React.useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Helper to update width from the container element
      const updateWidth = () => {
        try {
          const w = container.getBoundingClientRect().width || 0;
          setContainerWidth(w);
        } catch {
          // defensive: ignore measurement errors
        }
      };

      // If ResizeObserver exists, use it for accurate updates. Otherwise fall back to window resize.
      let observer;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          if (entries && entries[0] && typeof entries[0].contentRect !== 'undefined') {
            setContainerWidth(entries[0].contentRect.width);
          } else {
            // fallback to manual measurement
            updateWidth();
          }
        });
        try {
          observer.observe(container);
        } catch {
          // If observe throws, fallback to window resize
          window.addEventListener('resize', updateWidth);
        }
      } else {
        window.addEventListener('resize', updateWidth);
      }

      // set initial width synchronously
      updateWidth();

      return () => {
        if (observer && typeof observer.disconnect === 'function') {
          observer.disconnect();
        } else {
          window.removeEventListener('resize', updateWidth);
        }
      };
    }, [n]);



    // =========================================================================
    // TOOLTIP HELPERS
    // =========================================================================

    /**
     * Show tooltip at mouse position
     * @param {React.MouseEvent} e
     * @param {Object} node
     * @returns {void}
     */
    function showTooltipAtMouse(e, node) {
      const container = rootRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setTooltip({ visible: true, x, y, node });
    }

    /**
     * Hide tooltip
     * @returns {void}
     */
    function hideTooltip() {
      setTooltip(t => ({ ...t, visible: false, node: null }));
    }

    // =========================================================================
    // EARLY RETURN: Empty state
    // =========================================================================

    // If there is no data (n === 0) show placeholder before performing rendering below
    if (n === 0) {
      return (
        <div className={`w-full ${className}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Edit history</div>
          </div>
          <div className="flex items-center justify-center text-sm text-gray-500 p-4">No history yet</div>
        </div>
      );
    }

    // =========================================================================
    // RENDER: History graph with commits
    // =========================================================================
    const finalSvgWidth = Math.max(contentWidth, containerWidth);

    const floatingButtonStyle = {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      border: 'none',
      cursor: 'pointer',
      zIndex: 50,
      backgroundColor: 'white',
      color: '#374151', // gray-700
    };

    return (
      <div ref={rootRef} className={`w-full ${className} flex flex-col`} style={{ position: 'relative', boxSizing: 'border-box', height: '100%' }}>
        {/* Sticky Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'white' }} className="p-1 pb-2 border-b">
          <div className="align-middle flex gap-2 items-center">
            <div className="text-sm font-medium text-gray-700">Edit history</div>
            {/* Floating Undo/Redo Buttons */}
            <div style={{ position: 'absolute', top: '-4px', right: '0px', display: 'flex', gap: '8px', zIndex: 21 }}>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (go to previous edit)"
                aria-label="Undo"
                style={{
                  ...floatingButtonStyle,
                  opacity: !canUndo ? 0.3 : 1,
                  cursor: !canUndo ? 'not-allowed' : 'pointer',
                  backgroundColor: !canUndo ? '#e0e0e0' : 'white',
                  color: !canUndo ? '#9ca3af' : '#374151',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (go to next edit)"
                aria-label="Redo"
                style={{
                  ...floatingButtonStyle,
                  opacity: !canRedo ? 0.3 : 1,
                  cursor: !canRedo ? 'not-allowed' : 'pointer',
                  backgroundColor: !canRedo ? '#e0e0e0' : 'white',
                  color: !canRedo ? '#9ca3af' : '#374151',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                </svg>
              </button>
              <button
                onClick={handleCommit}
                disabled={!canCommit}
                title="Commit current changes"
                aria-label="Commit"
                style={{
                  ...floatingButtonStyle,
                  opacity: !canCommit ? 0.3 : 1,
                  cursor: !canCommit ? 'not-allowed' : 'pointer',
                  backgroundColor: !canCommit ? '#e0e0e0' : 'white',
                  color: !canCommit ? '#9ca3af' : '#374151',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Graph Container */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto p-2">
          <div className="flex items-start gap-3">
            <div style={{ width: finalSvgWidth, height: svgHeight, position: 'relative' }}>
              <svg
                ref={svgRef}
                width={finalSvgWidth}
                height={svgHeight}
                viewBox={`0 0 ${finalSvgWidth} ${svgHeight}`}
              >
                <defs>
                  <pattern id="stripes" patternUnits="userSpaceOnUse" width="4" height="4">
                    <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" style={{ stroke: '#ffffff', strokeWidth: 1, opacity: 0.7 }} />
                  </pattern>
                </defs>
                {/* Lane background lines */}
                {laneYs.map((y, li) => (
                  <line key={li} x1={0} y1={y} x2={finalSvgWidth} y2={y} stroke="#f3f4f6" strokeWidth={1.6} />
                ))}

                {/* Edges (commit connections) */}
                {edges.map((e, idx) => (
                  <path key={idx} d={e.d} fill="none" stroke={e.color} strokeWidth={2.6}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                ))}

                {/* Nodes (commits) */}
                {nodes.map((node) => {
                  const isHead = headIndex === node.i;
                  const color = laneColors[(node.lane ?? 0) % laneColors.length];
                  return (
                    <g
                      key={node.i}
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseEnter={(e) => showTooltipAtMouse(e, node)}
                      onMouseMove={(e) => showTooltipAtMouse(e, node)}
                      onMouseLeave={hideTooltip}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Outer white circle */}
                      <circle cx={0} cy={0} r={6.0} fill="#fff" opacity={0.95} />

                      {/* Main commit dot */}
                      <circle
                        cx={0}
                        cy={0}
                        r={4.6}
                        fill={color}
                        tabIndex={0}
                      />

                      {/* Manual commit pattern */}
                      {node.isManual && <circle cx={0} cy={0} r={4.6} fill="url(#stripes)" />}

                      {/* HEAD indicator */}
                      {isHead && (
                        <circle
                          cx={0}
                          cy={0}
                          r={7.0}
                          fill="none"
                          stroke="#111827"
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}

                      {/* Click target */}
                      <circle
                        cx={0}
                        cy={0}
                        r={10.0}
                        fill="transparent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleRevert(node.i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleRevert(node.i);
                        }}
                        onBlur={hideTooltip}
                        role="button"
                        aria-label={`Revert to commit ${node.i + 1}`}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Custom tooltip rendered absolutely within the container */}
        {tooltip.visible && tooltip.node && (
          <div
            className="pointer-events-none absolute z-50 text-xs text-white bg-black bg-opacity-90 px-3 py-2 rounded shadow"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: `translate(${tooltip.x > containerWidth / 2 ? '-100%' : '0%'}, -120%)`,
              marginLeft: tooltip.x > containerWidth / 2 ? '-10px' : '10px',
              whiteSpace: 'normal',
            }}
            role="status"
            aria-hidden={false}
          >
            <div className="flex items-start gap-2">
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 6,
                background: laneColors[(tooltip.node.lane ?? 0) % laneColors.length],
                display: 'inline-block',
                marginTop: 3
              }} aria-hidden />
              <div>
                <div
                  className="text-sm font-medium text-white leading-tight">{`Edit #${tooltip.node.i + 1}: ${tooltip.node.title}`}</div>
                <div
                  className="text-[11px] text-gray-200 mt-0.5">{new Date(tooltip.node.ts).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {/* Revert Confirmation Modal */}
        {pendingRevert != null && (() => {
          const entry = history[pendingRevert];
          if (!entry) return null;

          const currentNodeMap =
            headIndex != null ? history[headIndex]?.nodeMap : new Map();
          // Use computeTextDiff instead of computeNodeDiff
          const diff = computeTextDiff(currentNodeMap, entry.nodeMap);

          return (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black opacity-40"
                onClick={cancelRevert} />
              <div
                className="relative max-w-3xl w-full max-h-[90vh] flex flex-col"
                style={{
                  background: "rgba(255, 255, 255, 0.9)",
                  backdropFilter: "saturate(180%) blur(20px)",
                  WebkitBackdropFilter: "saturate(180%) blur(20px)",
                  borderRadius: "24px",
                  border: "1px solid rgba(255, 255, 255, 0.5)",
                  boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0,0,0,0.05)"
                }}
              >
                {/* Header */}
                <div className="p-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">
                        Restore this edit?
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Edit #{entry.id + 1} •{' '}
                        {new Date(entry.ts).toLocaleString()}
                      </div>
                      {entry.title &&
                        <div className="text-xs text-gray-800 mt-2 font-medium">
                          {entry.title}
                        </div>
                      }
                    </div>
                  </div>
                </div>

                {/* Diff View */}
                <div className="flex-1 overflow-auto p-4">
                  <DiffView diff={diff} />
                </div>

                {/* Footer */}
                <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <button onClick={cancelRevert}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '13px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                  >
                    Cancel
                  </button>
                  <button onClick={confirmRevert}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '13px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#dc2626';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#ef4444';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Restore
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Commit Preview Modal */}
        {isCommitPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black opacity-40" onClick={cancelCommitPreview} />
            <div
              className="relative max-w-xl w-full max-h-[80vh] flex flex-col"
              style={{
                background: "rgba(255, 255, 255, 0.9)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.5)",
                boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0,0,0,0.05)"
              }}
            >
              <div className="p-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div className="text-sm font-semibold text-gray-900">
                  Commit preview

                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Review changes before committing

                </div>
                <div className="mt-4">
                  <label htmlFor="commit-title" className="block text-xs font-medium text-gray-700 mb-1">
                    Commit title:

                  </label>
                  <input
                    id="commit-title"
                    type="text"
                    value={commitTitle}
                    onChange={(e) => setCommitTitle(e.target.value)}
                    placeholder="Commit title (optional)"
                    className="w-full p-2 border border-gray-300 rounded-md text-sm text-gray-900"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <span className="text-xs text-gray-500">
                  Changes since last commit:

                </span>
                <div className="mt-2">
                  <DiffView diff={commitDiff} />
                </div>
              </div>
              <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <button onClick={cancelCommitPreview}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'rgba(0,0,0,0.05)',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                >Cancel</button>
                <button onClick={handleConfirmCommit}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#111827',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '13px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
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
                  Commit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  });

export default HistoryGraph;
