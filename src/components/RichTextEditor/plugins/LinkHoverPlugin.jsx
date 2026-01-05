// src/components/RichTextEditor/plugins/LinkHoverPlugin.jsx
import { useEffect, useState, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function LinkHoverPlugin() {
  const [editor] = useLexicalComposerContext();
  const [hoveredLink, setHoveredLink] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [isOverPopup, setIsOverPopup] = useState(false);
  const editorRef = useRef(null);
  const popupTimeoutRef = useRef(null);

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    editorRef.current = editorElement;

    const handleMouseMove = (e) => {
      if (isOverPopup) return;

      const target = e.target;

      const linkElement = target.closest('a');
      if (linkElement && linkElement.href) {
        const rect = linkElement.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();

        setHoveredLink({
          url: linkElement.href,
          text: linkElement.textContent,
        });

        setPopupPos({
          x: rect.left - editorRect.left + rect.width / 2,
          y: rect.top - editorRect.top - 40,
        });

        if (popupTimeoutRef.current) {
          clearTimeout(popupTimeoutRef.current);
        }
        return;
      }

      if (target.nodeType === Node.TEXT_NODE) {
        const text = target.textContent;
        const parentRect = target.parentElement.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();

        let match;
        const markdownRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        
        while ((match = markdownRegex.exec(text)) !== null) {
          const linkText = match[1];
          const url = match[2];
          const startIdx = match.index;
          const endIdx = match.index + match[0].length;

          const cursorOffset = getCursorOffset(target, e.clientX);
          if (cursorOffset >= startIdx && cursorOffset <= endIdx) {
            setHoveredLink({ url, text: linkText });
            setPopupPos({
              x: parentRect.left - editorRect.left + parentRect.width / 2,
              y: parentRect.top - editorRect.top - 45,
            });

            if (popupTimeoutRef.current) {
              clearTimeout(popupTimeoutRef.current);
            }
            return;
          }
        }

        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
        while ((match = urlRegex.exec(text)) !== null) {
          const url = match[1];
          const startIdx = match.index;
          const endIdx = match.index + url.length;

          const cursorOffset = getCursorOffset(target, e.clientX);
          if (cursorOffset >= startIdx && cursorOffset <= endIdx) {
            const fullUrl = url.startsWith('www.') ? 'https://' + url : url;
            setHoveredLink({ url: fullUrl, text: url });
            setPopupPos({
              x: parentRect.left - editorRect.left + parentRect.width / 2,
              y: parentRect.top - editorRect.top - 45,
            });

            if (popupTimeoutRef.current) {
              clearTimeout(popupTimeoutRef.current);
            }
            return;
          }
        }
      }

      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
      popupTimeoutRef.current = setTimeout(() => {
        setHoveredLink(null);
      }, 100);
    };

    editorElement.addEventListener('mousemove', handleMouseMove);

    return () => {
      editorElement.removeEventListener('mousemove', handleMouseMove);
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
    };
  }, [editor, isOverPopup]);

  if (!hoveredLink) return null;

  return (
    <LinkPopup
      url={hoveredLink.url}
      position={popupPos}
      onMouseEnter={() => setIsOverPopup(true)}
      onMouseLeave={() => {
        setIsOverPopup(false);
        setHoveredLink(null);
      }}
    />
  );
}

function getCursorOffset(textNode, clientX) {
  const range = document.createRange();
  const preCaretRange = range.cloneRange();

  try {
    const rects = textNode.parentElement.getClientRects();
    if (rects.length === 0) return -1;

    let offset = 0;
    for (let i = 0; i < textNode.length; i++) {
      preCaretRange.setStart(textNode, i);
      preCaretRange.setEnd(textNode, i + 1);
      const charRect = preCaretRange.getBoundingClientRect();
      if (charRect.left <= clientX && clientX <= charRect.right) {
        offset = i;
        break;
      }
    }
    return offset;
  } catch (e) {
    return -1;
  }
}

function LinkPopup({ url, position, onMouseEnter, onMouseLeave }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Show full URL (not just hostname)
  const displayUrl = url;
  const maxChars = 30;
  const truncatedUrl = displayUrl.length > maxChars 
    ? displayUrl.substring(0, maxChars) + '...' 
    : displayUrl;

  console.log('LinkPopup - URL:', displayUrl, 'Truncated:', truncatedUrl, 'Expanded:', isExpanded);

  return (
    <div
      className="absolute bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto',
        maxWidth: isExpanded ? '600px' : 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span 
        className="text-sm text-gray-600 break-all"
        title={url}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? displayUrl : truncatedUrl}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, '_blank');
        }}
        className="flex-shrink-0 flex items-center justify-center w-5 h-5 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
        title="Open link in new tab"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
    </div>
  );
}