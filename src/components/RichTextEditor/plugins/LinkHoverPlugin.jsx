/**
 * @fileoverview LinkHoverPlugin - Link detection and preview popup
 *
 * Detects links in two formats:
 * - HTML anchor tags (from Lexical)
 * - Markdown syntax [text](url)
 * - Raw URLs (https://... or www....)
 *
 * Shows a preview popup on hover with link details and open button.
 */

import { useEffect, useState, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

// =========================================================================
// TYPES
// =========================================================================

/**
 * @typedef {Object} HoveredLinkData
 * @property {string} url - Full URL
 * @property {string} text - Display text/anchor text
 */

/**
 * @typedef {Object} PopupPosition
 * @property {number} x - X coordinate (px)
 * @property {number} y - Y coordinate (px)
 */

// =========================================================================
// MAIN PLUGIN
// =========================================================================

/**
 * LinkHoverPlugin - Detects and displays link previews
 *
 * Features:
 * - Detects HTML links, markdown links, and raw URLs
 * - Shows popup with link URL and open button
 * - Handles cursor positioning for text nodes
 * - Prevents popup hiding when hovering over it
 *
 * @returns {React.ReactElement | null}
 */
export default function LinkHoverPlugin() {
  // =========================================================================
  // STATE
  // =========================================================================

  /** @type {[HoveredLinkData | null, Function]} Currently hovered link data */
  const [hoveredLink, setHoveredLink] = useState(null);

  /** @type {[PopupPosition, Function]} Popup position in screen coordinates */
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  /** @type {[boolean, Function]} Whether mouse is over the popup itself */
  const [isOverPopup, setIsOverPopup] = useState(false);

  // =========================================================================
  // REFS
  // =========================================================================

  /** @type {React.MutableRefObject<HTMLElement>} Cached editor root element */
  const editorRef = useRef(null);

  /** @type {React.MutableRefObject<NodeJS.Timeout>} Timeout for hiding popup on leave */
  const popupTimeoutRef = useRef(null);

  // Get Lexical editor instance
  const [editor] = useLexicalComposerContext();

  // =========================================================================
  // INITIALIZATION & CLEANUP
  // =========================================================================

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    editorRef.current = editorElement;

    /**
     * Handle mouse movement over editor - detect links
     *
     * Checks in order:
     * 1. HTML anchor tags
     * 2. Markdown link syntax [text](url)
     * 3. Raw URLs (http/www)
     *
     * @param {MouseEvent} e
     * @returns {void}
     */
    const handleMouseMove = (e) => {
      // Ignore movement over the popup itself
      if (isOverPopup) return;

      const target = e.target;

      // =========================================================
      // CHECK 1: HTML ANCHOR TAG
      // =========================================================

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

        clearTimeout(popupTimeoutRef.current);
        return;
      }

      // =========================================================
      // CHECK 2 & 3: TEXT NODE - MARKDOWN & RAW URLS
      // =========================================================

      if (target.nodeType === Node.TEXT_NODE) {
        const text = target.textContent;
        const parentRect = target.parentElement.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();

        // Check for markdown [text](url) format
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

            clearTimeout(popupTimeoutRef.current);
            return;
          }
        }

        // Check for raw URLs (https://, http://, www....)
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

        while ((match = urlRegex.exec(text)) !== null) {
          const url = match[1];
          const startIdx = match.index;
          const endIdx = match.index + url.length;

          const cursorOffset = getCursorOffset(target, e.clientX);
          if (cursorOffset >= startIdx && cursorOffset <= endIdx) {
            // Ensure full URL with protocol
            const fullUrl = url.startsWith('www.')
              ? 'https://' + url
              : url;

            setHoveredLink({ url: fullUrl, text: url });
            setPopupPos({
              x: parentRect.left - editorRect.left + parentRect.width / 2,
              y: parentRect.top - editorRect.top - 45,
            });

            clearTimeout(popupTimeoutRef.current);
            return;
          }
        }
      }

      // No link detected - hide popup after delay
      clearTimeout(popupTimeoutRef.current);
      popupTimeoutRef.current = setTimeout(() => {
        setHoveredLink(null);
      }, 100);
    };

    editorElement.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      editorElement.removeEventListener('mousemove', handleMouseMove);
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
    };
  }, [editor, isOverPopup]);

  // Only render popup if link is hovered
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

// =========================================================================
// UTILITY FUNCTIONS
// =========================================================================

/**
 * Calculate cursor offset within a text node based on mouse position
 *
 * Used to determine if mouse is over a specific part of text
 * (e.g., within a URL or markdown link)
 *
 * @param {Text} textNode - DOM text node
 * @param {number} clientX - Mouse X coordinate
 * @returns {number} Character offset in text, or -1 if error
 */
function getCursorOffset(textNode, clientX) {
  const range = document.createRange();
  const preCaretRange = range.cloneRange();

  try {
    const rects = textNode.parentElement.getClientRects();
    if (rects.length === 0) return -1;

    // Find character position at cursor
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
    console.warn('[LinkHoverPlugin] Error calculating cursor offset:', e);
    return -1;
  }
}

// =========================================================================
// POPUP COMPONENT
// =========================================================================

/**
 * LinkPopup - Displays link preview with details and open button
 *
 * Features:
 * - Shows truncated URL (30 chars default)
 * - Click to expand full URL
 * - Open link button
 * - Hover to keep open
 *
 * @param {Object} props
 * @param {string} props.url - Full URL to display
 * @param {PopupPosition} props.position - Screen coordinates
 * @param {() => void} props.onMouseEnter - Hover start handler
 * @param {() => void} props.onMouseLeave - Hover end handler
 * @returns {React.ReactElement}
 */
function LinkPopup({ url, position, onMouseEnter, onMouseLeave }) {
  /** @type {[boolean, Function]} Whether full URL is expanded */
  const [isExpanded, setIsExpanded] = useState(false);

  const maxChars = 30;
  const displayUrl = url;
  const truncatedUrl =
    displayUrl.length > maxChars
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
      {/* URL Display */}
      <span
        className="text-sm text-gray-600 break-all cursor-pointer hover:text-gray-800 transition-colors"
        title={url}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? displayUrl : truncatedUrl}
      </span>

      {/* Open Link Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, '_blank');
        }}
        className="flex-shrink-0 flex items-center justify-center w-5 h-5 text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
        title="Open link in new tab"
        aria-label="Open link"
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