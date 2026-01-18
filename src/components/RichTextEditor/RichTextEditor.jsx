/**
 * @fileoverview RichTextEditor - Lexical-based markdown editor
 *
 * Features:
 * - Markdown conversion via Lexical transformers
 * - Integrated toolbar and plugins
 * - Hierarchy state tracking
 * - Real-time character/node counting
 *
 * @typedef {import('../types/node').Node} Node
 * @typedef {Object} RichTextEditorProps
 * @property {string} value - Current markdown content
 * @property {(markdown: string, cursorPos: number) => void} onChange - Content change handler
 * @property {() => void} [onBlur] - Blur event handler
 * @property {string} [placeholder] - Placeholder text
 * @property {'none' | 'generated' | 'has-dirty-nodes'} [hierarchyState] - Hierarchy build status
 * @property {Node[]} [sentences] - Array of sentence/content nodes
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown';
import {
  $getRoot,
  $createParagraphNode,
} from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';

import ToolbarPlugin from './plugins/ToolbarPlugin';
import LinkHoverPlugin from './plugins/LinkHoverPlugin';
import './styles/editor.css';
import PasteSanitizerPlugin from './plugins/PasteSanitizerPlugin';

// ============================================================================
// LEXICAL CONFIGURATION
// ============================================================================

/**
 * Lexical editor configuration
 * Defines theme classes, available nodes, and error handling
 *
 * @type {Object}
 */
const editorConfig = {
  namespace: 'SentenceEditor',
  theme: {
    root: 'editor-root',
    paragraph: 'editor-paragraph',
    heading: {
      h1: 'editor-heading-h1',
      h2: 'editor-heading-h2',
      h3: 'editor-heading-h3',
    },
    list: {
      ul: 'editor-list-ul',
      ol: 'editor-list-ol',
      listitem: 'editor-list-item',
      listitemButton: 'editor-list-item-button',
      nested: {
        listitem: 'editor-list-item-nested',
      },
    },
    link: 'editor-link',
    text: {
      bold: 'editor-text-bold',
      italic: 'editor-text-italic',
      underline: 'editor-text-underline',
    },
    quote: 'editor-quote',
  },
  nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
  onError: (error) => {
    console.error('[Lexical] Error:', error);
  },
};

// ============================================================================
// HIERARCHY STATUS COMPONENT
// ============================================================================

/**
 * HierarchyStatus - Visual indicator of document hierarchy state
 *
 * Shows generation progress via icon and text:
 * - none: No hierarchy generated
 * - has-dirty-nodes: Generation pending
 * - generated: Hierarchy complete
 *
 * @param {Object} props
 * @param {'none' | 'generated' | 'has-dirty-nodes'} props.state - Current hierarchy state
 * @param {number} props.count - Number of nodes
 * @returns {React.ReactElement}
 */
function HierarchyStatus({ state, count }) {
  /**
   * Configuration map for each hierarchy state
   * @type {Object<string, {icon: string, text: string, color: string}>}
   */
  const config = {
    none: {
      icon: '◯',
      text: 'No hierarchy',
      color: 'text-gray-500',
    },
    'has-dirty-nodes': {
      icon: '◐',
      text: 'Pending',
      color: 'text-yellow-600',
    },
    generated: {
      icon: '◉',
      text: 'Complete',
      color: 'text-green-600',
    },
  };

  const { icon, text, color } = config[state] || config.none;

  return (
    <span className={`${color} flex items-center gap-1`}>
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  );
}

// ============================================================================
// EDITOR CONTENT COMPONENT (Internal)
// ============================================================================

/**
 * EditorContent - The actual editor with plugins
 *
 * Provides a rich text editing experience with:
 * - Markdown format output
 * - List and link support
 * - Real-time status tracking
 * - Customizable placeholder text
 * Separated from main export to use LexicalComposer context
 *
 * @param {RichTextEditorProps} props
 * @returns {React.ReactElement}
 *
 * @example
 * <RichTextEditor
 *   value={markdown}
 *   onChange={(md, pos) => setMarkdown(md)}
 *   placeholder="Enter your text here..."
 *   hierarchyState="generated"
 *   sentences={nodes}
 * />
 */
