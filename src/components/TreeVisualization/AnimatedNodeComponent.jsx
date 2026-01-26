/**
 * @fileoverview AnimatedNodeComponent - Tree node visualization with emotion editing
 *
 * Renders individual tree nodes with double-click editing dialog.
 * Handles content editing, emotion profile selection, and subtree modifications.
 * Supports markdown rendering, suggestion cycling, and rewrite options via Claude API.
 *
 * Uses the new unified Node emotion system:
 * - emotion.profile: EmotionProfile (10-axis DES)
 * - emotion.dominantEmotion: string (primary emotion name)
 * - emotion.dominantIntensity: number (0-100)
 * - emotion.source: 'manual' | 'ai' | 'aggregated'
 * - emotion.timestamp: ISO datetime string
 *
 * @typedef {import('../../types/node.js').Node} TreeNode
 * @typedef {import('../../types/node.js').NodeEmotion} NodeEmotion
 * @typedef {import('../../types/node.js').SemanticStructure} SemanticStructure
 * @typedef {import('../../types/node.js').InlineElement} InlineElement
 * @typedef {import('../../types/node.js').TextRepresentation} TextRepresentation
 * @typedef {import('../../types/node.js').OperationalMetadata} OperationalMetadata
 * @typedef {import('./animatedNodeComponentHelpers.jsx').LeafEntry} LeafEntry
 */

import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { EMOTION_LABELS } from '@utils/constants';
import { createEmptyEmotionProfile } from '../../types/node.js';

import '@components/TreeVisualization/TreeNode.css';
import { NewEmotionEditDialog } from '@components/EmotionSelector/NewEmotionEditDialog.jsx'
import { getSecondaryEmotionTooltip } from '@utils/secondaryEmotios.js';
import { getBorderColor, getEmotionColor, getSignificantEmotions } from './animatedNodeComponentHelpers.js';
import { renderNodeContent } from './animatedNodeComponentRenderers.jsx';

/**
 * AnimatedNodeComponent - Renders a single tree node with editing capabilities
 *
 * Features:
 * - Double-click to open edit dialog
 * - Content editing with Claude-powered suggestions
 * - Emotion profile adjustment with visual radar
 * - Subtree editing for group nodes
 * - Markdown rendering with full link/list/code support
 * - Dirty state tracking and visual indicators
 *
 * @param {Object} props - Component props
 * @param {string} props.id - Node UUID
 * @param {Object} props.data - Node data (new unified Node type)
 * @param {string} props.data.content - Node text content
 * @param {'sentence'|'heading'|'list-item'|'code-block'|'blockquote'|'horizontal-rule'|'root'|'group'} props.data.type - Node type (sentence|heading|list-item|etc)
 * @param {SemanticStructure} [props.data.structure] - Type-specific structure
 * @param {InlineElement[]} [props.data.formatting] - Links, bold, italic, etc.
 * @param {TextRepresentation} [props.data.textRep] - How it appears in text
 * @param {NodeEmotion} [props.data.emotion] - Emotion metadata
 * @param {OperationalMetadata} [props.data.metadata] - Operational metadata
 * @param {object} props.data.metadata
 * @param {boolean} [props.data.metadata.isDirty] - Needs regeneration
 * @param {Function} [props.data.applyNodeEdit] - Edit handler
 * @param {Function} [props.data.applySubtreeChanges] - Subtree update handler
 * @param {Function} [props.data.deleteNode] - Delete handler
 * @param {Function} [props.data.getDescendantLeaves] - Get leaf nodes
 * @returns {React.ReactElement} Rendered node with modal dialog
 */
