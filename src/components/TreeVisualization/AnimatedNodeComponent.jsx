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
 */

import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';
import { EMOTION_COLORS } from '../../utils/constants';
import EmotionRadar from '../EmotionSelector/EmotionRadar.jsx';
import { createEmptyEmotionProfile } from '../../types/node.js';
import '../../components/TreeVisualization/TreeNode.css';

// ============================================================================
// TYPE DEFINITIONS & CONSTANTS
// ============================================================================

/**
 * @typedef {Object} LeafEntry
 * @property {string} id - Leaf node ID
 * @property {string} original - Original content
 * @property {string[]} options - Rewrite suggestions
 * @property {number} selectedIdx - Currently selected option index
 * @property {string} editedText - Edited content text
 */

/**
 * @typedef {Object} NodeEmotion
 * @property {Object} profile - 10-axis emotion profile
 * @property {string} [dominantEmotion] - Primary emotion name
 * @property {number} [dominantIntensity] - Intensity 0-100
 * @property {'manual'|'ai'|'aggregated'} [source] - Assignment source
 * @property {string} [timestamp] - ISO timestamp
 */

// ============================================================================
// EMOTION COLOR UTILITIES
// ============================================================================

/**
 * Get node background color based on emotion and intensity
 * Uses the new emotion profile system for consistent color mapping
 *
 * @param {string|null} emotion - Emotion name (e.g., 'joy', 'sadness')
 * @param {number} intensity - Intensity level [0-100]
 * @param {string} type - Node type ('sentence'|'heading'|'root'|'group')
 * @returns {string} CSS hex color value
 *
 * @example
 * getEmotionColor('joy', 75, 'sentence') // returns medium-intensity joy color
 */
function getEmotionColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  if (!colors) return '#ffffff';

  if (typeof intensity === 'number') {
    if (intensity < 33) return colors.light;
    if (intensity < 66) return colors.medium;
    return colors.strong;
  }

  return colors.medium;
}

/**
 * Get node border color based on emotion
 * Provides visual contrast for modified state indicator
 *
 * @param {string|null} emotion - Emotion name
 * @param {number} intensity - Intensity [0-100]
 * @param {string} type - Node type
 * @returns {string} CSS hex color value
 */
function getBorderColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  return colors?.strong || '#222';
}

// ============================================================================
// MARKDOWN RENDERING UTILITIES
// ============================================================================

/**
 * Parse enumeration pattern from text (e.g., "1. content")
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} { number: string, text: string } or null if not enumerated
 */
function parseEnumeration(text) {
  const match = text.match(/^(\d+)\.\s+(.*)$/);
  if (match) {
    return {
      number: match[1],
      text: match[2],
    };
  }
  return null;
}

/**
 * Apply inline formatting elements (bold, italic, links, code, etc.)
 * Processes from end to start to avoid index shifting during replacement
 *
 * @param {string} content - Base content text
 * @param {Array<{
 *   type: 'bold'|'italic'|'code'|'strikethrough'|'link'|'email'|'image',
 *   start: number,
 *   end: number,
 *   url?: string,
 *   alt?: string,
 *   title?: string,
 *   email?: string
 * }>} inlineElements - Array of inline format specifications
 * @returns {string} Markdown-formatted text
 */
function applyInlineElements(content, inlineElements) {
  if (!inlineElements || inlineElements.length === 0) {
    return content;
  }

  // Process from end to start to avoid index shifts
  const sorted = [...inlineElements].sort((a, b) => b.start - a.start);
  let result = content;

  for (const element of sorted) {
    const before = result.substring(0, element.start);
    const text = result.substring(element.start, element.end);
    const after = result.substring(element.end);

    let wrapped = text;

    switch (element.type) {
      case 'bold':
        wrapped = `**${text}**`;
        break;
      case 'italic':
        wrapped = `*${text}*`;
        break;
      case 'code':
        wrapped = `\`${text}\``;
        break;
      case 'strikethrough':
        wrapped = `~~${text}~~`;
        break;
      case 'link': {
        const title = element.title ? ` "${element.title}"` : '';
        wrapped = `[${text}](${element.url}${title})`;
        break;
      }
      case 'email':
        wrapped = `[${text}](mailto:${element.email})`;
        break;
      case 'image': {
        const imgTitle = element.title ? ` "${element.title}"` : '';
        wrapped = `![${element.alt || ''}](${element.url}${imgTitle})`;
        break;
      }
      default:
        wrapped = text;
    }

    result = before + wrapped + after;
  }

  return result;
}

