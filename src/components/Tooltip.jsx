import React, { useState } from 'react';

export function Tooltip({ content, children, position = 'top' }) {
    const [isVisible, setIsVisible] = useState(false);

    // Don't render tooltip wrapper if there's no content
    if (!content) {
        return <>{children}</>;
    }

    return (
        <div
            className="relative"
            style={{ display: 'inline-flex' }}
            onMouseEnter={(e) => {
                e.stopPropagation();
                setIsVisible(true);
            }}
            onMouseLeave={(e) => {
                e.stopPropagation();
                setIsVisible(false);
            }}
        >
            {children}
            {isVisible && (
                <div
                    className="absolute z-50 px-3 py-2 text-xs font-medium text-white bg-black bg-opacity-90 rounded shadow-lg pointer-events-none"
                    style={{
                        ...positionStyles[position],
                        whiteSpace: 'pre-line',
                        width: 'max-content',
                        maxWidth: '200px',
                        textAlign: 'center'
                    }}
                >
                    {content}
                    {/* Arrow */}
                    <div
                        className="absolute w-2 h-2 bg-black bg-opacity-90 transform rotate-45"
                        style={arrowStyles[position]}
                    />
                </div>
            )}
        </div>
    );
}

const positionStyles = {
    top: {
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '8px',
    },
    bottom: {
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: '8px',
    },
};

const arrowStyles = {
    top: {
        bottom: '-4px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
    },
    bottom: {
        top: '-4px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
    },
};
