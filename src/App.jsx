import { useEffect, useRef, useState, useMemo } from 'react';
import posthog from './utils/posthog';
import { TreeVisualization } from './components';
import { buildTextFromSentences } from './utils/treeParser';
import { applySentenceEdit } from './utils/sentenceEditor';
import { useUserIdentification } from './hooks/useUserIdentification';

const EXAMPLE_TEXT =
  'Climate change poses significant challenges to global food security. ' +
  'Rising temperatures and changing precipitation patterns affect crop yields.\n' +
  'Developing drought-resistant crops is one solution. ' +
  'International cooperation on climate policy is essential.\n\n' +
  'Agricultural innovation is crucial for adaptation. ' +
  'Scientists are developing new crop varieties. ' +
  'These innovations may help farmers cope with climate extremes.';

export default function App() {
  useUserIdentification();

  // SSOT: Store sentences as the primary data structure
  const [sentences, setSentences] = useState([]);

  // Derived state: text is built from sentences
  const text = useMemo(() => buildTextFromSentences(sentences), [sentences]);

  // Split state: percentage of total width for the left pane (0–100)
  const [leftPct, setLeftPct] = useState(50);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);
  const textareaRef = useRef(null);

  const insertExample = () => {
    // Parse example text into sentences
    const newSentences = applySentenceEdit([], EXAMPLE_TEXT, 0);

    // Log event
    posthog.capture('example_inserted', {
      text_length: EXAMPLE_TEXT.length,
      sentence_count: newSentences.length,
    });
    setSentences(newSentences);
  };

  const clearText = () => setSentences([]);

  // Handle text input changes from textarea - DIRECT EDITING
  const handleTextChange = (e) => {
    const newText = e.target.value;
    const cursorPosition = e.target.selectionStart;

    console.log('[App] Text changed, cursor at:', cursorPosition);
    // Track typing patterns
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

  // Handle tree modifications (e.g., node edits, reordering, emotion changes)
  function handleTreeUpdate(updatedSentences) {
    console.log('[App] Tree updated, updating sentences:', updatedSentences.length);
    posthog.capture('tree_updated', {
      sentence_count: updatedSentences.length,
    });

    setSentences(updatedSentences);
  }

  // Handle drag start
  const onHandleMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
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

  // Global move/up handlers for both mouse and touch
  useEffect(() => {
    const onMove = (clientX) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.min(Math.max(clientX, rect.left), rect.right);
      const pct = ((x - rect.left) / rect.width) * 100;
      const clamped = Math.min(80, Math.max(20, pct));
      setLeftPct(clamped);
    };

    const handleMouseMove = (e) => onMove(e.clientX);
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX);
    };
    const endDrag = () => {
      draggingRef.current = false;
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

  return (
    <div
      ref={containerRef}
      className="flex h-screen bg-gray-50 select-none"
      style={{ userSelect: draggingRef.current ? 'none' : undefined }}
    >
      {/* Left Pane (Text Editor) */}
      <div
        className="flex flex-col border-r border-gray-200"
        style={{
          flexBasis: `${leftPct}%`,
          minWidth: 0,
          zIndex: 100000
        }}
      >
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Text</h2>
          <div className="flex items-center gap-2">
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
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          className="flex-1 p-6 bg-white resize-none focus:outline-none text-gray-800 text-base leading-relaxed"
          placeholder="Enter your text here..."
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
          }}
        />
      </div>

      {/* Draggable Divider */}
      <DividerHandle
        onMouseDown={onHandleMouseDown}
        onTouchStart={onHandleMouseDown}
        leftPct={leftPct}
        setLeftPct={setLeftPct}
      />

      {/* Right Pane (Canvas) */}
      <div
        className="flex flex-col"
        style={{ flexBasis: `${100 - leftPct}%`, minWidth: 0 }}
      >
        <div
          className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between"
          style={{
            zIndex: 100000
          }}>
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
          <TreeVisualization
            sentences={sentences}
            onTreeUpdate={handleTreeUpdate}
          />
        </div>
      </div>
    </div>
  );
}

// A11y-friendly divider with mouse, touch, and keyboard support
function DividerHandle({
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
        zIndex: 100000
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