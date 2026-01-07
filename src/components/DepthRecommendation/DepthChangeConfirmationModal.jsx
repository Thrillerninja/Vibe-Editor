import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Modal to confirm depth change and warn about regeneration
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {number} props.currentDepth - The current depth
 * @param {number} props.newDepth - The recommended new depth
 * @param {Function} props.onConfirm - Callback for confirmation
 * @param {Function} props.onCancel - Callback for cancellation
 */
export default function DepthChangeConfirmationModal({
    isOpen,
    currentDepth,
    newDepth,
    onConfirm,
    onCancel,
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.2)', // Lighter backdrop
                            zIndex: 1100,
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onClick={onCancel}
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            margin: 'auto',
                            height: 'fit-content',
                            width: '420px',
                            maxWidth: '90vw',
                            background: 'rgba(255, 255, 255, 0.9)', // Glassy background
                            backdropFilter: 'saturate(180%) blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            borderRadius: '24px', // More rounded
                            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                            zIndex: 1101,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header & Body Content */}
                        <div style={{ padding: '32px 32px 24px 32px' }}>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: 600,
                                color: '#111827',
                                margin: '0 0 8px 0',
                                letterSpacing: '-0.02em',
                            }}>
                                Update hierarchy depth?
                            </h2>

                            <p style={{
                                fontSize: '15px',
                                color: '#6B7280',
                                lineHeight: '1.6',
                                margin: '0 0 24px 0',
                            }}>
                                You are confirming a change from level <strong>{currentDepth}</strong> to <strong>{newDepth}</strong>. This helps organize your {newDepth > currentDepth ? 'growing' : ''} content better.
                            </p>

                            {/* Warning Card */}
                            <div style={{
                                background: 'rgba(243, 244, 246, 0.6)',
                                borderRadius: '12px',
                                padding: '16px',
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'flex-start',
                                border: '1px solid rgba(0,0,0,0.04)',
                            }}>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#ec4899"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ marginTop: '2px', flexShrink: 0 }}
                                >
                                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.5' }}>
                                    <strong style={{ color: '#1f2937', fontWeight: 600 }}>Effect on content</strong><br />
                                    This action will trigger a full regeneration of your document's hierarchy structure.
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div style={{
                            padding: '0 32px 32px 32px',
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end',
                        }}>
                            <button
                                onClick={onCancel}
                                style={{
                                    padding: '10px 18px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#6B7280',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s',
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#111827'}
                                onMouseLeave={(e) => e.target.style.color = '#6B7280'}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                style={{
                                    padding: '10px 20px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'white',
                                    background: '#111827',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                    transition: 'transform 0.1s, box-shadow 0.1s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                Regenerate Hierarchy
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}