/**
 * Build markdown string from content and structure metadata
 *
 * @param {string} content - Base content text
 * @param {Object} [structure] - Structure metadata
 * @param {number} [structure.headingLevel] - H1-H6 level
 * @param {string} [structure.listType] - 'ordered'|'unordered'|'task'
 * @param {number} [structure.listIndentLevel] - Nesting depth
 * @param {string} [structure.listMarker] - Custom list marker
 * @param {boolean} [structure.taskChecked] - Task checkbox state
 * @param {string} [structure.codeLanguage] - Language identifier
 * @param {number} [structure.quoteDepth] - Blockquote nesting level
 * @param {Array} [inlineElements] - Inline formatting elements
 * @returns {string} Formatted markdown string
 */
function buildMarkdownFromStructure(content, structure, inlineElements) {
  let markdown = applyInlineElements(content, inlineElements);

  if (structure) {
    if (structure.headingLevel) {
      const hashes = '#'.repeat(structure.headingLevel);
      markdown = `${hashes} ${markdown}`;
    } else if (structure.listType) {
      const indent = '  '.repeat(structure.listIndentLevel || 0);
      let marker =
        structure.listMarker ||
        (structure.listType === 'ordered' ? '1.' : '-');

      if (structure.listType === 'task') {
        const checked = structure.taskChecked ? 'x' : ' ';
        markdown = `${indent}- [${checked}] ${markdown}`;
      } else {
        markdown = `${indent}${marker} ${markdown}`;
      }
    } else if (structure.codeLanguage) {
      const fence = '```';
      markdown = `${fence}${structure.codeLanguage}\n${markdown}\n${fence}`;
    } else if (structure.quoteDepth) {
      const prefix = '> '.repeat(structure.quoteDepth);
      markdown = markdown
        .split('\n')
        .map(line => `${prefix}${line}`)
        .join('\n');
    }
  }

  return markdown;
}

/**
 * Render node content with full markdown support
 * Handles links, lists, code blocks, blockquotes, and all inline formatting
 *
 * @param {string} content - Content text
 * @param {string} type - Node type
 * @param {Object} [structure] - Structure metadata
 * @param {Array} [inlineElements] - Inline format elements
 * @returns {React.ReactElement} Rendered markdown content
 */
