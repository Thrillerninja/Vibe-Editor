import React, { useMemo, useRef } from 'react';
import { EMOTION_AXES, EMOTION_COLORS } from '../../utils/constants';
import { normalizeEmotionProfile } from '../../utils/emotionProfiles';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const toPct = (v) => Math.max(0, Math.min(100, Math.round(v)));

export default function EmotionRadar({
  profile,
  onChange,
  size = 260,
  label = 'Emotion profile',
}) {
  const normalized = useMemo(() => normalizeEmotionProfile(profile), [profile]);
  const center = size / 2;
  const padding = 38;
  const radius = center - padding;
  const axes = EMOTION_AXES;
  const draggingAxis = useRef(null);

  const points = useMemo(() => {
    return axes.map((axis, idx) => {
      const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2; // start at top
      const r = (normalized[axis] / 100) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { axis, angle, x, y };
    });
  }, [axes, normalized, center, radius]);

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(' ');

  const updateAxisValue = (idx, clientX, clientY) => {
    const { angle, axis } = points[idx];
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = clientX - (rect.left + center);
    const dy = clientY - (rect.top + center);
    // project onto axis direction
    const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
    const value = toPct(clamp01(proj / radius) * 100);
    const next = { ...normalized, [axis]: value };
    onChange?.(next);
  };

  const svgRef = useRef(null);

  const handlePointerDown = (idx, e) => {
    e.preventDefault();
    draggingAxis.current = idx;
    const move = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev;
      updateAxisValue(idx, pt.clientX, pt.clientY);
    };
    const up = () => {
      draggingAxis.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
  };

  return (
    <div style={{ width: size, margin: '0 auto' }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6, textAlign: 'center' }}>
        {label}
      </div>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        role="application"
        aria-label="Emotion radar"
        style={{ touchAction: 'none', userSelect: 'none' }}
      >
        {/* grid rings */}
        {[0.25, 0.5, 0.75, 1].map((r, idx) => (
          <circle
            key={idx}
            cx={center}
            cy={center}
            r={radius * r}
            fill="none"
            stroke="#e5e7eb"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        ))}

        {/* axes */}
        {points.map((p, idx) => (
          <line
            key={p.axis}
            x1={center}
            y1={center}
            x2={p.x + (p.x - center) * 0.05}
            y2={p.y + (p.y - center) * 0.05}
            stroke="#d1d5db"
            strokeWidth={1}
          />
        ))}

        {/* filled polygon */}
        <polygon
          points={polygonPath}
          fill="#2563eb22"
          stroke="#2563eb"
          strokeWidth={2}
        />

        {/* handles */}
        {points.map((p, idx) => {
          const color = EMOTION_COLORS[p.axis]?.strong || '#2563eb';
          const isEditable = onChange !== null && onChange !== undefined;
          return (
            <g key={p.axis}>
              <circle
                cx={p.x}
                cy={p.y}
                r={8}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                onMouseDown={isEditable ? (e) => handlePointerDown(idx, e) : undefined}
                onTouchStart={isEditable ? (e) => handlePointerDown(idx, e) : undefined}
                style={{ cursor: isEditable ? 'pointer' : 'default' }}
              />
              <text
                x={center + (radius + 14) * Math.cos(p.angle)}
                y={center + (radius + 14) * Math.sin(p.angle)}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 13, fontWeight: 500, fill: '#111827' }}
              >
                {p.axis}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 13, color: '#4b5563', marginTop: 8, textAlign: 'center' }}>
        {axes.map((axis) => `${axis}: ${normalized[axis]}`).join(' · ')}
      </div>
    </div>
  );
}
