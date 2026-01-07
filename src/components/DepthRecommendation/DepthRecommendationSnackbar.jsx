import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Snackbar component that recommends depth changes based on text length
 * @param {Object} props
 * @param {boolean} props.isVisible - Whether the snackbar should be visible
 * @param {number} props.recommendedDepth - The recommended depth value
 * @param {number} props.currentDepth - The current depth value
 * @param {Function} props.onAccept - Callback when user accepts recommendation
 * @param {Function} props.onDismiss - Callback when user dismisses notification
 */
export default function DepthRecommendationSnackbar({
    isVisible,
    recommendedDepth,
    currentDepth,
    onAccept,
    onDismiss,
}) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.98 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        left: '0',
                        right: '0',
                        margin: '0 auto',
                        width: 'fit-content',
                        background: 'rgba(255, 255, 255, 0.85)',
                        border: '1px solid rgba(229, 231, 235, 0.8)',
                        borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
                        padding: '12px 16px',
                        zIndex: 1000,
                        maxWidth: '90vw',
                        backdropFilter: 'saturate(180%) blur(12px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                    }}
                >
                    {/* Icon */}
                    <div style={{
                        flexShrink: 0,
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: '#f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4b5563',
                    }}>
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                    </div>

                    {/* Text Content */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#111827',
                            letterSpacing: '-0.01em',
                        }}>
                            New hierarchy depth recommended
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: '#6b7280',
                        }}>
                            Based on your sentence count, we recommend switching to depth <strong>{recommendedDepth}</strong>.
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        paddingLeft: '8px',
                        borderLeft: '1px solid #e5e7eb',
                        marginLeft: '4px',
                    }}>
                        <button
                            onClick={onDismiss}
                            style={{
                                padding: '8px 12px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#6b7280',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                                e.currentTarget.style.color = '#374151';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#6b7280';
                            }}
                        >
                            Later
                        </button>
                        <button
                            onClick={onAccept}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: 'white',
                                background: '#111827',
                                border: '1px solid transparent',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#000000';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#111827';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                            }}
                        >
                            Update Depth
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
