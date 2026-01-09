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
import { EMOTION_AXES, EMOTION_COLORS, EMOTION_LABELS } from '../../utils/constants';
import EmotionRadar from '../EmotionSelector/EmotionRadar.jsx';
import { createEmptyEmotionProfile } from '../../types/node.js';
import '../../components/TreeVisualization/TreeNode.css';
import { normalizeEmotionProfile } from '../../utils/emotionProfiles.js';

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

/**
 * Gets significant emotions from profile (above threshold)
 * Returns array of {emotion, intensity, color} sorted by intensity descending
 * 
 * @param {Object} profile - Emotion profile object
 * @param {number} [threshold=30] - Minimum intensity to consider significant
 * @returns {Array<{emotion: string, intensity: number, color: string}>} Significant emotions
 */
function getSignificantEmotions(profile, threshold = 30) {
  const normalized = normalizeEmotionProfile(profile);
  const significant = [];

  for (const emotion of EMOTION_AXES) {
    const intensity = normalized[emotion] || 0;
    if (intensity >= threshold) {
      const colors = EMOTION_COLORS[emotion];
      // Choose color based on intensity
      const color = colors ?
        (intensity >= 66 ? colors.strong : intensity >= 33 ? colors.medium : colors.light) :
        '#e5e7eb';
      significant.push({ emotion, intensity, color });
    }
  }

  // Sort by intensity descending
  return significant.sort((a, b) => b.intensity - a.intensity);
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
 * @param {string} [structure.marker] - Custom list marker (e.g., "3.")
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
        structure.marker ||
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
  // Special handling for list items with custom markers
  if (structure?.marker) {
    const markdown = applyInlineElements(content, inlineElements);

    return (
      <div
        style={{
          width: '100%',
          lineHeight: 1.4,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5em',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            fontFamily: 'monospace',
            fontWeight: 500,
            color: '#4b5563',
          }}
        >
          {structure.marker}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
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
            }}
            skipHtml
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // Original markdown rendering for non-list items
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
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            borderRadius: '24px',
            padding: 0,
            maxWidth: 800,
            width: '90%',
            height: 'auto',
            maxHeight: '80vh',
            border: `3px solid ${modalAccentColor}`,
            boxShadow: `0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 0 30px ${modalAccentColor}66`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: '#111827'
          }}
          onClick={e => e.stopPropagation()}
        >


          {/* /* Scrollable content area */}
          {!isNodeRewriting && (
            <div
              style={{
                overflowY: 'auto',
                background: 'transparent',
                maxHeight: 'calc(72vh - 52px)',
              }}
            >


              {/* Editing Tab: Sentence editing */}
              {activeTab === "information" && data.type === "sentence" && (
                <div style={{ padding: "20px 24px 16px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                  <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1 }}>
                    {/* Left Column: Text */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                        <div style={{ fontWeight: 600 }}>Edit Content</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {(data.emotion?.source || data.emotion?.timestamp) && (
                            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                              {[data.emotion.source && `by ${data.emotion.source}`, data.emotion.timestamp].filter(Boolean).join(' • ')}
                            </span>
                          )}
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchRewriteOptions();
                              }}
                              disabled={isNodeRewriting}
                              title="Generate 3 rewrite options using current emotion profile"
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
                              }}
                              onMouseOver={(e) => {
                                if (!isNodeRewriting) {
                                  e.currentTarget.style.background = '#374151';
                                  e.currentTarget.style.transform = 'scale(1.1)';
                                }
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = '#111827';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              ↻
                            </button>
                            {JSON.stringify(emotionProfile) !== JSON.stringify(originalEmotionProfile) && nodeText === previousText && (
                              <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                                !
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {suggestions.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <button
                            onClick={showPrevSuggestion}
                            disabled={isNodeRewriting}
                            title="Previous option"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: '1px solid rgba(0,0,0,0.1)',
                              background: 'rgba(255,255,255,0.8)',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                              borderRadius: 8,
                              border: '1px solid rgba(0,0,0,0.1)',
                              background: 'rgba(255,255,255,0.8)',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            ▶
                          </button>
                        </div>
                      )}
                      <textarea
                        value={nodeText}
                        onChange={(e) => setNodeText(e.target.value)}
                        style={{
                          width: "100%",
                          flex: 1,
                          minHeight: 320,
                          padding: "16px",
                          borderRadius: "12px",
                          border: "1px solid rgba(0, 0, 0, 0.1)",
                          background: "rgba(255, 255, 255, 0.5)",
                          marginBottom: 16,
                          color: "#111827",
                          resize: "none",
                          fontFamily: "inherit",
                          fontSize: "14px",
                          outline: "none",
                          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)"
                        }}
                      />
                    </div>

                    {/* Right Column: Emotion */}
                    <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
                      <div style={{ position: 'relative' }}>
                        <EmotionRadar
                          profile={emotionProfile}
                          onChange={(next) => {
                            setEmotionProfile(next);
                            const legacy = deriveLegacyFromProfile(next);
                            setEmotion(legacy.emotion);
                            setSelectedIntensity(legacy.intensity);
                          }}
                          size={340}
                          label="Emotion profile"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <button
                      title="Delete this sentence"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ok = window.confirm('Delete this sentence? This cannot be undone.');
                        if (ok && typeof data.deleteNodeSentence === 'function') {
                          data.deleteNodeSentence(id);
                          setIsDialogOpen(false);
                        }
                      }}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                        marginRight: 'auto',
                        fontWeight: 500,
                        fontSize: '14px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                      }}
                      onMouseOver={(e) => {
                        if (!isNodeRewriting) {
                          e.currentTarget.style.backgroundColor = '#dc2626';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#ef4444';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
                      }}
                    >
                      Cancel
                    </button>
                    {nodeText !== previousText && (
                      <button
                        onClick={handleSave}
                        disabled={isNodeRewriting}
                        style={{
                          padding: "8px 20px",
                          background: "#111827",
                          color: "white",
                          borderRadius: "12px",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: '14px',
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                        }}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Editing Tab: Subtree editing */}
              {data.type !== "sentence" && (
                <div style={{ padding: "20px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                  <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                    {/* Left Column: List */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflowY: 'auto' }}>
                      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                        <div style={{ fontWeight: 600 }}>{data.label || 'Subtree Content'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {(data.emotion?.source || data.emotion?.timestamp) && (
                            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                              {[data.emotion?.source && `by ${data.emotion?.source}`, data.emotion?.timestamp].filter(Boolean).join(' • ')}
                            </span>
                          )}
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchSubtreeRewriteOptions();
                              }}
                              disabled={isNodeRewriting}
                              title="Generate 3 rewrite options for each sentence using current emotion profile"
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
                              }}
                              onMouseOver={(e) => {
                                if (!isNodeRewriting) {
                                  e.currentTarget.style.background = '#374151';
                                  e.currentTarget.style.transform = 'scale(1.1)';
                                }
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = '#111827';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              ↻
                            </button>
                            {JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile) && (
                              <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                                !
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Leaf suggestions list */}
                      {leafOrder.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {leafOrder.map(leafId => {
                            const entry = leafSuggestions[leafId];
                            if (!entry) return null;
                            const currentText = entry.editedText ?? ((entry.options && entry.options.length > 0 && entry.selectedIdx >= 0) ? entry.options[entry.selectedIdx] : entry.original);
                            return (
                              <div key={leafId} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.4)" }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <button
                                    onClick={() => rotateLeafPrev(leafId)}
                                    disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                                    title="Previous option"
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: '1px solid rgba(0,0,0,0.1)',
                                      background: 'rgba(255,255,255,0.8)',
                                      cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    ◀
                                  </button>
                                  <div style={{ fontSize: 12, color: '#555' }}>
                                    {entry.options && entry.options.length > 0 ? `Option ${entry.selectedIdx + 1} / ${entry.options.length}` : 'No options'}
                                  </div>
                                  <button
                                    onClick={() => rotateLeafNext(leafId)}
                                    disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                                    title="Next option"
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: '1px solid rgba(0,0,0,0.1)',
                                      background: 'rgba(255,255,255,0.8)',
                                      cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                  >
                                    ▶
                                  </button>
                                </div>
                                <textarea
                                  value={currentText}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setLeafSuggestions(prev => ({ ...prev, [leafId]: { ...entry, editedText: val } }));
                                  }}
                                  style={{
                                    width: '100%',
                                    minHeight: 100,
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(0, 0, 0, 0.1)",
                                    background: "rgba(255, 255, 255, 0.5)",
                                    color: "#111827",
                                    resize: 'vertical',
                                    fontFamily: "inherit",
                                    fontSize: "14px",
                                    outline: "none",
                                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)"
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Emotion */}
                    <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
                      <div style={{ position: 'relative' }}>
                        <EmotionRadar
                          profile={subtreeEmotionProfile}
                          onChange={(next) => {
                            setSubtreeEmotionProfile(next);
                            const legacy = deriveLegacyFromProfile(next);
                            setSubtreeEmotion(legacy.emotion);
                            setSubtreeIntensity(legacy.intensity);
                          }}
                          size={340}
                          label="Subtree emotion profile"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <button
                      onClick={handleCancel}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
                      }}
                    >
                      Cancel
                    </button>
                    {(() => {
                      const hasTextChanges = Object.keys(leafSuggestions).some(k => {
                        const e = leafSuggestions[k];
                        const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                        return chosen !== e.original;
                      });
                      const hasEmotionChanges = JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile);
                      return (hasTextChanges || hasEmotionChanges) && (
                        <button
                          onClick={() => {
                            // Build edits map
                            const edits = {};
                            let anyTextChanged = false;
                            Object.keys(leafSuggestions).forEach(k => {
                              const e = leafSuggestions[k];
                              const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                              if (chosen && chosen.length > 0) {
                                edits[k] = chosen;
                                if (chosen !== e.original) anyTextChanged = true;
                              }
                            });
                            // If no text changed, revert to original emotion
                            const finalProfile = anyTextChanged ? subtreeEmotionProfile : originalEmotionProfile;
                            if (typeof data.applySubtreeChanges === 'function') {
                              data.applySubtreeChanges(id, normalizeEmotionProfile({ ...finalProfile }), edits);
                            }
                            // Reset and close
                            setLeafSuggestions({});
                            setLeafOrder([]);
                            setIsDialogOpen(false);
                          }}
                          disabled={isNodeRewriting}
                          style={{
                            padding: "8px 20px",
                            background: "#111827",
                            color: "white",
                            borderRadius: "12px",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: '14px',
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          }}
                        >
                          Save
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Loading spinner if rewriting */}
          {isNodeRewriting && (
            <div style={{ padding: "32px", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "5px solid #ccc",
                  borderTop: `5px solid ${modalAccentColor}`,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            </div>
          )}
        </div>
      </div>,
      document.body
    ) : null;

  // Get significant emotions for badge display, excluding the dominant one
  const significantEmotions = getSignificantEmotions(emotionProfile, 30)
    .filter(e => e.emotion !== emotion);

  return (
    <>
      <motion.div
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
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
            padding: significantEmotions.length > 0 ? '8px 32px 28px 8px' : '8px 32px 8px 8px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: data.type === 'root' ? 600 : 500,
            color: '#000',
            lineHeight: 1.45,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {data.label}{"\n"}
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
                width="calc(100% - 6px)"
                height="calc(100% - 6px)"
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
            {significantEmotions.slice(0, 3).map((emotionData, idx) => (
              <div
                key={emotionData.emotion}
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
            {significantEmotions.length > 3 && (
              <div
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
                +{significantEmotions.length - 3}
              </div>
            )}
          </div>
        )}
      </motion.div>
      {dialog}
    </>
  );
}