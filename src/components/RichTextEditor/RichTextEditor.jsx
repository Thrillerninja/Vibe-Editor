// src/components/RichTextEditor/RichTextEditor.jsx
import React, { useCallback, useRef, useState } from 'react';
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

import { ToolbarPlugin } from './plugins/ToolbarPlugin';
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
    console.error('Lexical Error:', error);
  },
};

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

  const handleEditorChange = useCallback(
    (editorState, editor) => {
      editorStateRef.current = editorState;
      editorRef.current = editor;

      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      const textContent = rootElement.textContent || '';

      let cursorPos = 0;
      try {
        const selection = editorState._selection;
        if (selection && selection.anchor) {
          cursorPos = selection.anchor.offset;
        }
      } catch (e) {
        cursorPos = textContent.length;
      }

      if (onChange) {
        onChange(textContent, cursorPos);
      }
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
    <div className="editor-wrapper" style={{ color: 'black' }}>

      {/* TOP HEADER - Toolbar only, wraps with max 3 lines */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-secondary)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: 8,
          flexWrap: 'wrap',
        }}>
          {/* BLOCKER - to be behind the overall page title */}
          <div className="w-[300px] h-16" />
          
          {/* Toolbar */}
          <div className="flex-1 min-w-45 overflow-hidden max-h-[88px] flex items-center">
            <ToolbarPlugin />
          </div>
        </div>
      </div>

      {/* EDITOR CONTAINER - grows to fill remaining space */}
      <div className="editor-container" style={{ position: 'relative' }}>
        <div className="editor-inner">
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

          {/* Core Plugins */}
          <OnChangePlugin onChange={handleEditorChange} />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
        </div>

        {/* FLOATING STATUS - Bottom Left Corner */}
        <div className="flex flex-row align-right gap-2 absolute bottom-2 right-2">
          {sentences.length} • {value.length}
          <HierarchyStatus state={hierarchyState} count={sentences.length} />
        </div>
      </div>
    </div>
  </LexicalComposer>
);
}

function HierarchyStatus({ state, count }) {
  const config = {
    none: {
      icon: '◯',
      text: 'No hierarchy',
      color: 'status-neutral',
    },
    'has-dirty-nodes': {
      icon: '◐',
      text: 'Pending',
      color: 'status-pending',
    },
    generated: {
      icon: '◉',
      text: 'Complete',
      color: 'status-complete',
    },
  };

  const { icon, text, color } = config[state] || config.none;

  return (
    <div className={`hierarchy-status-compact ${color}`}>
      <span className="status-icon">{icon}</span>
      <span className="status-text">{text}</span>
    </div>
  );
}