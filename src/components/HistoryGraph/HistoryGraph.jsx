import React, { useRef, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { deepCloneSentences } from '../../utils/deepClone';

// Responsive git-style history graph.
// Props:
// - className: optional container class
// - onRevertComplete(data): function(data) called when a revert is confirmed
const HistoryGraph = forwardRef(({
  className = 'history-graph',
  onRevertComplete = () => {
  },
}, ref) => {
  const [history, setHistory] = useState([]);
  const [headIndex, setHeadIndex] = useState(null);
  const [pendingRevert, setPendingRevert] = useState(null);

  // Helper to append a new commit. If headIndex is not the last index, this will create a new branch.
  const addCommit = (data, title) => {
    const id = history.length;
    const ts = Date.now();

    // Deep clone the data to ensure each commit is an independent snapshot
    const clonedData = deepCloneSentences(data);

    setHistory((h) => {
      let parentId = null;
      let branchId = 0;

      if (h.length === 0) {
        // no history yet -> first commit
        const newCommit = [{ id, ts, data: clonedData, title, parentId, branchId }];
        setHeadIndex(0);
        return newCommit;
      }

      branchId = h[headIndex].branchId ?? 0;
      parentId = h[headIndex].id;

      // Check if parent has other children (successors) in current history
      const parentHasOtherChildren = h.some((item, idx) => idx !== headIndex && item.parentId === parentId);
      if (parentHasOtherChildren) {
        // Create a new branch
        branchId = Math.max(...h.map(c => c.branchId), 0) + 1;
      }

      const newHistory = h.slice(0, h.length);
      newHistory.push({ id, ts, data: clonedData, title, parentId, branchId });
      setHeadIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  useImperativeHandle(ref, () => ({
    addCommit
  }));

  // When called from HistoryGraph we open the modal and store the requested index.
  const handleRevert = (index) => {
    if (typeof index !== 'number') return;
    if (index === headIndex) return;
    const entry = history[index];
    if (!entry) return;
    setPendingRevert(index);
  };

  // Confirm and perform the revert (called by the modal)
  const confirmRevert = () => {
    const index = pendingRevert;
    if (typeof index !== 'number') return setPendingRevert(null);
    const entry = history[index];
    if (!entry) return setPendingRevert(null);

    // Deep clone the data when reverting to ensure the reverted state is independent
    const clonedData = deepCloneSentences(entry.data);
    onRevertComplete(clonedData);
    //setHierarchyState('needs-full-regen');
    setHeadIndex(index);
    setPendingRevert(null);
  };

  const cancelRevert = () => setPendingRevert(null);


  const n = history.length;

  // Layout parameters
  const xStep = 25;
  const xOffset = 20;
  const yStep = 20;
  const yOffset = 10;

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
  // Compute nodes, edges, and SVG dimensions for rendering
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
        x = xOffset;
        nodes.push({ i, x, y, lane, ts: commit.ts, text: commit.text, title: commit.title });
      } else {
        const parentIndex = history.findIndex((c) => c.id === commit.parentId);
        if (parentIndex !== -1) {
          const parentNode = nodes.find((n) => n.i === commit.parentId);
          if (parentNode) {
            const parent = history[parentIndex];
            const parentLane = parent.branchId;
            const parentX = parentNode.x;
            const parentY = parentNode.y;
            x = parentX + xStep;

            nodes.push({ i, x, y, lane, ts: commit.ts, data: commit.data, title: commit.title });

            const color = laneColors[lane % laneColors.length];
            if (Math.abs(parentLane - lane) === 0) {
              edges.push({ d: `M ${parentX} ${parentY} L ${x} ${y}`, color });
            } else {
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

    const laneYs = Array(maxLane + 1).fill(0).map((_, i) => i * yStep + yOffset);
    const calculatedContentWidth = maxX + xOffset * 2;
    const contentHeight = maxLane * yStep + yOffset * 2;

    return { nodes, edges, laneYs, contentWidth: calculatedContentWidth, svgHeight: contentHeight };
  }, [history, laneColors, xStep, yStep, yOffset]);

  // Refs, state, and effects for responsive SVG
  const svgRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, node: null });

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


  // Helper to position tooltip from a mouse event
  function showTooltipAtMouse(e, node) {
    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTooltip({ visible: true, x, y, node });
  }

  function hideTooltip() {
    setTooltip((t) => ({ ...t, visible: false, node: null }));
  }

  // If there is no data (n === 0) show placeholder before performing rendering below
  if (n === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="flex items-center justify-center text-sm text-gray-500 p-4">No history yet</div>
      </div>
    );
  }

  const finalSvgWidth = Math.max(contentWidth, containerWidth);

  return (
    // make container relative so tooltip can be absolutely positioned
    <div className={`w-full ${className}`} style={{ position: 'relative', boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">Edit history</div>
        <div className="text-xs text-gray-500">Edits: {history.length}</div>
      </div>

      <div ref={scrollContainerRef} className="flex items-start gap-3 overflow-auto">
        <div style={{ width: finalSvgWidth, height: svgHeight, position: 'relative' }}>
          <svg
            ref={svgRef}
            width={finalSvgWidth}
            height={svgHeight}
            viewBox={`0 0 ${finalSvgWidth} ${svgHeight}`}
          >
            {/* background horizontal lane lines */}
            {laneYs.map((y, li) => (
              <line key={li} x1={0} y1={y} x2={finalSvgWidth} y2={y} stroke="#f3f4f6" strokeWidth={1.6} />
            ))}

            {/* edges */}
            {edges.map((e, idx) => (
              <path key={idx} d={e.d} fill="none" stroke={e.color} strokeWidth={2.6}
                strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            ))}

            {/* nodes */}
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
                  <circle cx={0} cy={0} r={7.0} fill="transparent" />
                  <circle cx={0} cy={0} r={6.0} fill="#fff" opacity={0.95} />
                  <circle
                    cx={0}
                    cy={0}
                    r={4.4}
                    fill={color}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    style={{ outline: 'none' }}
                    onClick={() => handleRevert(node.i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleRevert(node.i);
                    }}
                    onBlur={hideTooltip}
                    tabIndex={0}
                    role="button"
                    aria-label={`Revert to commit ${node.i + 1}`}
                  />
                  {isHead && <circle cx={0} cy={0} r={7.0} fill="none" stroke="#111827"
                    strokeWidth={2} opacity={0.9} />}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Custom tooltip rendered absolutely within the container */}
      {tooltip.visible && tooltip.node && (
        <div
          className="pointer-events-none absolute z-50 text-xs text-white bg-black bg-opacity-90 px-3 py-2 rounded shadow max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(0%, -60%)', whiteSpace: 'normal' }}
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

      {/* Custom confirmation modal for revert */}
      {pendingRevert != null && (() => {
        const entry = history[pendingRevert];
        if (!entry) return null;
        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black opacity-40" onClick={cancelRevert} />
            <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full p-4 mx-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900">Revert to this edit?</div>
                  <div className="text-xs text-gray-600 mt-1">Edit
                    #{entry.id + 1} • {new Date(entry.ts).toLocaleString()}</div>
                  {entry.title &&
                    <div className="text-xs text-gray-800 mt-2 font-medium">{entry.title}</div>}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={cancelRevert}
                  className="px-3 py-1.5 rounded-md text-sm bg-gray-100 text-gray-800 hover:bg-gray-200">Cancel
                </button>
                <button onClick={confirmRevert}
                  className="px-3 py-1.5 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Revert
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
});

export default HistoryGraph;