import { useState } from 'react';
import { TreeVisualization, TreeVisualizationAlternate } from './components';

const EXAMPLE_TEXT =
  'Climate change poses significant challenges to global food security. ' +
  'Rising temperatures and changing precipitation patterns affect crop yields. ' +
  'Developing drought-resistant crops is one solution. ' +
  'International cooperation on climate policy is essential.';

export default function IdeaCanvas() {
  const [text, setText] = useState('');

  const insertExample = () => {
    setText(EXAMPLE_TEXT);
  };

  const clearText = () => setText('');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Text Editor */}
      <div className="w-1/2 flex flex-col border-r border-gray-200">
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

      {/* Canvas */}
      <div className="w-1/2 flex flex-col">
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Tree Structure</h2>
        </div>

        <div
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
          {/* <TreeVisualization text={text} /> */}
          <TreeVisualizationAlternate text={text} />
        </div>
      </div>
    </div>
  );
}