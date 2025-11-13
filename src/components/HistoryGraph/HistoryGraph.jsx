import React, { useRef, useState, useMemo } from 'react';

// Responsive git-style history graph.
// Props:
// - history: Array of { id, ts, text, parentId, branchId }
// - className: optional container class
// - onRevert(index): function(index) called when clicking a node
// - headIndex: index into data for current HEAD
export default function HistoryGraph({
  history = [],
  className = '',
  onRevert = () => {},
  headIndex = null,
}) {
    const n = history.length;

    // Layout parameters
    const xStep = 15;
    const xOffset = 40;
    const yStep = 10;
    const yOffset = 20;

    const laneColors = useMemo(() => ['#6366f1', '#22c55e', '#eab308', '#ec4899', '#7c3aed'], []);
    // Compute nodes and edges for SVG rendering
    const { nodes, edges, laneYs, width, height } = useMemo(() => {
      const nodes = [];
      const edges = [];
      let laneYs = [];

      let maxLane = 0;

      history.forEach((commit, i) => {
        // Determine lane
        let lane = commit.branchId;
        maxLane = Math.max(maxLane, lane);

        const y = lane * yStep + yOffset;

        // Create edge to parent
        if (commit.parentId == null) {
            nodes.push({ i: i, x: xOffset, y: y, lane, ts: commit.ts, text: commit.text });
        } else {
          const parentIndex = history.findIndex((c) => c.id === commit.parentId);
          if (parentIndex !== -1) {
            const parentNode = nodes.find((n) => n.i === commit.parentId);
            const parent = history[parentIndex];
            const parentLane = parent.branchId;
            const parentX = parentNode.x;
            const parentY = parentNode.y;
            const x = parentX + xStep;

            nodes.push({ i, x, y, lane, ts: commit.ts, text: commit.text });

              const color = laneColors[lane % laneColors.length];
              if (Math.abs(parentLane - lane) === 0) {
                  // same lane -> straight line
                  edges.push({ d: `M ${parentX} ${parentY} L ${x} ${y}`, color: color });
              } else {
                  // curve between lanes
                  const cx = (parentX + x) / 2;
                  const dStr = `M ${parentX} ${parentY} C ${cx} ${parentY} ${cx} ${y} ${x} ${y}`;
                  edges.push({ d: dStr, color: color });
              }

          }
        }
      });

      laneYs = Array(maxLane + 1).fill(0).map((_, i) => i * yStep + yOffset);

      const width = n * xStep + 80;
      const height = laneYs.length * yStep + 40;

      return { nodes, edges, laneYs: laneYs, width, height };
    }, [history, n, laneColors]);


  // Refs and tooltip state for custom tooltip
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, node: null });

  // Helper to position tooltip from a mouse event
  function showTooltipAtMouse(e, node) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTooltip({ visible: true, x, y, node });
  }

  // Helper to position tooltip from node coordinates (for keyboard focus)
  function showTooltipAtNode(node) {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;
    const crect = container.getBoundingClientRect();
    const srect = svg.getBoundingClientRect();
    const scaleX = srect.width / width;
    const scaleY = srect.height / height;
    const px = srect.left + node.x * scaleX;
    const py = srect.top + node.y * scaleY;
    const x = px - crect.left;
    const y = py - crect.top;
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

  return (
    // make container relative so tooltip can be absolutely positioned
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">Edit history</div>
        <div className="text-xs text-gray-500">Edits: {history.length}</div>
      </div>

      <div className="flex items-start gap-3">
        <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet">
          {/* background horizontal lane lines */}
          {laneYs.map((y, li) => (
            <line key={li} x1={0} y1={y} x2={width} y2={y} stroke="#f3f4f6" strokeWidth={0.6} />
          ))}

          {/* edges */}
          {edges.map((e, idx) => (
            <path key={idx} d={e.d} fill="none" stroke={e.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          ))}

          {/* nodes */}
          {nodes.map((node) => {
            const isHead = headIndex === node.i;
            const color = laneColors[(node.lane ?? 0) % laneColors.length];
            return (
              // attach hover handlers to group; focus lives on the inner circle so clicks don't show the default focus ring
              <g
                key={node.i}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={(e) => showTooltipAtMouse(e, node)}
                onMouseMove={(e) => showTooltipAtMouse(e, node)}
                onMouseLeave={hideTooltip}
              >
                  {/* hit area - keep a slightly larger invisible circle for easier hover/click (doesn't receive keyboard focus) */}
                  <circle cx={0} cy={0} r={4.0} fill="transparent" />
                  {/* outline */}
                  <circle cx={0} cy={0} r={3.0} fill="#fff" opacity={0.95} />
                  {/* node circle (keyboard-focusable) */}
                <circle
                  cx={0}
                  cy={0}
                  r={2.4}
                  fill={color}
                  // prevent mouse-down from focusing the element (removes the strange click-box), but allow keyboard focus
                  onMouseDown={(e) => { /* prevent mouse focus so only keyboard shows focus-visible */ e.preventDefault(); }}
                  style={{ cursor: 'pointer', outline: 'none' }}
                  onClick={() => onRevert(node.i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRevert(node.i); }}
                  onFocus={() => showTooltipAtNode(node)}
                  onBlur={hideTooltip}
                  tabIndex={0}
                  role="button"
                  aria-label={`Revert to commit ${node.i + 1}`}
                />
                  {/* head indicator */}
                {isHead && <circle cx={0} cy={0} r={4.0} fill="none" stroke="#111827" strokeWidth={1} opacity={0.9} />}
                  {/* removed <title> in favor of a custom tooltip */}
              </g>
            );
          })}
        </svg>

        {/* Legend / info area */}
        <div style={{ minWidth: 140 }} className="text-xs text-gray-600">
          <div className="font-medium text-sm text-gray-800 mb-1">Branches</div>
          {laneYs.map((l, i) => {
              const color = laneColors[i % laneColors.length];
              return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span style={{ width: 12, height: 12, borderRadius: 6, background: color }} aria-hidden />
                <div>
                  <div className="text-xs text-gray-800">Branch {i + 1}</div>
                  <div className="text-xs text-gray-500">{nodes.filter((nd) => nd.lane === i).length} commits</div>
                </div>
              </div>
            )}
          )}

          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
            <div className="text-xs text-gray-800 font-medium">HEAD</div>
            {headIndex == null ? (
              <div className="text-xs text-gray-500">No head</div>
            ) : (
              (() => {
                const h = history[headIndex];
                if (!h) return <div className="text-xs text-gray-500">-</div>;
                return (
                  <div>
                    <div className="text-xs text-gray-800">Edit #{h.id + 1} "{h.title}"</div>
                    <div className="text-xs text-gray-500">{new Date(h.ts).toLocaleString()}</div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Custom tooltip rendered absolutely within the container */}
      {tooltip.visible && tooltip.node && (
        <div
          className="pointer-events-none absolute z-50 text-xs text-white bg-black bg-opacity-90 px-3 py-2 rounded shadow max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -120%)', whiteSpace: 'normal' }}
          role="status"
          aria-hidden={false}
        >
          <div className="flex items-start gap-2">
            <span style={{ width: 10, height: 10, borderRadius: 6, background: laneColors[(tooltip.node.lane ?? 0) % laneColors.length], display: 'inline-block', marginTop: 3 }} aria-hidden />
            <div>
              <div className="text-sm font-medium text-white leading-tight">{tooltip.node.title || `Edit #${tooltip.node.i + 1}`}</div>
              <div className="text-[11px] text-gray-200 mt-0.5">{new Date(tooltip.node.ts).toLocaleString()}</div>
              {tooltip.node.text ? (
                <div className="text-[12px] text-gray-100 mt-1 truncate" style={{ maxWidth: 320 }}>{tooltip.node.text}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </div>
   );
 }
