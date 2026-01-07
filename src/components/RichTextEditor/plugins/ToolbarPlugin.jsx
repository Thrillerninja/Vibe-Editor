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

const BLOCK_TYPES = [
  ['paragraph', 'Content'],
  ['h1', 'H1'],
  ['h2', 'H2'],
  ['h3', 'H3'],
  ['quote', 'Quote'],
];

export default function ToolbarPlugin() {
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

  const toolbarButtonStyle = {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#374151',
    transition: 'all 0.2s ease',
    flexShrink: 0,
    padding: 0,
  };

  const separatorStyle = {
    width: '1px',
    height: '16px',
    backgroundColor: '#d1d5db',
    margin: '0 4px',
    flexShrink: 0,
  };

  const blockMenuStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    minWidth: '140px',
    zIndex: 100,
  };

  const menuItemStyle = {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#374151',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background-color 0.15s ease',
  };

  return (
    <div
      className="flex items-center min-w-[235px] max-w-[420px] gap-1 flex-wrap flex-1"
      style={{
        padding: '0px 14px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        border: '1px solid #e5e7eb',
        borderRadius: '18px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        backdropFilter: 'saturate(180%) blur(4px)',
        margin: '0 auto',
        height: 'fit-content',
        width: 'fit-content',
      }}
    >
      {/* Undo/Redo */}
      <button
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        style={toolbarButtonStyle}
        title="Undo (Ctrl+Z)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        style={toolbarButtonStyle}
        title="Redo (Ctrl+Y)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={separatorStyle} />

      {/* Block Type */}
      <div style={{ position: 'relative', overflow: 'visible' }} ref={blockTypeRef}>
        <button
          onClick={() => setShowBlockMenu(!showBlockMenu)}
          style={{
            ...toolbarButtonStyle,
            backgroundColor: showBlockMenu ? '#f3f4f6' : 'transparent',
            paddingRight: '6px',
            width: 'auto',
            gap: '4px',
          }}
          title="Block type"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }}
          onMouseLeave={(e) => {
            if (!showBlockMenu) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {BLOCK_TYPES.find(([t]) => t === blockType)?.[1] || 'Content'}
          </span>
        </button>

        {showBlockMenu && (
          <div style={blockMenuStyle}>
            {BLOCK_TYPES.map(([type, label]) => (
              <button
                key={type}
                onClick={() => formatBlock(type)}
                style={{
                  ...menuItemStyle,
                  backgroundColor: blockType === type ? '#f0f9ff' : 'transparent',
                  color: blockType === type ? '#0369a1' : '#374151',
                  fontWeight: blockType === type ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (blockType !== type) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    blockType === type ? '#f0f9ff' : 'transparent';
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={separatorStyle} />

      {/* Text Formatting */}
      <button
        onClick={() => formatText('bold')}
        style={{
          ...toolbarButtonStyle,
          backgroundColor: activeFormats.bold ? '#e0e7ff' : 'transparent',
          color: activeFormats.bold ? '#4f46e5' : '#374151',
        }}
        title="Bold (Ctrl+B)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.bold
            ? '#e0e7ff'
            : '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.bold
            ? '#e0e7ff'
            : 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6V4zm0 8h10a4 4 0 0 1 0 8H6v-8z" />
        </svg>
      </button>

      <button
        onClick={() => formatText('italic')}
        style={{
          ...toolbarButtonStyle,
          backgroundColor: activeFormats.italic ? '#e0e7ff' : 'transparent',
          color: activeFormats.italic ? '#4f46e5' : '#374151',
        }}
        title="Italic (Ctrl+I)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.italic
            ? '#e0e7ff'
            : '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.italic
            ? '#e0e7ff'
            : 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z" />
        </svg>
      </button>

      <button
        onClick={() => formatText('underline')}
        style={{
          ...toolbarButtonStyle,
          backgroundColor: activeFormats.underline ? '#e0e7ff' : 'transparent',
          color: activeFormats.underline ? '#4f46e5' : '#374151',
        }}
        title="Underline (Ctrl+U)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.underline
            ? '#e0e7ff'
            : '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = activeFormats.underline
            ? '#e0e7ff'
            : 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3M4 21h16" strokeLinecap="round" />
        </svg>
      </button>

      <div style={separatorStyle} />

      {/* Lists */}
      <button
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
        style={toolbarButtonStyle}
        title="Bullet List"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="9" y1="6" x2="20" y2="6" strokeLinecap="round" />
          <line x1="9" y1="12" x2="20" y2="12" strokeLinecap="round" />
          <line x1="9" y1="18" x2="20" y2="18" strokeLinecap="round" />
          <line x1="5" y1="6" x2="5" y2="6.01" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="5" y1="12" x2="5" y2="12.01" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="5" y1="18" x2="5" y2="18.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
        style={toolbarButtonStyle}
        title="Numbered List"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 6h11M10 12h11M10 18h11" strokeLinecap="round" />
          <path d="M4 6h1v4M4 13h2M6 13v-2c0-1-1-2-2-2s-2 1-2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={separatorStyle} />

      {/* Links */}
      <button
        onClick={() => setShowLinkInput(!showLinkInput)}
        style={{
          ...toolbarButtonStyle,
          backgroundColor: showLinkInput ? '#e0e7ff' : 'transparent',
          color: showLinkInput ? '#4f46e5' : '#374151',
        }}
        title="Add Link (Ctrl+K)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = showLinkInput
            ? '#e0e7ff'
            : '#f3f4f6';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = showLinkInput
            ? '#e0e7ff'
            : 'transparent';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
                  const nodes = selection.getNodes();
                  nodes.forEach(node => {
                    if (node.isTextContent?.()) {
                      node.setFormat(node.getFormat() | 8);
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
            padding: '5px 8px',
            marginLeft: '2px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            minWidth: '140px',
            fontSize: '12px',
            backgroundColor: 'white',
            color: '#374151',
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#4f46e5';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
        />
      )}
    </div>
  );
}