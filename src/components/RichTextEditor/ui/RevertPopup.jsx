import React, { useState, useRef, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $createTextNode } from 'lexical';
import { motion, AnimatePresence } from 'framer-motion';

export default function RevertPopup({
  changeId,
  originalText,
  timestamp,
  aiOperation,
  nodeKey,
}) {
  const [editor] = useLexicalComposerContext();
  const [isHovered, setIsHovered] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (isHovered && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setPopupPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    }
  }, [isHovered]);

  const handleRevert = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) {
        const textNode = $createTextNode(originalText);
        node.replace(textNode);
      }
    });
  };

  return (
    <>
      <span
        ref={wrapperRef}
        className="highlight-text"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Content will be rendered by Lexical */}
      </span>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="revert-popup"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              left: popupPosition.x,
              top: popupPosition.y,
              transform: 'translate(-50%, -100%)',
              zIndex: 10000,
            }}
          >
            <div className="popup-content">
              <div className="popup-header">
                <span className="popup-label">AI Change</span>
                <span className="popup-time">
                  {new Date(timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="popup-original">
                <strong>Original:</strong>
                <div className="original-text">{originalText}</div>
              </div>

              <button
                className="revert-button"
                onClick={handleRevert}
                onMouseDown={(e) => e.preventDefault()}
              >
                ↶ Revert to original
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}