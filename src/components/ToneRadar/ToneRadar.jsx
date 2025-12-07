import { motion } from 'framer-motion';
import { useState } from 'react';

export function ToneRadarChart({ values, onChange, className = '' }) {
    const [draggingAxis, setDraggingAxis] = useState(null);

    // Define bipolar axes (each axis goes through center)
    const axes = [
        { positive: 'Formal', negative: 'Casual', angle: 0 },
        { positive: 'Serious', negative: 'Funny', angle: 45 },
        { positive: 'Respectful', negative: 'Irreverent', angle: 90 },
        { positive: 'Matter-of-Fact', negative: 'Enthusiastic', angle: 135 },
    ];

    const centerX = 200;
    const centerY = 200;
    const maxRadius = 140;
    const chartRadius = 400;

    // Convert value (0-100) to position along axis
    const getPointPosition = (axisIndex, value) => {
        const axis = axes[axisIndex];
        const angleRad = (axis.angle * Math.PI) / 180;

        // Map value: 0 = negative end, 50 = center, 100 = positive end
        const distance = ((value - 50) / 50) * maxRadius;

        return {
            x: centerX + distance * Math.cos(angleRad),
            y: centerY + distance * Math.sin(angleRad),
        };
    };

    // Convert drag position to value (0-100)
    const getValueFromPosition = (axisIndex, clientX, clientY, svgElement) => {
        const rect = svgElement.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * chartRadius;
        const y = ((clientY - rect.top) / rect.height) * chartRadius;

        const axis = axes[axisIndex];
        const angleRad = (axis.angle * Math.PI) / 180;

        // Project point onto axis
        const dx = x - centerX;
        const dy = y - centerY;
        const projection =
            dx * Math.cos(angleRad) + dy * Math.sin(angleRad);

        // Clamp to axis length and convert to 0-100
        const clampedProjection = Math.max(
            -maxRadius,
            Math.min(maxRadius, projection)
        );
        const value = ((clampedProjection / maxRadius) * 50) + 50;

        return Math.round(value);
    };

    const handleDrag = (axisIndex, event, info) => {
        const svgElement = event.target.closest('svg');
        if (!svgElement) return;

        const newValue = getValueFromPosition(
            axisIndex,
            info.point.x,
            info.point.y,
            svgElement
        );

        const newValues = { ...values, [axisIndex]: newValue };
        onChange(newValues);
    };

    // Generate polygon path from values
    const getPolygonPath = () => {
        const points = axes.map((_, i) => {
            const pos = getPointPosition(i, values[i] || 50);
            return `${pos.x},${pos.y}`;
        });
        return `M ${points.join(' L ')} Z`;
    };

    return (
        <div className={`relative ${className}`}>
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${chartRadius} ${chartRadius}`}
                className="overflow-visible"
            >
                {/* Background circles */}
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                    <circle
                        key={scale}
                        cx={centerX}
                        cy={centerY}
                        r={maxRadius * scale}
                        fill="none"
                        stroke="rgb(229 231 235)"
                        strokeWidth="1"
                        opacity={0.5}
                    />
                ))}

                {/* Axis lines */}
                {axes.map((axis, i) => {
                    const angleRad = (axis.angle * Math.PI) / 180;
                    const x1 = centerX - maxRadius * Math.cos(angleRad);
                    const y1 = centerY - maxRadius * Math.sin(angleRad);
                    const x2 = centerX + maxRadius * Math.cos(angleRad);
                    const y2 = centerY + maxRadius * Math.sin(angleRad);

                    return (
                        <g key={i}>
                            {/* Axis line */}
                            <line
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke="rgb(209 213 219)"
                                strokeWidth="2"
                            />

                            {/* Negative label */}
                            <text
                                x={x1 - 10 * Math.cos(angleRad)}
                                y={y1 - 10 * Math.sin(angleRad)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-xs font-medium fill-gray-600"
                            >
                                {axis.negative}
                            </text>

                            {/* Positive label */}
                            <text
                                x={x2 + 10 * Math.cos(angleRad)}
                                y={y2 + 10 * Math.sin(angleRad)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="text-xs font-medium fill-gray-600"
                            >
                                {axis.positive}
                            </text>
                        </g>
                    );
                })}

                {/* Filled polygon */}
                <motion.path
                    d={getPolygonPath()}
                    fill="rgb(59 130 246)"
                    fillOpacity="0.2"
                    stroke="rgb(59 130 246)"
                    strokeWidth="2"
                    initial={false}
                    animate={{ d: getPolygonPath() }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />

                {/* Draggable points */}
                {axes.map((axis, i) => {
                    const pos = getPointPosition(i, values[i] || 50);
                    const isDragging = draggingAxis === i;

                    return (
                        <motion.circle
                            key={i}
                            cx={pos.x}
                            cy={pos.y}
                            r={isDragging ? 10 : 8}
                            fill="rgb(59 130 246)"
                            stroke="white"
                            strokeWidth="2"
                            className="cursor-grab active:cursor-grabbing"
                            drag
                            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                            dragElastic={0}
                            dragMomentum={false}
                            onDragStart={() => setDraggingAxis(i)}
                            onDrag={(event, info) => handleDrag(i, event, info)}
                            onDragEnd={() => setDraggingAxis(null)}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.95 }}
                            animate={{ cx: pos.x, cy: pos.y }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                    );
                })}

                {/* Center dot */}
                <circle
                    cx={centerX}
                    cy={centerY}
                    r="4"
                    fill="rgb(107 114 128)"
                    opacity="0.5"
                />
            </svg>
        </div>
    );
};