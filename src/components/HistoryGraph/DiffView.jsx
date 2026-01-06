/**
 * @fileoverview DiffView Component - Text-based diff with inline highlighting
 *
 * Shows additions, modifications, and removals as highlighted text,
 * similar to standard code diff viewers.
 *
 * DIFF STRUCTURE:
 * Array<{
 *   type: 'added' | 'removed' | 'unchanged' | 'skip',
 *   content: string,
 *   count?: number  // for skip type
 * }>
 */

import React from 'react';

/**
 * DiffView - Text-based diff display with inline highlighting
 *
 * @param {Object} props
 * @param {Array<{type: string, content: string, count?: number}>} props.diff - Diff segments
 * @returns {React.ReactElement}
 */
const DiffView = ({ diff }) => {
  if (!diff || diff.length === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-4">
        No changes to display
      </div>
    );
  }

  // Count statistics
  const stats = {
    added: diff.filter(d => d.type === 'added').length,
    removed: diff.filter(d => d.type === 'removed').length,
    unchanged: diff.filter(d => d.type === 'unchanged').length,
  };

  return (
    <div className="space-y-2">
      {/* Stats header */}
      <div className="flex gap-3 text-xs px-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-green-700 font-medium">+{stats.added}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-red-700 font-medium">−{stats.removed}</span>
        </div>
        {stats.unchanged > 0 && (
          <div className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full" />
            <span className="text-gray-600">{stats.unchanged} unchanged</span>
          </div>
        )}
      </div>

      {/* Diff content */}
      <div className="bg-gray-50 rounded p-3 font-mono text-sm leading-relaxed">
        {diff.map((item, idx) => (
          <DiffSegment key={idx} item={item} />
        ))}
      </div>
    </div>
  );
};

/**
 * Individual diff segment with appropriate styling
 * @param {{item: {type: string, content: string, count?: number}}} props
 * @returns {React.ReactElement}
 */
function DiffSegment({ item }) {
  switch (item.type) {
    case 'added':
      return (
        <div className="bg-green-100 text-green-900 px-2 py-0.5 my-0.5 rounded-sm border-l-2 border-green-500">
          <span className="text-green-600 font-semibold mr-2">+</span>
          {item.content}
        </div>
      );

    case 'removed':
      return (
        <div className="bg-red-100 text-red-900 px-2 py-0.5 my-0.5 rounded-sm border-l-2 border-red-500 line-through opacity-80">
          <span className="text-red-600 font-semibold mr-2">−</span>
          {item.content}
        </div>
      );

    case 'unchanged':
      return (
        <div className="text-gray-600 px-2 py-0.5 my-0.5">
          {item.content}
        </div>
      );

    case 'skip':
      return (
        <div className="flex items-center justify-center my-1 px-2 py-1 text-gray-500 text-xs">
          <span className="flex-1 border-t border-gray-300" />
          <span className="px-2">⋯ {item.count} unchanged lines ⋯</span>
          <span className="flex-1 border-t border-gray-300" />
        </div>
      );

    default:
      return null;
  }
}

/**
 * Get summary of diff changes
 * @param {Array<{type: string, content: string, count?: number}>} diff
 * @returns {string}
 */
export function getDiffSummary(diff) {
  if (!diff || diff.length === 0) return 'No changes';

  const added = diff.filter(d => d.type === 'added').length;
  const removed = diff.filter(d => d.type === 'removed').length;

  const parts = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`−${removed}`);

  return parts.length > 0 ? parts.join(' ') : 'No changes';
}

export default DiffView;