export function AnimatedNodeComponent({ id, data }) {
  // =========================================================================
  // STATE: Dialog & Visibility
  // =========================================================================

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // =========================================================================
  // STATE: Node Content
  // =========================================================================

  const [nodeModified, setNodeModified] = useState(
    data.metadata?.isDirty ?? false
  );

  // =========================================================================
  // STATE: Debug tooltip
  // =========================================================================

  const [isTooltipEnabled, setIsTooltipEnabled] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================
  // Ensure emotion always exists
  const /** @type {NodeEmotion} */ defaultEmotion = {
    profile: createEmptyEmotionProfile(),
    dominantEmotion: 'interest',
    dominantIntensity: 0,
    source: 'manual',
    timestamp: new Date().toISOString(),
  };

  data.emotion = data.emotion || defaultEmotion;

  const emotionColor = getEmotionColor(data.emotion.dominantEmotion, data.emotion.dominantIntensity, data.type);
  const border = getBorderColor(data.emotion.dominantEmotion, data.emotion.dominantIntensity, data.type);
  
  // Get significant emotions for badge display, excluding the dominant one
  const significantEmotions = getSignificantEmotions(data.emotion.profile, 30)
    .filter(e => e.emotion !== data.emotion.dominantEmotion);

  // =========================================================================
  // EFFECTS: Sync External Data
  // =========================================================================

  /**
   * Sync isDirty flag from data.metadata
   * Watches for external changes to dirty state
   */
  useEffect(() => {
    setNodeModified(data.metadata?.isDirty ?? false);
  }, [data.metadata?.isDirty]);

  // =========================================================================
  // Debug tooltip
  // =========================================================================

  /**
   * Toggle debug hitboxes with F8
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F9') {
        setIsTooltipEnabled((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const tooltipJson = JSON.stringify(
    { id, ...data }, // include id + full data payload
    null,
    3
  );

  const copyTooltipJson = async () => {
    try {
      await navigator.clipboard.writeText(tooltipJson);
    } catch (e) {
      console.error("Failed to copy node JSON:", e);
    }
  };

  const closeTooltipTimerRef = useRef(null);

  const openTooltip = () => {
    if (closeTooltipTimerRef.current) {
      clearTimeout(closeTooltipTimerRef.current);
      closeTooltipTimerRef.current = null;
    }
    setIsTooltipOpen(true);
  };

  const scheduleCloseTooltip = () => {
    if (closeTooltipTimerRef.current) return;
    closeTooltipTimerRef.current = setTimeout(() => {
      closeTooltipTimerRef.current = null;
      setIsTooltipOpen(false);
    }, 30); // 30 ms delay
  };

  useEffect(() => {
    return () => {
      if (closeTooltipTimerRef.current) {
        clearTimeout(closeTooltipTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <motion.div
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        title={"Double-click to edit this node."}
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleCloseTooltip}
        style={{
          padding: 12,
          borderRadius: 24,
          color: "black",
          textAlign: "center",
          cursor: "pointer",
          width: 220,
          background: emotionColor,
          border: nodeModified ? `3px solid ${border}` : '3px solid rgba(255, 255, 255, 0.6)',
          position: 'relative',
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s, transform 0.2s',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: significantEmotions.length > 0 ? 28 : 8,
              paddingTop: 8,
              paddingLeft: 8,
              paddingRight: 32,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: data.type === 'root' ? 600 : 500,
              color: '#000',
              lineHeight: 1.45,
              wordWrap: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              minHeight: 'auto',
              maxHeight: 'none',
            }}
          >
            {renderNodeContent(
              data.content,
              data.type,
              data.structure,
              data.formatting
            )}
          </div>

          {nodeModified && (
            <>
              <div className="modified-indicator" title="This node has been modified.">
                !
              </div>
              {/* SVG based animated border for proper rounded corners */}
              <svg className="animated-border-svg">
                <rect
                  x="3" y="3"
                  style={{
                    width: 'calc(100% - 6px)',
                    height: 'calc(100% - 6px)'
                  }}
                  className="animated-border-rect"
                />
              </svg>
            </>
          )}
          {/* Emotion badges - show additional emotions */}
          {significantEmotions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: -20,
                right: -20,
                display: 'flex',
                gap: 6,
                flexDirection: 'row',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 10,
              }}
              title={significantEmotions
                .map(e => `${EMOTION_LABELS[e.emotion] || e.emotion}: ${e.intensity}%`)
                .join('\n')}
            >
              {significantEmotions.slice(0, 4).map((emotionData, idx) => (
                <div
                  key={emotionData.emotion}
                  title={getSecondaryEmotionTooltip(emotionData.emotion, emotionData.intensity)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: emotionData.color,
                    border: '4px solid #fff',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
                  }}
                />
              ))}
              {significantEmotions.length > 5 && (
                <div
                  title={`${significantEmotions.length - 5} more secondary emotions`}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: '#9ca3af',
                    border: '4px solid #fff',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  +{significantEmotions.length - 5}
                </div>
              )}
            </div>
          )}
        </motion.div>



        {isTooltipEnabled && isTooltipOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: "calc(100% + 10px)",
              zIndex: 999999999999,
              width: 520,
              maxWidth: "80vw",
              overflow: "auto",
              background: "rgba(17, 24, 39, 0.96)", // gray-900
              color: "#e5e7eb", // gray-200
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
              padding: 12,
              pointerEvents: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Node debug tooltip
              </div>

              <button
                onClick={copyTooltipJson}
                style={{
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Copy JSON
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap", // keeps line breaks + wraps long lines
                wordBreak: "break-word",
                fontSize: 14,
                lineHeight: 1.35,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {tooltipJson}
            </pre>
          </div>
        )}

      {isDialogOpen && <NewEmotionEditDialog 
        id={id}
        data={data}
        onClose={() => setIsDialogOpen(false)}
      />}
    </>
  )
}