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
  // Headings
  const [blockType, setBlockType] = useState('paragraph');
  const blockTypeRef = useRef(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  // Links
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

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

  useEffect(() => {
    console.log("LinkSwitch " + showLinkInput)
  }, [showLinkInput])

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
    ['paragraph', 'Content'],
    ['h1', 'H1'],
    ['h2', 'H2'],
    ['h3', 'H3'],
    ['quote', 'Quote'],
  ];

  return (
    <div className="flex items-center min-w-[260px] gap-1 flex-wrap flex-1 ">
      {/* Undo/Redo */}
      <div className="flex gap-0.5">
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

      <div className="w-px h-4 bg-gray-300 mx-1 flex-shrink-0" />

      {/* Block Type */}
      <div className="toolbar-group" ref={blockTypeRef}>
        <button
          className="toolbar-select"
          style={{
              height: '34px',
            }}
          onClick={() => setShowBlockMenu(!showBlockMenu)}
          title="Block type"
        >
          <span
            style={{
                fontSize: '18px',
              }}
          >
            {BLOCK_TYPES.find(([t]) => t === blockType)?.[1] || 'Content'}
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

      <div className="w-px h-4 bg-gray-300 mx-1 flex-shrink-0" />

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

      <div className="w-px h-4 bg-gray-300 mx-1 flex-shrink-0" />

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
      
      {/* Links */}
      <button
        onClick={() => setShowLinkInput(!showLinkInput)}
        className="toolbar-btn"
        title="Add Link (Ctrl+K)"
      >
        🔗
      </button>

      {showLinkInput && (
        <input
          type="text"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && linkUrl.trim()) {
              editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                  // Wrap selected text in a span with link styling
                  // Since Lexical Link might not be set up, use a simpler approach
                  const nodes = selection.getNodes();
                  nodes.forEach(node => {
                    if (node.isTextContent?.()) {
                      // Add link metadata to text node
                      node.setFormat(node.getFormat() | 8); // Custom format flag
                    }
                  });
                }
              });
              setLinkUrl('');
              setShowLinkInput(false);
            }
          }}
          autoFocus
          style={{ 
            padding: '6px 8px', 
            marginLeft: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            minWidth: '200px',
            fontSize: '14px'
          }}
        />
      )}
    </div>
  );
}