function EditorContent({
  value,
  onChange,
  onBlur,
  placeholder = 'Enter your text here...',
  hierarchyState = 'none',
  sentences = [],
}) {
  const [editor] = useLexicalComposerContext();
  // =========================================================================
  // STATE & REFS
  // =========================================================================

  /**
   * Debounce timer for value synchronization
   * @type {React.MutableRefObject<NodeJS.Timeout | null>}
   */
  const syncDebounceRef = useRef(null);

  /**
   * Track if we're currently syncing to avoid loops
   * @type {React.MutableRefObject<boolean>}
   */
  const isSyncingRef = useRef(false);

  // =========================================================================
  // Markdown Conversion
  // =========================================================================

  /**
   * Handle editor state changes - convert to markdown and call onChange
   *
   * Extracts:
   * - Markdown representation via Lexical transformers
   * - Cursor position from editor selection
   *
   * @param {Object} editorState - Lexical editor state
   * @param {Object} editor - Lexical editor instance
   * @returns {void}
   */
  const handleEditorChange = useCallback(
    (editorState, editor) => {
      editor.read(() => {
        // Convert editor state to markdown
        const markdownContent = $convertToMarkdownString(TRANSFORMERS);

        // Extract cursor position
        let cursorPos = 0;
        try {
          const selection = editorState._selection;
          if (selection && selection.anchor) {
            cursorPos = selection.anchor.offset;
          }
        } catch (e) {
          cursorPos = markdownContent.length;
        }

        console.log('[RichTextEditor] Markdown length:', markdownContent.length);
        console.log('[RichTextEditor] Cursor position:', cursorPos);

        if (onChange) {
          onChange(markdownContent, cursorPos);
        }
      });
    },
    [onChange]
  );

  /**
   * Handle blur event - notify parent component
   *
   * @returns {void}
   */
  const handleBlur = useCallback(() => {
    if (onBlur) {
      onBlur();
    }
  }, [onBlur]);





  // =========================================================================
  // Value Synchronization
  // =========================================================================

  /**
   * Sync editor content when value prop changes
   * Uses debouncing to avoid excessive updates
   */
  useEffect(() => {
  // Clear existing debounce
  if (syncDebounceRef.current) {
    clearTimeout(syncDebounceRef.current);
  }

  // Debounce the sync
  syncDebounceRef.current = setTimeout(() => {
    editor.update(() => {
      const currentMarkdown = $convertToMarkdownString(TRANSFORMERS);

      // Only sync if content differs
      if (currentMarkdown === value) {
        return;
      }

      console.log('[RichTextEditor] Syncing content from prop');
      console.log('  Current markdown length:', currentMarkdown.length);
      console.log('  New value length:', value.length);

      isSyncingRef.current = true;

      // Clear the entire root
      const root = $getRoot();
      root.clear();

      // Insert new content from markdown
      const nodes = $convertFromMarkdownString(value, TRANSFORMERS);

      if (nodes && nodes.length > 0) {
        root.append(...nodes);
      } else {
        root.append($createParagraphNode());
      }

      isSyncingRef.current = false;
    });
  }, 100);

  return () => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
  };
}, [value, editor]);

  // =========================================================================
  // RENDER
  // =========================================================================
  useEffect(() => {
    console.log('[RichTextEditor DEBUG] Value prop changed:');
    console.log('  length:', value.length);
    console.log('  preview:', value.substring(0, 100));
  }, [value]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar Section */}
      <div className="flex items-center gap-2 bg-gray-50 px-3 py-3 flex-shrink-0 flex-wrap">
        <div className="w-[200px] h-11 flex-shrink-0" />
        <ToolbarPlugin />
      </div>

      {/* Editor Section */}
      <div className="flex flex-col flex-1 editor-container overflow-hidden">
        <div className="editor-inner flex-1">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-input"
                onBlur={handleBlur}
              />
            }
            placeholder={
              <div className="editor-placeholder">{placeholder}</div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Plugins */}
          <OnChangePlugin onChange={handleEditorChange} />
          <PasteSanitizerPlugin />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <LinkHoverPlugin />
        </div>

        {/* Status Bar */}
        <div className="flex flex-row justify-end gap-2 px-4 py-2 bg-gray-50 text-sm text-gray-600 flex-shrink-0">
          <span>{sentences.length} nodes</span>
          <span>•</span>
          <span>{value.length} chars</span>
          <HierarchyStatus state={hierarchyState} count={sentences.length} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN EXPORT COMPONENT
// ============================================================================

/**
 * RichTextEditor - Lexical-based markdown editor component
 *
 * Provides a rich text editing experience with:
 * - Markdown format output
 * - List and link support
 * - Real-time status tracking
 * - Customizable placeholder text
 *
 * @param {RichTextEditorProps} props
 * @returns {React.ReactElement}
 *
 * @example
 * <RichTextEditor
 *   value={markdown}
 *   onChange={(md, pos) => setMarkdown(md)}
 *   placeholder="Enter your text here..."
 *   hierarchyState="generated"
 *   sentences={nodes}
 * />
 */
export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Enter your text here...',
  hierarchyState = 'none',
  sentences = [],
}) {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <EditorContent
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        hierarchyState={hierarchyState}
        sentences={sentences}
      />
    </LexicalComposer>
  );
}