/**
 * @fileoverview DiffView Component - Text-based diff with inline highlighting
 *
 * Shows additions, modifications, and removals as highlighted text,
 * similar to standard code diff viewers.
 *
 * DIFF STRUCTURE:
 * Array<DiffItem>
 */

/**
 * @typedef {{ type: 'added' | 'removed' | 'unchanged'; content: string } | { type: 'skip'; count: number }} DiffItem
 */

import React from 'react';

/**
 * DiffView - Text-based diff display with inline highlighting
 *
 * @param {Object} props
 * @param {DiffItem[]} props.diff - Diff segments
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

    return (
        <div className="text-sm leading-relaxed">
            {diff.map((item, idx) => (
                <DiffSegment key={idx} item={item} />
            ))}
        </div>
    );
};


/**
 * Individual diff segment with appropriate styling
 * @param {{item: DiffItem}} props
 * @returns {React.ReactElement}
 */
const DiffSegment = ({ item }) => {
    switch (item.type) {
        case 'added':
            return (
                <div className="bg-green-100 text-green-900 px-2 py-1 rounded mb-1">
                    + {item.content}
                </div>
            );

        case 'removed':
            return (
                <div className="bg-red-100 text-red-900 px-2 py-1 rounded mb-1 line-through">
                    − {item.content}
                </div>
            );

        case 'modified':
            return (
                <div className="px-2 py-1 rounded mb-1">
                    {item.diff
                        .filter(wordItem => wordItem.content.trim()) // Filter out empty/whitespace
                        .map((wordItem, idx, arr) => (
                            <span key={idx}>
                                {wordItem.type === 'added' && (
                                    <span className="bg-green-200 text-green-900 rounded px-1">
                                        {wordItem.content}
                                    </span>
                                )}
                                {wordItem.type === 'removed' && (
                                    <span className="bg-red-200 text-red-900 line-through rounded px-1">
                                        {wordItem.content}
                                    </span>
                                )}
                                {wordItem.type === 'unchanged' && (
                                    <span className="text-gray-700">
                                        {wordItem.content}
                                    </span>
                                )}
                                {/* Add space after word if not the last item */}
                                {idx < arr.length - 1 && <span> </span>}
                            </span>
                        ))}
                </div>
            );

        case 'unchanged':
            return (
                <div className="text-gray-700 px-2 py-1 mb-1">
                    {item.content}
                </div>
            );

        case 'skip':
            return (
                <div className="inline-flex items-center mx-2 px-2 py-1 bg-gray-100 rounded text-xs text-gray-500 italic">
                    ⋯ {item.count} unchanged {item.count === 1 ? 'sentence' : 'sentences'} ⋯
                </div>
            );

        default:
            return null;
    }
};

export default DiffView;