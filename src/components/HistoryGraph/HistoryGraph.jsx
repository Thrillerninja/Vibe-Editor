import React from 'react';

// Git-style history graph component.
// Props:
// - data: Array of { id, ts, text, value, parentId }
// - height: px height of the SVG
// - className: optional container className
// - onRevert(index): callback when user wants to revert to commit at history index
// - headIndex: index in data array that represents the current HEAD
export default function HistoryGraph({ data = [], height = 120, className = '', onRevert = () => {}, headIndex = null }) {
  const n = data.length;

  if (n === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-gray-500 p-4 ${className}`}>
        No history yet
      </div>
    );
  }

  // compute X positions by column so siblings (same parent) share the same x coordinate.
  // Column rule: column = parentIndex + 1 (or 0 for root/no-parent). Then compress columns
  // to consecutive indices in order of first appearance to keep layout left-aligned.
  const idToIndex = Object.fromEntries(data.map((d, i) => [d.id, i]));

  const cols = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      cols[i] = 0;
      continue;
    }
    const pId = data[i].parentId;
    const pIdx = pId ? idToIndex[pId] : undefined;
    cols[i] = (pIdx === undefined || pIdx === -1) ? 0 : pIdx + 1;
  }

  // compress columns to left-to-right indices in order of first appearance
  const colMap = {};
  const uniqueCols = [];
  cols.forEach((c) => {
    if (!Object.prototype.hasOwnProperty.call(colMap, c)) {
      colMap[c] = uniqueCols.length;
      uniqueCols.push(c);
    }
  });

  const columnsCount = Math.max(1, uniqueCols.length);
  const usable = 700;
  const step = columnsCount === 1 ? 0 : usable / (columnsCount - 1);
  const xs = cols.map((c) => 10 + colMap[c] * step);

  // Assign lanes based purely on parent relationships.
  // Rule: if a commit's parent is the immediate previous commit, inherit the parent's lane;
  // otherwise allocate a new lane (branch).
  const lanes = new Array(n).fill(null);
  lanes[0] = 0;
  let nextLane = 1;

  for (let i = 0; i < n; i++) {
    const entry = data[i];
    if (i === 0) {
      lanes[i] = 0;
      continue;
    }
    const pId = entry.parentId;
    if (!pId) {
      // no parent -> assign to lane 0
      lanes[i] = 0;
      continue;
    }
    const pIdx = idToIndex[pId];
    if (pIdx === undefined || pIdx === -1) {
      // parent missing -> default to lane 0
      lanes[i] = 0;
      continue;
    }
    if (pIdx === i - 1) {
      // direct continuation of previous commit -> same lane as parent
      lanes[i] = lanes[pIdx] ?? 0;
    } else {
      // parent is earlier -> allocate a new lane for this branch
      lanes[i] = nextLane;
      nextLane += 1;
    }
  }

  const laneCount = Math.max(1, nextLane);

  // Colors for lanes.
  const baseColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
  const laneColors = new Array(laneCount).fill(0).map((_, i) => {
    return baseColors[i % baseColors.length];
  });

  // compute lane Y positions
  const laneYs = new Array(laneCount).fill(0).map((_, li) => {
    if (laneCount === 1) return 50;
    const t = li / (laneCount - 1);
    return 22 + t * 56; // within svg 0..100
  });

  // Build nodes with assigned lanes and uniform coordinates (x from order)
  // We keep x = xs[i] for every node so consecutive nodes have equal horizontal spacing.
  const nodes = data.map((d, i) => ({ ...d, i, x: xs[i], lane: lanes[i], y: laneYs[lanes[i]] }));

  // build edges using parentId references (use updated node coordinates)
  const edges = [];
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const pi = idToIndex[node.parentId];
    if (pi === undefined || pi === -1) return; // parent not found
    const parent = nodes[pi];
    const ax = parent.x;
    const ay = parent.y;
    const bx = parent.x + step;
    node.x = bx;
    const by = node.y;
    if (Math.abs(parent.lane - node.lane) === 0) {
      // same lane -> straight line
      edges.push({ d: `M ${ax} ${ay} L ${bx} ${by}`, color: laneColors[node.lane] });
    } else {
      // curve between lanes
      const cx = (ax + bx) / 2;
      const dStr = `M ${ax} ${ay} C ${cx} ${ay} ${cx} ${by} ${bx} ${by}`;
      edges.push({ d: dStr, color: laneColors[node.lane] });
    }
  });

  // counts per lane (internal branch id) for legend
  const branchCounts = new Array(laneCount).fill(0);
  nodes.forEach((n2) => branchCounts[n2.lane]++);

  return (
    <div className={`w-full p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-700 font-medium">Edit history (branch view)</div>
        <div className="text-xs text-gray-500">Commits: {n}</div>
      </div>

      <div className="flex gap-3 items-start">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMinYMid meet" style={{ width: '100%', height: `${height}px` }}>
          {/* background lane lines */}
          {laneYs.map((y, li) => (
            <line key={`lane-${li}`} x1={0} y1={y} x2={100} y2={y} stroke="#f3f4f6" strokeWidth={0.6} />
          ))}

          {/* edges */}
          {edges.map((e, idx) => (
            <path key={`edge-${idx}`} d={e.d} fill="none" stroke={e.color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
          ))}

          {/* nodes */}
          {nodes.map((node) => {
            const isHead = headIndex === node.i;
            const cx = node.x;
            const cy = node.y;
            const color = laneColors[node.lane];
            const handleClick = () => {
              if (typeof onRevert === 'function') onRevert(node.i);
            };
            const handleKeyDown = (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            };
            return (
              <g key={`node-${node.i}`} role="button" tabIndex={0} onClick={handleClick} onKeyDown={handleKeyDown} aria-label={`Revert to commit ${node.i + 1}`} style={{ cursor: 'pointer' }}>
                {/* hit area */}
                <circle cx={cx} cy={cy} r={4.2} fill="#fff" opacity={0.95} />
                {/* main dot */}
                <circle cx={cx} cy={cy} r={2.8} fill={color} stroke="#fff" strokeWidth={0.6} />
                {/* head highlight */}
                {isHead && <circle cx={cx} cy={cy} r={5.4} fill="none" stroke="#111827" strokeWidth={0.8} opacity={0.9} />}

                <title>{`ts: ${new Date(node.ts).toLocaleString()}\nlen: ${node.value}\n${(node.text || '').slice(0, 80).replace(/\n/g, ' ')}`}</title>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-col text-xs text-gray-600" style={{ minWidth: 130 }}>
          <div className="font-medium text-sm text-gray-800 mb-1">Branches</div>
          {/* Show legend entries for lanes (internal branch ids)*/}
          {Array.from({ length: laneCount }).map((_, li) => {
            return (
              <div key={`leg-${li}`} className="flex items-center gap-2 py-0.5">
                <span style={{ width: 12, height: 12, borderRadius: 6, background: laneColors[li % laneColors.length] }} aria-hidden />
                <div>
                  <div className="text-xs text-gray-500">{branchCounts[li]} commits</div>
                </div>
              </div>
            );
          })}

          {/* Current HEAD info */}
          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
            <div className="text-xs text-gray-800 font-medium">HEAD</div>
            {headIndex == null ? (
              <div className="text-xs text-gray-500">No head</div>
            ) : (
              (() => {
                const h = data[headIndex];
                if (!h) return <div className="text-xs text-gray-500">-</div>;
                return (
                  <div>
                    <div className="text-xs text-gray-800">Commit #{headIndex + 1} "{h.name}"</div>
                    <div className="text-xs text-gray-500">{new Date(h.ts).toLocaleString()}</div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