function renderNodeContent(content, type, structure, inlineElements) {
  const markdown = buildMarkdownFromStructure(
    content,
    structure,
    inlineElements
  );

  return (
    <div
      style={{
        width: '100%',
        lineHeight: 1.4,
      }}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => <span>{children}</span>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
                cursor: 'pointer',
                wordBreak: 'break-all',
              }}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700 }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic' }}>{children}</em>
          ),
          code: ({ children }) => (
            <code
              style={{
                backgroundColor: '#f3f4f6',
                padding: '2px 4px',
                borderRadius: '2px',
                fontSize: '0.9em',
                fontFamily: 'monospace',
              }}
            >
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: '1.5em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: '1.3em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: '1.1em',
                fontWeight: 700,
                margin: '0.3em 0',
              }}
            >
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: '3px solid #3b82f6',
                paddingLeft: '0.8em',
                margin: '0.3em 0',
                fontStyle: 'italic',
                color: '#666',
              }}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul
              style={{
                margin: '0.3em 0',
                paddingLeft: '1.5em',
                listStyleType: 'disc',
                textAlign: 'left',
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              style={{
                margin: '0.3em 0',
                paddingLeft: '1.5em',
                listStyleType: 'decimal',
                textAlign: 'left',
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ margin: '0.2em 0', textAlign: 'left' }}>
              {children}
            </li>
          ),
        }}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

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
 * @param {string} [props.data.label] - Display label (for groups/root)
 * @param {string} props.data.type - Node type (sentence|heading|list-item|etc)
 * @param {NodeEmotion} [props.data.emotion] - Emotion metadata
 * @param {Object} [props.data.metadata] - Operational metadata
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
  const [activeTab, setActiveTab] = useState('information');
  const [isNodeRewriting, setIsNodeRewriting] = useState(false);

  // =========================================================================
  // STATE: Node Content
  // =========================================================================

  const [nodeText, setNodeText] = useState(data.content || data.label || '');
  const [previousText, setPreviousText] = useState(
    data.content || data.label || ''
  );
  const [nodeModified, setNodeModified] = useState(
    data.metadata?.isDirty ?? false
  );

  // =========================================================================
  // STATE: Emotion (Current Node - New System)
  // =========================================================================

  // Initialize from new unified emotion structure
  const initialProfile = data.emotion?.profile ?? createEmptyEmotionProfile();

  const [emotionProfile, setEmotionProfile] = useState(initialProfile);
  const [originalEmotionProfile, setOriginalEmotionProfile] =
    useState(initialProfile);
  const [emotion, setEmotion] = useState(data.emotion?.dominantEmotion || 'interest');
  const [intensity, setIntensity] = useState(
    data.emotion?.dominantIntensity ?? 0
  );
  const [selectedIntensity, setSelectedIntensity] = useState(
    data.emotion?.dominantIntensity ?? 0
  );
  const [previousEmotion, setPreviousEmotion] = useState(emotion);

  // =========================================================================
  // STATE: Suggestions & Variants
  // =========================================================================

  const [suggestions, setSuggestions] = useState([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);

  // =========================================================================
  // STATE: Subtree Editing
  // =========================================================================

  const [subtreeEmotionProfile, setSubtreeEmotionProfile] =
    useState(initialProfile);
  const [subtreeEmotion, setSubtreeEmotion] = useState(
    data.emotion?.dominantEmotion || 'interest'
  );
  const [subtreeIntensity, setSubtreeIntensity] = useState(
    data.emotion?.dominantIntensity ?? 0
  );

  /** @type {[Object<string, LeafEntry>, Function]} */
  const [leafSuggestions, setLeafSuggestions] = useState({});

  /** @type {[string[], Function]} */
  const [leafOrder, setLeafOrder] = useState([]);

  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================

  const emotionColor = getEmotionColor(emotion, intensity, data.type);
  const border = getBorderColor(emotion, intensity, data.type);
  const subtreeEmotionColor = getEmotionColor(
    subtreeEmotion,
    subtreeIntensity,
    data.type
  );
  const modalAccentColor =
    data.type === 'sentence' ? emotionColor : subtreeEmotionColor;

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

  /**
   * Sync emotion profile from data changes
   * Updates all emotion-related state when node emotion data changes
   */
  useEffect(() => {
    const profile = data.emotion?.profile ?? createEmptyEmotionProfile();

    setEmotionProfile(profile);
    setOriginalEmotionProfile(profile);
    setEmotion(data.emotion?.dominantEmotion || 'interest');
    setIntensity(data.emotion?.dominantIntensity ?? 0);
    setSelectedIntensity(data.emotion?.dominantIntensity ?? 0);
    setPreviousEmotion(data.emotion?.dominantEmotion || 'interest');
    setPreviousText(data.content || data.label || '');
    setSubtreeEmotionProfile(profile);
    setSubtreeEmotion(data.emotion?.dominantEmotion || 'interest');
    setSubtreeIntensity(data.emotion?.dominantIntensity ?? 0);
  }, [data.emotion, data.content]);

  // =========================================================================
  // HANDLERS: Sentence Editing
  // =========================================================================

  /**
   * Handle sentence content save
   * Reverts emotion to original if text didn't change
   * Creates new emotion object for new unified system
   */
  const handleSave = () => {
    const textChanged = nodeText !== previousText;
    const finalProfile = textChanged ? emotionProfile : originalEmotionProfile;

    // Create new emotion object with metadata
    const newEmotion = {
      profile: finalProfile,
      dominantEmotion: emotion,
      dominantIntensity: intensity,
      source: 'manual',
      timestamp: new Date().toISOString(),
    };

    if (typeof data.applyNodeEdit === 'function') {
      data.applyNodeEdit(id, nodeText, newEmotion);
    }

    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setIsDialogOpen(false);

    // Delete node if text is empty
    if (nodeText.length === 0 && typeof data.deleteNode === 'function') {
      data.deleteNode(id);
    }
  };

  /**
   * Handle dialog cancellation
   * Reverts all changes to original state
   */
  const handleCancel = () => {
    setEmotionProfile(originalEmotionProfile);
    setEmotion(data.emotion?.dominantEmotion || 'interest');
    setSelectedIntensity(data.emotion?.dominantIntensity ?? 0);
    setNodeText(previousText);
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setLeafSuggestions({});
    setLeafOrder([]);
    setSubtreeEmotionProfile(originalEmotionProfile);
    setSubtreeEmotion(data.emotion?.dominantEmotion || 'interest');
    setSubtreeIntensity(data.emotion?.dominantIntensity ?? 0);
    setIsDialogOpen(false);
  };

  /**
   * Update emotion intensity for sentence
   * Updates the profile with new intensity value
   *
   * @param {number} inputIntensity - New intensity [0-100]
   */
  const setNodeIntensity = (inputIntensity) => {
    setSelectedIntensity(inputIntensity);
    const next = {
      ...emotionProfile,
      [emotion]: inputIntensity,
    };
    setEmotionProfile(next);
  };

  /**
   * Fetch Claude-powered rewrite suggestions
   * Updates emotion profile and fetches 3 alternatives
   */
  const fetchRewriteOptions = async () => {
    if (isNodeRewriting) return;

    setIsNodeRewriting(true);

    try {
      const options = await rewriteSentenceWithEmotionOptions(
        nodeText,
        emotionProfile,
        3
      );
      setSuggestions(options);
      setCurrentSuggestionIndex(0);

      if (options && options.length > 0) {
        setNodeText(options[0]);
      }
    } catch (e) {
      console.error('Failed to get rewrite options:', e);
    }

    setIsNodeRewriting(false);
  };

  /**
   * Cycle to previous suggestion
   */
  const showPrevSuggestion = () => {
    if (!suggestions || suggestions.length === 0) return;

    const newIdx =
      (currentSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    setCurrentSuggestionIndex(newIdx);
    setNodeText(suggestions[newIdx]);
  };

  /**
   * Cycle to next suggestion
   */
  const showNextSuggestion = () => {
    if (!suggestions || suggestions.length === 0) return;

    const newIdx = (currentSuggestionIndex + 1) % suggestions.length;
    setCurrentSuggestionIndex(newIdx);
    setNodeText(suggestions[newIdx]);
  };

  // =========================================================================
  // HANDLERS: Subtree Editing
  // =========================================================================

  /**
   * Update emotion intensity for subtree
   *
   * @param {number} inputIntensity - New intensity [0-100]
   */
  const setSubtreeNodeIntensity = (inputIntensity) => {
    setSubtreeIntensity(inputIntensity);
    const next = {
      ...subtreeEmotionProfile,
      [subtreeEmotion]: inputIntensity,
    };
    setSubtreeEmotionProfile(next);
  };

  /**
   * Load rewrite options for all descendant leaf nodes
   * Fetches Claude suggestions for each leaf using subtree emotion profile
   */
  const fetchSubtreeRewriteOptions = async () => {
    if (isNodeRewriting) return;

    setIsNodeRewriting(true);

    try {
      const leaves =
        typeof data.getDescendantLeaves === 'function'
          ? data.getDescendantLeaves(id)
          : [];

      setLeafOrder(leaves.map(l => l.id));

      const optionsList = await Promise.all(
        leaves.map(async leaf => {
          try {
            const opts = await rewriteSentenceWithEmotionOptions(
              leaf.content,
              subtreeEmotionProfile,
              3
            );

            return {
              id: leaf.id,
              original: leaf.content,
              options: opts || [],
              selectedIdx: opts && opts.length > 0 ? 0 : -1,
              editedText: opts && opts.length > 0 ? opts[0] : leaf.content,
            };
          } catch (e) {
            console.error('Failed to get options for leaf', leaf.id, e);
            return {
              id: leaf.id,
              original: leaf.content,
              options: [],
              selectedIdx: -1,
              editedText: leaf.content,
            };
          }
        })
      );

      const map = {};
      optionsList.forEach(entry => {
        map[entry.id] = entry;
      });
      setLeafSuggestions(map);
    } catch (e) {
      console.error('Failed subtree emotion rewrite:', e);
    }

    setIsNodeRewriting(false);
  };

  /**
   * Cycle leaf node to previous suggestion variant
   *
   * @param {string} leafId - Leaf node ID
   */
  const rotateLeafPrev = (leafId) => {
    const entry = leafSuggestions[leafId];
    if (!entry || !entry.options || entry.options.length === 0) return;

    const newIdx =
      (entry.selectedIdx - 1 + entry.options.length) % entry.options.length;
    setLeafSuggestions(prev => ({
      ...prev,
      [leafId]: {
        ...entry,
        selectedIdx: newIdx,
        editedText: entry.options[newIdx],
      },
    }));
  };

  /**
   * Cycle leaf node to next suggestion variant
   *
   * @param {string} leafId - Leaf node ID
   */
  const rotateLeafNext = (leafId) => {
    const entry = leafSuggestions[leafId];
    if (!entry || !entry.options || entry.options.length === 0) return;

    const newIdx = (entry.selectedIdx + 1) % entry.options.length;
    setLeafSuggestions(prev => ({
      ...prev,
      [leafId]: {
        ...entry,
        selectedIdx: newIdx,
        editedText: entry.options[newIdx],
      },
    }));
  };

  // =========================================================================
  // RENDER: Edit Dialog
  // =========================================================================

  const dialog = isDialogOpen
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '10vh',
            zIndex: 9999999,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              maxWidth: 800,
              width: '90%',
              height: 'auto',
              maxHeight: '80vh',
              border: `3px solid ${modalAccentColor}`,
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              color: '#000',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Tab Header */}
            {!isNodeRewriting && (
              <div
                style={{
                  padding: '0 16px',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  height: 52,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', gap: 16 }}>
                  {['information', 'editing'].map(key => {
                    const label =
                      key === 'information' ? 'Information' : 'Editing';
                    const active = activeTab === key;

                    return (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        style={{
                          appearance: 'none',
                          background: 'transparent',
                          border: 'none',
                          padding: '12px 4px',
                          margin: 0,
                          cursor: 'pointer',
                          color: active ? '#111827' : '#6b7280',
                          fontSize: 14,
                          fontWeight: active ? 600 : 500,
                          position: 'relative',
                          outline: 'none',
                        }}
                      >
                        <span>{label}</span>
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: 2,
                            backgroundColor: active ? '#000000' : 'transparent',
                            borderRadius: 2,
                            transition: 'background-color 120ms ease',
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                <div style={{ flex: 1 }} />

                <button
                  onClick={handleCancel}
                  disabled={isNodeRewriting}
                  style={{
                    appearance: 'none',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    backgroundColor: '#7c7c7cff',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Close
                </button>
              </div>
            )}

            {/* Content Area */}
            {!isNodeRewriting && (
              <div
                style={{
                  overflowY: 'auto',
                  background: '#fff',
                  maxHeight: 'calc(72vh - 52px)',
                }}
              >
                {/* Information Tab */}
                {activeTab === 'information' && (
                  <div
                    style={{
                      padding: '24px 24px 16px 24px',
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.type !== 'sentence' && data.content && (
                        <div>
                          <strong>Title:</strong> {data.label}
                        </div>
                      )}
                      {data.content && (
                        <div>
                          <strong>Content:</strong> {data.content}
                        </div>
                      )}
                      <div>
                        <strong>Emotion:</strong>{' '}
                        {data.type === 'sentence' ? emotion : subtreeEmotion}
                      </div>
                      <div>
                        <strong>Intensity:</strong>{' '}
                        {data.type === 'sentence' ? intensity : subtreeIntensity}
                      </div>
                      {data.emotion?.source && (
                        <div>
                          <strong>Author:</strong> {data.emotion.source}
                        </div>
                      )}
                      {data.emotion?.timestamp && (
                        <div>
                          <strong>Timestamp:</strong>{' '}
                          {new Date(data.emotion.timestamp).toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <EmotionRadar
                        profile={
                          data.type === 'sentence'
                            ? emotionProfile
                            : subtreeEmotionProfile
                        }
                        onChange={null}
                        size={340}
                        label="Current Emotion Profile"
                      />
                    </div>
                  </div>
                )}

                {/* Sentence Editing Tab */}
                {activeTab === 'editing' && data.type === 'sentence' && (
                  <SentenceEditingTab
                    isNodeRewriting={isNodeRewriting}
                    nodeText={nodeText}
                    setNodeText={setNodeText}
                    suggestions={suggestions}
                    currentSuggestionIndex={currentSuggestionIndex}
                    showPrevSuggestion={showPrevSuggestion}
                    showNextSuggestion={showNextSuggestion}
                    fetchRewriteOptions={fetchRewriteOptions}
                    emotionProfile={emotionProfile}
                    setEmotionProfile={setEmotionProfile}
                    emotion={emotion}
                    setEmotion={setEmotion}
                    selectedIntensity={selectedIntensity}
                    setSelectedIntensity={setSelectedIntensity}
                    previousText={previousText}
                    originalEmotionProfile={originalEmotionProfile}
                    handleSave={handleSave}
                    handleCancel={handleCancel}
                    id={id}
                    data={data}
                  />
                )}

                {/* Subtree Editing Tab */}
                {activeTab === 'editing' && data.type !== 'sentence' && (
                  <SubtreeEditingTab
                    isNodeRewriting={isNodeRewriting}
                    subtreeEmotionProfile={subtreeEmotionProfile}
                    setSubtreeEmotionProfile={setSubtreeEmotionProfile}
                    subtreeEmotion={subtreeEmotion}
                    setSubtreeEmotion={setSubtreeEmotion}
                    subtreeIntensity={subtreeIntensity}
                    setSubtreeIntensity={setSubtreeIntensity}
                    fetchSubtreeRewriteOptions={fetchSubtreeRewriteOptions}
                    leafOrder={leafOrder}
                    leafSuggestions={leafSuggestions}
                    setLeafSuggestions={setLeafSuggestions}
                    rotateLeafPrev={rotateLeafPrev}
                    rotateLeafNext={rotateLeafNext}
                    originalEmotionProfile={originalEmotionProfile}
                    handleCancel={handleCancel}
                    id={id}
                    data={data}
                    setIsDialogOpen={setIsDialogOpen}
                  />
                )}
              </div>
            )}

            {/* Loading Spinner */}
            {isNodeRewriting && (
              <div
                style={{
                  padding: '32px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: '5px solid #ccc',
                    borderTop: `5px solid ${modalAccentColor}`,
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  // =========================================================================
  // RENDER: Main Node
  // =========================================================================

  return (
    <>
      <motion.div
        className={nodeModified ? 'animated-border' : ''}
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        style={{
          padding: 12,
          borderRadius: 8,
          color: 'black',
          textAlign: 'center',
          cursor: 'pointer',
          width: 200,
          background: emotionColor,
          border: nodeModified ? `2px solid ${border}` : '2px solid transparent',
          position: 'relative',
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
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
            padding: '8px 32px 8px 8px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: data.type === 'root' ? 600 : 500,
            color: '#000',
            lineHeight: 1.45,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {renderNodeContent(
            data.label || data.content,
            data.type,
            data.structure,
            data.formatting
          )}
        </div>

        {nodeModified && (
          <div
            className="modified-indicator"
            title="This node has been modified."
          >
            !
          </div>
        )}
      </motion.div>

      {dialog}
    </>
  );
}

// ============================================================================
// SUB-COMPONENTS: Editing Tabs
// ============================================================================

/**
 * SentenceEditingTab - Content and emotion editing for leaf nodes
 *
 * @param {Object} props - All editing state and handlers
 * @returns {React.ReactElement} Editing interface
 */
function SentenceEditingTab({
  isNodeRewriting,
  nodeText,
  setNodeText,
  suggestions,
  currentSuggestionIndex,
  showPrevSuggestion,
  showNextSuggestion,
  fetchRewriteOptions,
  emotionProfile,
  setEmotionProfile,
  emotion,
  setEmotion,
  selectedIntensity,
  setSelectedIntensity,
  previousText,
  originalEmotionProfile,
  handleSave,
  handleCancel,
  id,
  data,
}) {
  return (
    <div style={{ padding: '20px 24px 16px 24px', background: '#fff' }}>
      {/* Content Editor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>
          Edit Content
        </div>

        {/* Reroll Edits */}
        <button
          onClick={e => {
            e.stopPropagation();
            fetchRewriteOptions();
          }}
          disabled={isNodeRewriting}
          title="Generate 3 rewrite suggestions using current emotion profile"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: isNodeRewriting ? '#e5e7eb' : '#111827',
            color: isNodeRewriting ? '#9ca3af' : '#ffffff',
            cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
          onMouseOver={e => {
            if (!isNodeRewriting) {
              e.currentTarget.style.background = '#374151';
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = '#111827';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ↻
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={showPrevSuggestion}
            disabled={isNodeRewriting}
            title="Previous suggestion"
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#f8f8f8',
              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
            }}
          >
            ◀
          </button>
          <div style={{ fontSize: 12, color: '#555' }}>
            Option {currentSuggestionIndex + 1} / {suggestions.length}
          </div>
          <button
            onClick={showNextSuggestion}
            disabled={isNodeRewriting}
            title="Next suggestion"
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#f8f8f8',
              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
            }}
          >
            ▶
          </button>
        </div>
      )}

      <textarea
        value={nodeText}
        onChange={e => setNodeText(e.target.value)}
        style={{
          width: '100%',
          minHeight: 120,
          padding: 10,
          borderRadius: 6,
          border: '1px solid #bbb',
          marginBottom: 16,
          color: '#000000',
          resize: 'vertical',
        }}
      />

      {/* Emotion Profile Selector */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <EmotionRadar
          profile={emotionProfile}
          onChange={next => {
            setEmotionProfile(next);
            // Update dominant emotion from profile
            const emotions = Object.entries(next).filter(
              ([_, intensity]) => intensity > 0
            );
            if (emotions.length > 0) {
              emotions.sort((a, b) => b[1] - a[1]);
              setEmotion(emotions[0][0]);
              setSelectedIntensity(emotions[0][1]);
            }
          }}
          size={360}
          label="Emotion profile"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        {/* Delete Button */}
        <button
          title="Delete this sentence"
          onClick={e => {
            e.stopPropagation();
            const ok = window.confirm(
              'Delete this sentence? This cannot be undone.'
            );
            if (ok && typeof data.deleteNode === 'function') {
              data.deleteNode(id);
            }
          }}
          disabled={isNodeRewriting}
          style={{
            padding: '8px 12px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
        >
          Delete Node
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Save Button */}
          {(nodeText !== previousText ||
            JSON.stringify(emotionProfile) !==
              JSON.stringify(originalEmotionProfile)) && (
            <button
              onClick={handleSave}
              disabled={isNodeRewriting}
              style={{
                padding: '8px 14px',
                background: '#10B981',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          )}

          {/* Cancel Button */}
          <button
            onClick={handleCancel}
            disabled={isNodeRewriting}
            style={{
              padding: '6px 12px',
              backgroundColor: '#7c7c7cff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * SubtreeEditingTab - Group node editing with leaf rewriting
 *
 * @param {Object} props - All editing state and handlers
 * @returns {React.ReactElement} Subtree editing interface
 */
function SubtreeEditingTab({
  isNodeRewriting,
  subtreeEmotionProfile,
  setSubtreeEmotionProfile,
  subtreeEmotion,
  setSubtreeEmotion,
  subtreeIntensity,
  setSubtreeIntensity,
  fetchSubtreeRewriteOptions,
  leafOrder,
  leafSuggestions,
  setLeafSuggestions,
  rotateLeafPrev,
  rotateLeafNext,
  originalEmotionProfile,
  handleCancel,
  id,
  data,
  setIsDialogOpen,
}) {
  return (
    <div style={{ padding: '20px 24px', background: '#fff' }}>
      {/* Emotion Profile Selector */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <button
          onClick={e => {
            e.stopPropagation();
            fetchSubtreeRewriteOptions();
          }}
          disabled={isNodeRewriting}
          title="Generate suggestions for all descendant sentences using this emotion profile"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: isNodeRewriting ? '#e5e7eb' : '#111827',
            color: isNodeRewriting ? '#9ca3af' : '#ffffff',
            cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
          }}
          onMouseOver={e => {
            if (!isNodeRewriting) {
              e.currentTarget.style.background = '#374151';
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = '#111827';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ↻
        </button>

        <EmotionRadar
          profile={subtreeEmotionProfile}
          onChange={next => {
            setSubtreeEmotionProfile(next);
            const emotions = Object.entries(next).filter(
              ([_, intensity]) => intensity > 0
            );
            if (emotions.length > 0) {
              emotions.sort((a, b) => b[1] - a[1]);
              setSubtreeEmotion(emotions[0][0]);
              setSubtreeIntensity(emotions[0][1]);
            }
          }}
          size={360}
          label="Subtree emotion profile"
        />
      </div>

      {/* Leaf Suggestions List */}
      {leafOrder.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leafOrder.map(leafId => {
              const entry = leafSuggestions[leafId];
              if (!entry) return null;

              const currentText =
                entry.editedText ??
                (entry.options?.length > 0 && entry.selectedIdx >= 0
                  ? entry.options[entry.selectedIdx]
                  : entry.original);

              return (
                <div
                  key={leafId}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <button
                      onClick={() => rotateLeafPrev(leafId)}
                      disabled={
                        isNodeRewriting ||
                        !(entry.options && entry.options.length > 0)
                      }
                      title="Previous option"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        background: '#f8f8f8',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ◀
                    </button>

                    <div style={{ fontSize: 12, color: '#555', flex: 1 }}>
                      {entry.options && entry.options.length > 0
                        ? `Option ${entry.selectedIdx + 1} / ${entry.options.length}`
                        : 'No options'}
                    </div>

                    <button
                      onClick={() => rotateLeafNext(leafId)}
                      disabled={
                        isNodeRewriting ||
                        !(entry.options && entry.options.length > 0)
                      }
                      title="Next option"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        background: '#f8f8f8',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ▶
                    </button>
                  </div>

                  <textarea
                    value={currentText}
                    onChange={e => {
                      const val = e.target.value;
                      setLeafSuggestions(prev => ({
                        ...prev,
                        [leafId]: { ...entry, editedText: val },
                      }));
                    }}
                    style={{
                      width: '100%',
                      minHeight: 100,
                      padding: 8,
                      borderRadius: 6,
                      border: '1px solid #bbb',
                      color: '#000000',
                      resize: 'vertical',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {leafOrder.length === 0 && (
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: '#999',
            fontSize: 14,
          }}
        >
          No descendant nodes to edit. Click the refresh button to load suggestions.
        </div>
      )}

      {/* Save/Cancel Buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={handleCancel}
          disabled={isNodeRewriting}
          style={{
            padding: '6px 12px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>

        {(() => {
          const hasTextChanges = Object.keys(leafSuggestions).some(k => {
            const e = leafSuggestions[k];
            const chosen =
              e.editedText ??
              (e.options?.length > 0 && e.selectedIdx >= 0
                ? e.options[e.selectedIdx]
                : e.original);
            return chosen !== e.original;
          });

          const hasEmotionChanges =
            JSON.stringify(subtreeEmotionProfile) !==
            JSON.stringify(originalEmotionProfile);

          return (hasTextChanges || hasEmotionChanges) && (
            <button
              onClick={() => {
                const edits = {};
                let anyTextChanged = false;

                Object.keys(leafSuggestions).forEach(k => {
                  const e = leafSuggestions[k];
                  const chosen =
                    e.editedText ??
                    (e.options?.length > 0 && e.selectedIdx >= 0
                      ? e.options[e.selectedIdx]
                      : e.original);

                  if (chosen && chosen.length > 0) {
                    edits[k] = chosen;
                    if (chosen !== e.original) anyTextChanged = true;
                  }
                });

                const finalProfile = anyTextChanged
                  ? subtreeEmotionProfile
                  : originalEmotionProfile;

                // Create new emotion object with metadata
                const newEmotion = {
                  profile: finalProfile,
                  dominantEmotion: subtreeEmotion,
                  dominantIntensity: subtreeIntensity,
                  source: 'AI',
                  timestamp: new Date().toISOString(),
                };

                if (typeof data.applySubtreeChanges === 'function') {
                  data.applySubtreeChanges(id, newEmotion, edits);
                }

                setIsDialogOpen(false);
              }}
              disabled={isNodeRewriting}
              style={{
                padding: '8px 14px',
                background: '#10B981',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          );
        })()}
      </div>
    </div>
  );
}

export default AnimatedNodeComponent;