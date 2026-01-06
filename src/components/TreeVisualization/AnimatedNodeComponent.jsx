/**
 * @fileoverview AnimatedNodeComponent - Tree node visualization with emotion editing
 *
 * Renders individual tree nodes with double-click editing dialog.
 * Handles content editing, emotion profile selection, and subtree modifications.
 * Supports markdown rendering, suggestion cycling, and rewrite options via Claude API.
 *
 * @typedef {Object} Node
 * @property {string} id - Node identifier
 * @property {string} content - Node text content
 * @property {string} label - Display label
 * @property {'root'|'group'|'sentence'} type - Node type
 * @property {Object} emotion - Emotion data
 * @property {Object} emotions - Emotion profile
 * @property {number} intensity - Emotion intensity [0-100]
 * @property {boolean} isDirty - Modified flag
 * @property {Object} [metadata] - Additional metadata
 * @property {string} [author] - Content author
 * @property {string} [timestamp] - Creation timestamp
 *
 * @typedef {Object} LeafEntry
 * @property {string} id - Leaf node ID
 * @property {string} original - Original content
 * @property {string[]} options - Rewrite suggestions
 * @property {number} selectedIdx - Currently selected option
 * @property {string} editedText - Edited content text
 */

import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import {
  normalizeEmotionProfile,
  deriveLegacyFromProfile,
  profileFromLegacy,
} from '../../utils/emotionProfiles.js';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';
import { EMOTION_COLORS } from '../../utils/constants';
import EmotionRadar from '../EmotionSelector/EmotionRadar.jsx';
import '../../components/TreeVisualization/TreeNode.css';

// ============================================================================
// EMOTION COLOR UTILITIES
// ============================================================================

