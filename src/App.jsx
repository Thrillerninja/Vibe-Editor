import { useEffect, useRef, useState } from 'react';
import { TreeVisualization, HistoryGraph } from './components';
import React from 'react';

const EXAMPLE_TEXT =
  'Climate change poses significant challenges to global food security. ' +
  'Rising temperatures and changing precipitation patterns affect crop yields. ' +
  'Developing drought-resistant crops is one solution. ' +
  'International cooperation on climate policy is essential.';

export default function App() {
  const [text, setText] = useState('');
  const [textTree, setTextTree] = useState('');

  // Split state for horizontal divider
  const [leftPct, setLeftPct] = useState(50);
  const horizontalContainerRef = useRef(null);
  const draggingHorizontalRef = useRef(false);

  // Split state for vertical divider
  const [bottomPct, setBottomPct] = useState(20);
  const verticalContainerRef = useRef(null);
  const draggingVerticalRef = useRef(false);


  console.log("TEST0typeof setText in EmotionSelector:", typeof setTextTree);
  const insertExample = () => setText(EXAMPLE_TEXT);
  const clearText = () => setText('');

  // History entries now store full snapshots with parent/branch info.
  // Each entry: { id, ts, text, value, parentId, branch }
  const [history, setHistory] = useState([]);
  // Index in history array representing the current HEAD (null when no commits)
  const [headIndex, setHeadIndex] = useState(null);
  // Pending revert index for the custom confirmation modal (null = none)
  const [pendingRevert, setPendingRevert] = useState(null);

  // Helper to append a new commit. If headIndex is not the last index, this will create a new branch.
  const addCommit = (text) => {
    const id = history.length;
    const ts = Date.now();

    setHistory((h) => {
      let parentId = null;
      let branchId = 0;

      if (h.length === 0) {
        // no history yet -> first commit
        const newCommit = [{ id, ts, text, parentId, branchId }];
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
      newHistory.push({ id, ts, text, parentId, branchId });
      setHeadIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  function handleRendering(t) {
    console.log('[App] Rendering tree with text length:', t.length);
    setTextTree(t);
    addCommit(t);
  }

  function applyTreeModification(newText, oldText, startIdx) {
    // Use the functional form of setText to get the most recent 'currentFullText'.
    console.log(newText)
    console.log(oldText)
    console.log("---")
    console.log(startIdx)
    console.log("---")
    setText(currentFullText => {

      // 1. Get the text *before* the part we're replacing.
      const textBefore = currentFullText.substring(0, startIdx);

      // 2. Get the text *after* the part we're replacing.
      const textAfter = currentFullText.substring(startIdx + oldText.length);

      // 3. Construct the new full text string.
      const newFullText = textBefore + newText + textAfter;

      console.log(`[App] Tree modification applied. New text length: ${newFullText.length}`);

      // 4. Update both states with the new full text.
      setTextTree(newFullText);
      addCommit(newFullText);
      console.log(newFullText)
      return newFullText; // This updates the 'text' state.
    });
  }

  // Revert to a historical state by index. Confirm with the user before reverting.
  // const handleRevert = (index) => {
  //   if (typeof index !== 'number') return;
  //   const entry = history[index];
  //   if (!entry) return;
  //   const ok = window.confirm(`Revert to commit "${entry.title}" at ${new Date(entry.ts).toLocaleString()}?`);
  //   if (!ok) return;
  //   // Restore text and tree state and move HEAD to the selected commit (detached).
  //   setText(entry.text);
  //   setTextTree(entry.text);
  //   setHeadIndex(index);
  // };
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
    setText(entry.text);
    setTextTree(entry.text);
    setHeadIndex(index);
    setPendingRevert(null);
  };

  const cancelRevert = () => setPendingRevert(null);

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
      if (draggingVerticalRef.current && verticalContainerRef.current) {
        const rect = verticalContainerRef.current.getBoundingClientRect();
        const y = Math.min(Math.max(clientY, rect.top), rect.bottom);
        const pct = ((rect.bottom - y) / rect.height) * 100;
        const clamped = Math.min(80, Math.max(20, pct));
        setBottomPct(clamped);
      }
    };

    const handleMouseMove = (e) => onMove(e.clientX, e.clientY);
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const endDrag = () => {
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
  console.log("typeof setText in EmotionSelector:", typeof applyTreeModification);
  return (
    <div
      ref={verticalContainerRef}
      className="flex flex-col h-screen bg-gray-50 select-none"
      style={{ userSelect: draggingHorizontalRef.current || draggingVerticalRef.current ? 'none' : undefined }}
    >
      <div
        className="flex-1 flex"
        style={{ flexBasis: `${100 - bottomPct}%`, minHeight: 0 }}
      >
        {/* Left Pane (Text Editor) */}
        <div
          ref={horizontalContainerRef}
          className="flex flex-col border-r border-gray-200"
          style={{
            flexBasis: `${leftPct}%`,
            minWidth: 0,
          }}
        >
          <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Text</h2>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  handleRendering(text);
                }}
              >
                Render
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
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
          style={{ flexBasis: `${100 - leftPct}%`, minWidth: 0 }}
        >
          <div
          className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between"
          >
            <h2 className="text-lg font-semibold text-gray-900">Tree Structure</h2>
          </div>

          <div
            id="graph-pane"
            className="flex-1 relative overflow-hidden"
            style={{
              backgroundImage: `
                linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
              backgroundColor: '#ffffff',
            }}
          >
            <TreeVisualization text={textTree} applyTreeModification={applyTreeModification}/>
          </div>
        </div>
      </div>
      <HorizontalDividerHandle
        onMouseDown={onVerticalHandleMouseDown}
        onTouchStart={onVerticalHandleMouseDown}
      />
      <div
        className="bg-white"
        style={{ flexBasis: `${bottomPct}%`}}
      >
        <div className="p-3 h-full">
          <HistoryGraph history={history} onRevert={handleRevert} headIndex={headIndex} />
        </div>
      </div>

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
                  <div className="text-xs text-gray-600 mt-1">Edit #{entry.id + 1} • {new Date(entry.ts).toLocaleString()}</div>
                  {entry.title && <div className="text-xs text-gray-800 mt-2 font-medium">{entry.title}</div>}
                  {entry.text && <div className="text-xs text-gray-600 mt-2 truncate" style={{ maxHeight: 80 }}>{entry.text}</div>}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={cancelRevert} className="px-3 py-1.5 rounded-md text-sm bg-gray-100 text-gray-800 hover:bg-gray-200">Cancel</button>
                <button onClick={confirmRevert} className="px-3 py-1.5 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Revert</button>
              </div>
            </div>
          </div>
        );
      })()}
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
