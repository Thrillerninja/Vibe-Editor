import { EMOTION_COLORS, EMOTION_LABELS, EMOTIONS } from "@utils/constants";
import React from "react";
import { useState } from "react";

export function EmotionsLegend() {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div
            aria-label="Emotion legend"
            style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                background: "rgba(255, 255, 255, 0.9)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
                borderRadius: "24px",
                boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 15px rgba(0,0,0,0.05)",
                padding: '12px 16px',
                zIndex: 35,
                fontSize: '13px',
                color: '#111827',
                width: 'auto',
                cursor: 'pointer',
                transition: 'width 0.3s ease'
            }}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isExpanded ? 8 : 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>DES Emotions Legend</div>
                <div style={{
                    transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform 0.3s ease',
                    marginLeft: 8,
                    color: '#6b7280',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            <div style={{
                maxHeight: isExpanded ? '300px' : '0px',
                opacity: isExpanded ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease, opacity 0.2s ease',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 10,
                rowGap: 8
            }}>
                {[
                    EMOTIONS.INTEREST,
                    EMOTIONS.JOY,
                    EMOTIONS.SURPRISE,
                    EMOTIONS.SADNESS,
                    EMOTIONS.ANGER,
                    EMOTIONS.DISGUST,
                    EMOTIONS.CONTEMPT,
                    EMOTIONS.FEAR,
                    EMOTIONS.SHAME,
                    EMOTIONS.GUILT,
                ].map((key) => {
                    const swatch = EMOTION_COLORS[key]?.medium || '#e5e7eb';
                    const label = EMOTION_LABELS[key] || key;
                    return (
                        <React.Fragment key={key}>
                            <span
                                aria-hidden
                                style={{
                                    display: 'inline-block',
                                    width: 14,
                                    height: 14,
                                    borderRadius: 4,
                                    background: swatch,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    marginTop: 2,
                                }}
                            />
                            <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
