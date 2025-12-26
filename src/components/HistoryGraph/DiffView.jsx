import React from 'react';

/**
 * DiffView Component
 * Displays changes inline as continuous text with highlighting
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
 * Individual diff segment rendered inline
 */
const DiffSegment = ({ item }) => {
    switch (item.type) {
        case 'added':
            return (
                <span className="bg-green-200 text-green-900 px-1 rounded">
                    {item.content}
                </span>
            );

        case 'removed':
            return (
                <span className="bg-red-200 text-red-900 line-through px-1 rounded">
                    {item.content}
                </span>
            );

        case 'unchanged':
            return (
                <span className="text-gray-700">
                    {item.content}
                </span>
            );

        case 'skip':
            return (
                <span className="inline-flex items-center mx-2 px-2 py-1 bg-gray-100 rounded text-xs text-gray-500 italic">
                    ⋯ {item.count} unchanged {item.count === 1 ? 'sentence' : 'sentences'} ⋯
                </span>
            );

        default:
            return null;
    }
};

export default DiffView;
