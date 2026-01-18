import React, { useRef, useMemo } from "react";
import {
  angleToPlutchikLabel,
  labelToAngleDeg,
  clamp01,
  angleToPlutchikColor,
  PLUTCHIK_COLORS
} from "./plutchikMapping";
import { EMOTION_LABELS, EMOTION_COLORS } from "@utils/constants";

export default function EmotionPad({
  size = 320,
  emotion,
  intensityPercent,
  onChange,
  backgroundImage,
}) {
  // Check if emotion is valid, otherwise default to center (no emotion)
  const isValidEmotion = emotion && labelToAngleDeg(emotion) !== null;
  const initialAngle = isValidEmotion
    ? (labelToAngleDeg(emotion) * Math.PI) / 180
    : 0;

  const [currentAngleRad, setCurrentAngleRad] = React.useState(initialAngle);
  const ref = useRef(null);
  const radius = size / 2;
  const innerPadding = 12;
  const maxR = radius - innerPadding;

  // Compute dot position from current emotion + intensity
  const point = useMemo(() => {
    const angleDeg = labelToAngleDeg(emotion);

    // If emotion is invalid or not set, place dot at center
    if (angleDeg === null) {
      return { x: radius, y: radius };
    }

    const angleRad = (angleDeg * Math.PI) / 180;
    const r = (clamp01(intensityPercent / 100) || 0) * maxR;
    const cx = radius;
    const cy = radius;
    const x = cx + r * Math.cos(angleRad);
    const y = cy - r * Math.sin(angleRad);
    return { x, y };
  }, [emotion, intensityPercent, maxR, radius]);

  const handlePointer = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = clientX - cx;
    const dy = clientY - cy;

    const rPix = Math.sqrt(dx * dx + dy * dy);
    const angleRad = Math.atan2(-dy, dx);
    const rClamped = Math.min(rPix, maxR);

    const label = angleToPlutchikLabel(angleRad);
    const intensity = clamp01(rClamped / maxR) * 100;

    setCurrentAngleRad(angleRad);

    onChange({ label, intensityPercent: Math.round(intensity) });
  };

  const dotColor = useMemo(() => {
    intensityPercent > 5 ?
    angleToPlutchikColor(-currentAngleRad - 1.5708) // Switch to +90° ~+1.5708 to align dot color with background color
    :
    "#000";
  }, [currentAngleRad]);

  const onMouseDown = (e) => {
    e.preventDefault();
    handlePointer(e.clientX, e.clientY);

    const move = (ev) => handlePointer(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    handlePointer(t.clientX, t.clientY);

    const move = (ev) => {
      if (ev.touches.length === 0) return;
      const tt = ev.touches[0];
      handlePointer(tt.clientX, tt.clientY);
    };
    const end = () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  };

  const ringColor = EMOTION_COLORS[emotion]?.medium || "#d1d5db";

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        margin: "0 auto",
        boxSizing: "border-box",
        touchAction: "none",
        userSelect: "none",
        overflow: "hidden",
        border: `2px solid ${ringColor}`,
        backgroundColor: "#fff",
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      aria-label="Plutchik-Emotionsrad"
      role="application"
    >
      {/* Optional helper rings (very subtle on top of image) */}
      {[0.28, 0.55, 0.76, 0.95].map((r, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: radius - r * maxR,
            top: radius - r * maxR,
            width: r * maxR * 2,
            height: r * maxR * 2,
            borderRadius: "50%",
            border: `1px dashed rgba(0,0,0,0.3)`,
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Optional sector labels (can be removed if the image already has text) */}
      {/* {PLUTCHIK_ORDER.map((lab, idx) => {
        const ang = ((idx * 45) * Math.PI) / 180;
        const x = radius + (maxR + 6) * Math.cos(ang);
        const y = radius - (maxR + 6) * Math.sin(ang);
        return (
          <div
            key={lab}
            style={{
              position: "absolute",
              left: x - 16,
              top: y - 8,
              width: 32,
              textAlign: "center",
              fontSize: 10,
              color: "rgba(17,24,39,0.6)",
              textShadow: "0 1px 2px rgba(255,255,255,0.7)",
              pointerEvents: "none",
            }}
          >
            {EMOTION_LABELS[lab] ?? lab}
          </div>
        );
      })} */}

      {/* Draggable dot */}
      <div
        style={{
          position: "absolute",
          left: point.x - 8,
          top: point.y - 8,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: dotColor,
          border: "2px solid white",
          boxShadow: "2px 2px 3px rgba(0,0,0,5)",
          pointerEvents: "none",
          borderColor: "#000000ff"
        }}
      />
    </div>
  );
}