/**
 * Get node background color based on emotion and intensity
 *
 * @param {string|null} emotion - Emotion name
 * @param {number} intensity - Intensity [0-100]
 * @param {'root'|'group'|'sentence'} type - Node type
 * @returns {string} CSS color value
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
 *
 * @param {string|null} emotion - Emotion name
 * @param {number} intensity - Intensity [0-100]
 * @param {'root'|'group'|'sentence'} type - Node type
 * @returns {string} CSS color value
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
 * @returns {Object|null} { number: string, text: string } or null
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
 * Processes from end to start to avoid index shifting
 *
 * @param {string} content - Base content text
 * @param {Object[]} inlineElements - Array of inline format specs
 * @param {string} inlineElements[].type - Format type (bold, italic, code, link, etc.)
 * @param {number} inlineElements[].start - Start index
 * @param {number} inlineElements[].end - End index
 * @param {string} [inlineElements[].url] - URL for links/images
 * @param {string} [inlineElements[].title] - Title/alt text
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
 * Build markdown string from content, structure metadata, and inline elements
 *
 * @param {string} content - Base content text
 * @param {Object} [structure] - Structure metadata
 * @param {number} [structure.headingLevel] - H1-H6 level
 * @param {string} [structure.listType] - 'ordered', 'unordered', 'task'
 * @param {number} [structure.listIndentLevel] - Nesting level
 * @param {string} [structure.listMarker] - Custom list marker
 * @param {boolean} [structure.taskChecked] - Task checkbox state
 * @param {string} [structure.codeLanguage] - Code block language
 * @param {number} [structure.quoteDepth] - Blockquote nesting
 * @param {Object[]} [inlineElements] - Inline formatting
 * @returns {string} Formatted markdown
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
 * Render node content with full markdown and link support
 *
 * @param {string} content - Content text
 * @param {'root'|'group'|'sentence'} type - Node type
 * @param {Object} [structure] - Structure metadata
 * @param {Object[]} [inlineElements] - Inline format elements
 * @returns {React.ReactElement} Rendered content
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
 * Double-click to open edit dialog. Supports:
 * - Content editing with Claude-powered suggestions
 * - Emotion profile adjustment with visual radar
 * - Subtree editing (for group nodes)
 * - Markdown rendering with links, lists, code blocks
 *
 * @param {Object} props
 * @param {string} props.id - Node ID
 * @param {Node} props.data - Node data object
 * @param {string} props.data.content - Content text
 * @param {string} props.data.label - Display label
 * @param {'root'|'group'|'sentence'} props.data.type - Node type
 * @param {Object} [props.data.emotions] - Emotion profile
 * @param {Object} [props.data.emotion] - Legacy emotion
 * @param {number} [props.data.intensity] - Legacy intensity
 * @param {boolean} [props.data.isDirty] - Modified flag
 * @param {Function} props.data.applyNodeEdit - Edit handler
 * @param {Function} props.data.applyEmotionToSubtree - Emotion update
 * @param {Function} props.data.deleteNode - Delete handler
 * @param {Function} props.data.setOpenEmotionNodeId - Panel state
 * @param {Function} props.data.getDescendantLeaves - Get leaf nodes
 * @returns {React.ReactElement}
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
  const [nodeModified, setNodeModified] = useState(data.isDirty);

  // =========================================================================
  // STATE: Emotion (Sentence/Current)
  // =========================================================================

  const initialProfile = normalizeEmotionProfile(
    data.emotions ?? profileFromLegacy(data.emotion, data.intensity)
  );
  const initialLegacy = deriveLegacyFromProfile(initialProfile);

  const [emotionProfile, setEmotionProfile] = useState(initialProfile);
  const [originalEmotionProfile, setOriginalEmotionProfile] =
    useState(initialProfile);
  const [emotion, setEmotion] = useState(initialLegacy.emotion || 'interest');
  const [intensity, setIntensity] = useState(initialLegacy.intensity ?? 0);
  const [selectedIntensity, setSelectedIntensity] = useState(
    initialLegacy.intensity ?? 0
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
    initialLegacy.emotion || 'interest'
  );
  const [subtreeIntensity, setSubtreeIntensity] = useState(
    initialLegacy.intensity ?? 0
  );

  /** @type {Object<string, LeafEntry>} */
  const [leafSuggestions, setLeafSuggestions] = useState({});

  /** @type {string[]} */
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
   * Sync isDirty flag from data
   */
  useEffect(() => {
    setNodeModified(data.isDirty);
  }, [data.isDirty]);

  /**
   * Sync emotion profile from data changes
   */
  useEffect(() => {
    const profile = normalizeEmotionProfile(
      data.emotions ?? profileFromLegacy(data.emotion, data.intensity)
    );
    const legacy = deriveLegacyFromProfile(profile);

    setEmotionProfile(profile);
    setOriginalEmotionProfile(profile);
    setEmotion(legacy.emotion || 'interest');
    setIntensity(legacy.intensity ?? 0);
    setPreviousEmotion(legacy.emotion || 'interest');
    setPreviousText(data.content || data.label || '');
    setSubtreeEmotionProfile(profile);
    setSubtreeEmotion(legacy.emotion || 'interest');
    setSubtreeIntensity(
      typeof legacy.intensity === 'number' ? legacy.intensity : 0
    );
  }, [data.emotions, data.emotion, data.intensity]);

  // =========================================================================
  // HANDLERS: Sentence Editing
  // =========================================================================

  /**
   * Handle sentence content save
   * Reverts emotion to original if text didn't change
   */
  const handleSave = () => {
    const textChanged = nodeText !== previousText;
    const finalProfile = textChanged ? emotionProfile : originalEmotionProfile;
    const legacy = deriveLegacyFromProfile(finalProfile);

    setIntensity(legacy.intensity);
    setEmotion(legacy.emotion);
    setEmotionProfile(finalProfile);

    if (typeof data.applyNodeEdit === 'function') {
      data.applyNodeEdit(id, nodeText, finalProfile);
    }

    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setIsDialogOpen(false);

    if (nodeText.length === 0) {
      if (typeof data.deleteNode === 'function') {
        data.deleteNode(id);
      }
    }
  };

  /**
   * Handle dialog cancellation
   * Reverts all changes to original state
   */
  const handleCancel = () => {
    const legacy = deriveLegacyFromProfile(originalEmotionProfile);

    setEmotionProfile(originalEmotionProfile);
    setEmotion(legacy.emotion);
    setSelectedIntensity(legacy.intensity);
    setNodeText(previousText);
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setLeafSuggestions({});
    setLeafOrder([]);
    setSubtreeEmotionProfile(originalEmotionProfile);
    setSubtreeEmotion(legacy.emotion);
    setSubtreeIntensity(legacy.intensity);
    setIsDialogOpen(false);
  };

  /**
   * Set emotion intensity for sentence edit
   *
   * @param {number} inputIntensity - Intensity [0-100]
   */
  const setNodeIntensity = (inputIntensity) => {
    setSelectedIntensity(inputIntensity);
    const next = normalizeEmotionProfile({
      ...emotionProfile,
      [emotion]: inputIntensity,
    });
    setEmotionProfile(next);
  };

  /**
   * Fetch rewrite suggestions for current emotion profile
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
   * Show previous suggestion variant
   */
  const showPrevSuggestion = () => {
    if (!suggestions || suggestions.length === 0) return;

    const newIdx =
      (currentSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    setCurrentSuggestionIndex(newIdx);
    setNodeText(suggestions[newIdx]);
  };

  /**
   * Show next suggestion variant
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
   * Set emotion intensity for subtree edit
   *
   * @param {number} inputIntensity - Intensity [0-100]
   */
  const setSubtreeNodeIntensity = (inputIntensity) => {
    setSubtreeIntensity(inputIntensity);
    const next = normalizeEmotionProfile({
      ...emotionProfile,
      [subtreeEmotion]: inputIntensity,
    });
    setEmotionProfile(next);
  };

  /**
   * Load rewrite options for all leaf nodes under this group
   *
   * @param {Object} profileUpdate - Updated emotion profile
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
              editedText:
                opts && opts.length > 0 ? opts[0] : leaf.content,
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
   * Rotate to previous suggestion for leaf node
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
   * Rotate to next suggestion for leaf node
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
                    color: '#6b7280',
                    padding: '8px 10px',
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
                      {data.type !== 'sentence' && data.label && (
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
                        {data.type === 'sentence'
                          ? emotion
                          : subtreeEmotion}
                      </div>
                      <div>
                        <strong>Intensity:</strong>{' '}
                        {data.type === 'sentence'
                          ? intensity
                          : subtreeIntensity}
                      </div>
                      {data.author && (
                        <div>
                          <strong>Author:</strong> {data.author}
                        </div>
                      )}
                      {data.timestamp && (
                        <div>
                          <strong>Timestamp:</strong> {data.timestamp}
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
            data.label,
            data.type,
            data.structure,
            data.inlineElements
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
 * Sentence editing tab content
 *
 * @param {Object} props - Component props
 * @returns {React.ReactElement}
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
  const legacy = deriveLegacyFromProfile(emotionProfile);

  return (
    <div style={{ padding: '20px 24px 16px 24px', background: '#fff' }}>
      {/* Delete Button */}
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Options</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
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
          Delete
        </button>
      </div>

      {/* Content Editor */}
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Edit Content</div>

      {suggestions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={showPrevSuggestion}
            disabled={isNodeRewriting}
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
          <div style={{ fontSize: 12, color: '#555' }}>
            Option {currentSuggestionIndex + 1} / {suggestions.length}
          </div>
          <button
            onClick={showNextSuggestion}
            disabled={isNodeRewriting}
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
        <button
          onClick={e => {
            e.stopPropagation();
            fetchRewriteOptions();
          }}
          disabled={isNodeRewriting}
          title="Generate 3 rewrite options using current emotion profile"
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
          profile={emotionProfile}
          onChange={next => {
            setEmotionProfile(next);
            const newLegacy = deriveLegacyFromProfile(next);
            setEmotion(newLegacy.emotion);
            setSelectedIntensity(newLegacy.intensity);
          }}
          size={360}
          label="Emotion profile"
        />
      </div>

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
      </div>
    </div>
  );
}

/**
 * Subtree/group editing tab content
 *
 * @param {Object} props - Component props
 * @returns {React.ReactElement}
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
          title="Generate 3 rewrite options for each sentence using current emotion profile"
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
            const legacy = deriveLegacyFromProfile(next);
            setSubtreeEmotion(legacy.emotion);
            setSubtreeIntensity(legacy.intensity);
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
                (entry.options &&
                entry.options.length > 0 &&
                entry.selectedIdx >= 0
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

                    <div style={{ fontSize: 12, color: '#555' }}>
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
              (e.options &&
              e.options.length > 0 &&
              e.selectedIdx >= 0
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
                    (e.options &&
                    e.options.length > 0 &&
                    e.selectedIdx >= 0
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

                if (typeof data.applySubtreeChanges === 'function') {
                  data.applySubtreeChanges(
                    id,
                    normalizeEmotionProfile({ ...finalProfile }),
                    edits
                  );
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