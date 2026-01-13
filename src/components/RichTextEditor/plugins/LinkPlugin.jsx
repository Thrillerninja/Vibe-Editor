import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useState } from 'react';
import { $getSelection, $isRangeSelection, SELECTION_CHANGE_COMMAND } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { LinkNode, $createLinkNode, $isLinkNode } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';

export function LinkPlugin() {
  const [editor] = useLexicalComposerContext();
  const [canAddLink, setCanAddLink] = useState(false);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          setCanAddLink($isRangeSelection(selection) && !selection.isCollapsed());
        });
        return false;
      }),
      editor.registerNodeTransform(LinkNode, (node) => {
        // Auto-link detection
        const content = node.getTextContent();
        if (isValidUrl(content) && !node.getURL()) {
          node.setURL(content);
        }
      })
    );
  }, [editor]);

  const addLink = useCallback((url) => {
    if (!canAddLink) return;
    
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        nodes.forEach(node => {
          const parent = node.getParent();
          if (parent && !$isLinkNode(parent)) {
            const linkNode = $createLinkNode({ url });
            node.insertBefore(linkNode);
          }
        });
      }
    });
  }, [editor, canAddLink]);

  return null;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}