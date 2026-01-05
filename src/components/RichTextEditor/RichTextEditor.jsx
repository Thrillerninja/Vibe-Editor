/**
 * RichTextEditor - Integrates Lexical editor with new node structure
 */

import React, { useCallback, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';

import { ToolbarPlugin } from './plugins/ToolbarPlugin';
import { LinkHoverPlugin } from './plugins/LinkHoverPlugin';
import './styles/editor.css';

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

/**
 * RichTextEditor Component - Lexical-based editor
 * @param {string} value - Markdown content
 * @param {Function} onChange - Called with (markdown, cursorPosition)
 * @param {Function} onBlur - Called when editor loses focus
 * @param {string} placeholder - Placeholder text
 * @param {string} hierarchyState - Current hierarchy state
 * @param {SentenceNode[]} sentences - Sentence nodes
 */
export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = 'Enter your text here...',
  hierarchyState = 'none',
  sentences = [],
}) {
  const editorStateRef = useRef(null);
  const editorRef = useRef(null);

  /**
   * Handle editor state changes
   */
  const handleEditorChange = useCallback(
    (editorState, editor) => {
      editorStateRef.current = editorState;
      editorRef.current = editor;

      editor.read(() => {
        // Convert to markdown
        const markdownContent = $convertToMarkdownString(TRANSFORMERS);

        // Get cursor position
        let cursorPos = 0;
        try {
          const selection = editorState._selection;
          if (selection && selection.anchor) {
            cursorPos = selection.anchor.offset;
          }
        } catch (e) {
          cursorPos = markdownContent.length;
        }

        console.log('[RichTextEditor] Markdown:', markdownContent);
        console.log('[RichTextEditor] Cursor:', cursorPos);

        if (onChange) {
          onChange(markdownContent, cursorPos);
        }
      });
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    if (onBlur) {
      onBlur();
    }
  }, [onBlur]);

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 bg-gray-50 px-4 py-2 flex-shrink-0">
          <div className="w-[300px] h-16 flex-shrink-0" />
          <ToolbarPlugin />
        </div>

        {/* Editor */}
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
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <LinkHoverPlugin />
          </div>

          {/* Status Bar */}
          <div className="flex flex-row justify-end gap-2 px-4 py-2 bg-gray-50 text-sm text-gray-600">
            <span>{sentences.length} nodes</span>
            <span>•</span>
            <span>{value.length} chars</span>
            <HierarchyStatus state={hierarchyState} count={sentences.length} />
          </div>
        </div>
      </div>
    </LexicalComposer>
  );
}

/**
 * HierarchyStatus Component - Shows hierarchy build status
 */
function HierarchyStatus({ state, count }) {
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