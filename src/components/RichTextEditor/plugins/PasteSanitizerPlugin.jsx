import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND, $getRoot } from 'lexical';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $isListNode, $isListItemNode } from '@lexical/list';
import { $isLinkNode } from '@lexical/link';
import { $isTextNode } from 'lexical';

const ALLOWED_HEADING_TAGS = new Set(['h1', 'h2', 'h3']);

/**
 * Strip any formatting that cannot be produced by your toolbar.
 * Keep: bold/italic/underline, links, lists, h1-h3, quote, paragraphs, newlines.
 */
function sanitizeEditorTree() {
  const root = $getRoot();

  // Walk the tree and normalize unsupported structures.
  // We do a manual stack traversal to avoid recursion limits.
  const stack = [root];

  while (stack.length) {
    const node = stack.pop();
    const children = node.getChildren?.() ?? [];

    for (const child of children) {
      stack.push(child);
    }

    // 1) Headings: allow only h1-h3, downgrade h4-h6 to paragraph
    if ($isHeadingNode(node)) {
      const tag = node.getTag();
      if (!ALLOWED_HEADING_TAGS.has(tag)) {
        // replace heading with paragraph containing same children
        const paragraph = node.getParentOrThrow().getChildren
          ? null
          : null;
        // simplest: convert by inserting a paragraph and moving children
        // We'll do it safely:
        const parent = node.getParent();
        if (parent) {
          // Create a paragraph via lexical API:
          // eslint-disable-next-line no-undef
          const { $createParagraphNode } = require('lexical');
          const p = $createParagraphNode();
          p.append(...node.getChildren());
          node.replace(p);
        }
      }
      continue;
    }

    // 2) Quotes: allowed (no action)
    if ($isQuoteNode(node)) continue;

    // 3) Lists/list-items: allowed (optionally restrict nesting)
    if ($isListNode(node) || $isListItemNode(node)) continue;

    // 4) Links: allowed, but ensure link node contains only text nodes (optional)
    if ($isLinkNode(node)) continue;

    // 5) Text nodes: remove unsupported formats (e.g. strikethrough, code, etc.)
    if ($isTextNode(node)) {
      // Keep only bold/italic/underline
      // Lexical format is a bitmask internally; using toggle APIs is easier if available.
      // Here we clear all and reapply allowed ones:
      const allowed = new Set(['bold', 'italic', 'underline']);
      const hasBold = node.hasFormat('bold');
      const hasItalic = node.hasFormat('italic');
      const hasUnderline = node.hasFormat('underline');

      node.setFormat(0);
      if (hasBold) node.toggleFormat('bold');
      if (hasItalic) node.toggleFormat('italic');
      if (hasUnderline) node.toggleFormat('underline');

      // Also remove any style attribute (font-size, line-height, color...)
      // Lexical TextNode supports setStyle('')
      node.setStyle('');
      continue;
    }

    // 6) Everything else: if it exists, unwrap it (flatten) or convert to paragraph
    // Many “unsupported HTML structures” end up as element nodes. If they’re not one
    // of the above, you likely want to unwrap them.
    // Unwrap strategy: replace node with its children (if possible).
    if (node !== root) {
      const parent = node.getParent();
      if (parent && node.getChildren) {
        const kids = node.getChildren();
        if (kids.length > 0) {
          // Move kids up and remove node
          for (const k of kids) {
            node.insertBefore(k);
          }
          node.remove();
        }
      }
    }
  }
}

export default function PasteSanitizerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        // Let Lexical handle the paste first (so links/lists/headings import).
        // Then sanitize in the next update.
        setTimeout(() => {
          editor.update(() => {
            sanitizeEditorTree();
          });
        }, 0);

        return false; // do NOT block default paste
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}