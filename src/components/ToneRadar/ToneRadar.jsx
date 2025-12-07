import { motion } from 'framer-motion';
import { useState, useRef } from 'react';

export function ToneRadarChart({ values, onChange, className = '' }){
  const [draggingAxis, setDraggingAxis] = useState(null);
  const [isHoveringCenter, setIsHoveringCenter] = useState(false);
  const svgRef = useRef(null);

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
  const ringRadius = 16;
  const hoverRadius = 40;
  const centerThreshold = 5;
  const labelDistance = 14;

  const isClusteredAtCenter = () => {
    const nodesNearCenter = Object.values(values).filter(
      (v) => Math.abs(v - 50) < centerThreshold
    ).length;
    return nodesNearCenter >= 2;
  };

  const shouldShowRing = isHoveringCenter && isClusteredAtCenter();

  const getPointPosition = (axisIndex, value) => {
    const axis = axes[axisIndex];
    const angleRad = (axis.angle * Math.PI) / 180;
    const distance = ((value - 50) / 50) * maxRadius;

    return {
      x: centerX + distance * Math.cos(angleRad),
      y: centerY + distance * Math.sin(angleRad),
    };
  };

  const getRingPosition = (axisIndex) => {
    const axis = axes[axisIndex];
    const angleRad = (axis.angle * Math.PI) / 180;
    return {
      x: centerX + ringRadius * Math.cos(angleRad),
      y: centerY + ringRadius * Math.sin(angleRad),
    };
  };

  const isNodeNearCenter = (axisIndex) => {
    return Math.abs((values[axisIndex] || 50) - 50) < centerThreshold;
  };

  const getValueFromPosition = (axisIndex, clientX, clientY) => {
    if (!svgRef.current) return 50;

    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * chartRadius;
    const y = ((clientY - rect.top) / rect.height) * chartRadius;

    const axis = axes[axisIndex];
    const angleRad = (axis.angle * Math.PI) / 180;

    const dx = x - centerX;
    const dy = y - centerY;
    const projection =
      dx * Math.cos(angleRad) + dy * Math.sin(angleRad);

    const clampedProjection = Math.max(
      -maxRadius,
      Math.min(maxRadius, projection)
    );
    const value = Math.round(((clampedProjection / maxRadius) * 50) + 50);

    return Math.max(0, Math.min(100, value));
  };

  const handleDragStart = (axisIndex) => {
    setDraggingAxis(axisIndex);
  };

  const handleDrag = (axisIndex, event, info) => {
    const newValue = getValueFromPosition(axisIndex, info.point.x, info.point.y);
    const newValues = { ...values, [axisIndex]: newValue };
    onChange(newValues);
  };

  const handleMouseMove = (e) => {
    if (!svgRef.current || draggingAxis !== null) {
      setIsHoveringCenter(false);
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * chartRadius;
    const y = ((e.clientY - rect.top) / rect.height) * chartRadius;

    const distToCenter = Math.sqrt(
      (x - centerX) ** 2 + (y - centerY) ** 2
    );

    setIsHoveringCenter(distToCenter < hoverRadius);
  };

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
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${chartRadius} ${chartRadius}`}
        className="overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setIsHoveringCenter(false)}
      >
        {/* Background circles*/}
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle
            key={scale}
            cx={centerX}
            cy={centerY}
            r={maxRadius * scale}
            fill="none"
            stroke="rgba(0, 0, 0, 0.3)"
            strokeWidth="1"
            strokeDasharray={scale === 1 ? "0, 0" : "4, 4"}
          />
        ))}

        {/* Hover detection circle (invisible) */}
        {isClusteredAtCenter() && (
          <circle
            cx={centerX}
            cy={centerY}
            r={hoverRadius}
            fill="transparent"
            opacity={0}
          />
        )}

        {/* Axis lines*/}
        {axes.map((axis, i) => {
          const angleRad = (axis.angle * Math.PI) / 180;
          const x1 = centerX - maxRadius * Math.cos(angleRad);
          const y1 = centerY - maxRadius * Math.sin(angleRad);
          const x2 = centerX + maxRadius * Math.cos(angleRad);
          const y2 = centerY + maxRadius * Math.sin(angleRad);

          // Label positions at fixed distance from circle edge
          const negX = centerX - (maxRadius + labelDistance + 2*axis.negative.length) * Math.cos(angleRad);
          const negY = centerY - (maxRadius + labelDistance) * Math.sin(angleRad);
          const posX = centerX + (maxRadius + labelDistance + 2*axis.positive.length) * Math.cos(angleRad);
          const posY = centerY + (maxRadius + labelDistance) * Math.sin(angleRad);

          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth="2"
              />

              <text
                x={negX}
                y={negY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-medium"
                style={{
                  fill: 'rgba(55, 65, 81, 0.7)',
                  textShadow: '0 1px 2px rgba(255, 255, 255, 0.7)',
                  fontSize: '11px',
                }}
              >
                {axis.negative}
              </text>

              <text
                x={posX}
                y={posY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs font-medium"
                style={{
                  fill: 'rgba(55, 65, 81, 0.7)',
                  textShadow: '0 1px 2px rgba(255, 255, 255, 0.7)',
                  fontSize: '11px',
                }}
              >
                {axis.positive}
              </text>
            </g>
          );
        })}

        {/* Filled polygon */}
        <motion.path
          d={getPolygonPath()}
          fill="rgb(59, 130, 246)"
          fillOpacity="0.15"
          stroke="rgb(59, 130, 246)"
          strokeWidth="2"
          initial={false}
          animate={{ d: getPolygonPath() }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />

        {/* Draggable handles */}
        {axes.map((axis, i) => {
          const actualPos = getPointPosition(i, values[i] || 50);
          const ringPos = getRingPosition(i);

          const isThisNodeNearCenter = isNodeNearCenter(i);
          const displayPos =
            shouldShowRing && isThisNodeNearCenter ? ringPos : actualPos;

          const isActive = draggingAxis === i;

          return (
            <motion.circle
              key={i}
              cx={displayPos.x}
              cy={displayPos.y}
              r={isActive ? 9 : 7}
              fill="rgb(59, 130, 246)"
              stroke="white"
              strokeWidth="2"
              style={{
                boxShadow: 'rgba(0, 0, 0, 0.1)',
                filter: 'drop-shadow(2px 2px 3px rgba(0, 0, 0, 0.1))',
                cursor: 'grab',
              }}
              className="active:cursor-grabbing"
              drag
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0}
              dragMomentum={false}
              onDragStart={() => handleDragStart(i)}
              onDrag={(event, info) => handleDrag(i, event, info)}
              onDragEnd={() => setDraggingAxis(null)}
              whileHover={{ scale: 1.3 }}
              whileTap={{ scale: 0.95 }}
              animate={{ cx: displayPos.x, cy: displayPos.y }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          );
        })}

        {/* Center indicator dot */}
        <circle
          cx={centerX}
          cy={centerY}
          r="3"
          fill="rgba(107, 114, 128, 0.5)"
        />
      </svg>

      {/* Hint text */}
      {isClusteredAtCenter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-center mt-3 text-xs"
          style={{
            color: 'rgba(55, 65, 81, 0.6)',
          }}
        >
          Hover near center to spread
        </motion.div>
      )}
    </div>
  );
};