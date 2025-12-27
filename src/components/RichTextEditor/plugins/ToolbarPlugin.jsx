// src/components/RichTextEditor/plugins/ToolbarPlugin.jsx
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  FORMAT_TEXT_COMMAND,
  $getSelection,
  $isRangeSelection,
  UNDO_COMMAND,
  REDO_COMMAND,
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
} from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode } from 'lexical';

export function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });
  const [blockType, setBlockType] = useState('paragraph');
  const blockTypeRef = useRef(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          setActiveFormats({
            bold: selection.hasFormat('bold'),
            italic: selection.hasFormat('italic'),
            underline: selection.hasFormat('underline'),
          });

          const anchorNode = selection.anchor.getNode();
          const element =
            anchorNode.getKey() === 'root'
              ? anchorNode
              : anchorNode.getTopLevelElementOrThrow();

          if ($isHeadingNode(element)) {
            setBlockType(element.getTag());
          } else {
            setBlockType(element.getType());
          }
        }
      });
    });
  }, [editor]);

  useEffect(() => {
    const handleClick = (e) => {
      if (blockTypeRef.current && !blockTypeRef.current.contains(e.target)) {
        setShowBlockMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatText = (format) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatBlock = (type) => {
    if (blockType === type) return;

    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (type === 'paragraph') {
          $setBlocksType(selection, () => $createParagraphNode());
        } else if (['h1', 'h2', 'h3'].includes(type)) {
          $setBlocksType(selection, () => $createHeadingNode(type));
        } else if (type === 'quote') {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      }
    });
    setShowBlockMenu(false);
  };

  const BLOCK_TYPES = [
    ['paragraph', 'Normal'],
    ['h1', 'H1'],
    ['h2', 'H2'],
    ['h3', 'H3'],
    ['quote', 'Quote'],
  ];

  return (
    <div className="toolbar-top">
      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          className="toolbar-btn"
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          className="toolbar-btn"
          title="Redo (Ctrl+Y)"
        >
          ↷
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Block Type */}
      <div className="toolbar-group" ref={blockTypeRef}>
        <button
          className="toolbar-select"
          onClick={() => setShowBlockMenu(!showBlockMenu)}
          title="Block type"
        >
          <span>
            {BLOCK_TYPES.find(([t]) => t === blockType)?.[1] || 'Normal'}
          </span>
          <span className="caret">▼</span>
        </button>

        {showBlockMenu && (
          <div className="block-menu">
            {BLOCK_TYPES.map(([type, label]) => (
              <button
                key={type}
                className={`menu-item ${blockType === type ? 'active' : ''}`}
                onClick={() => formatBlock(type)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      {/* Text Formatting */}
      <div className="toolbar-group">
        <button
          onClick={() => formatText('bold')}
          className={`toolbar-btn ${activeFormats.bold ? 'active' : ''}`}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => formatText('italic')}
          className={`toolbar-btn ${activeFormats.italic ? 'active' : ''}`}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          onClick={() => formatText('underline')}
          className={`toolbar-btn ${activeFormats.underline ? 'active' : ''}`}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Lists */}
      <div className="toolbar-group">
        <button
          onClick={() =>
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
          className="toolbar-btn"
          title="Bullet List"
        >
          ⊙
        </button>
        <button
          onClick={() =>
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
          }
          className="toolbar-btn"
          title="Numbered List"
        >
          ①
        </button>
      </div>
    </div>
  );
}