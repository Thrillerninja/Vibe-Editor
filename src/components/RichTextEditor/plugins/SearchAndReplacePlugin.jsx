import { useState, useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_MODIFIER_COMMAND,
} from 'lexical';
import '../styles/editor.css';

export function SearchAndReplacePlugin() {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matches, setMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [showReplace, setShowReplace] = useState(false);

  // Register Ctrl+F shortcut
  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event) => {
        const { code, ctrlKey, metaKey } = event;
        
        if ((ctrlKey || metaKey) && code === 'KeyF') {
          event.preventDefault();
          setIsOpen(true);
          setShowReplace(false);
          return true;
        }

        // Ctrl+H for replace
        if ((ctrlKey || metaKey) && code === 'KeyH') {
          event.preventDefault();
          setIsOpen(true);
          setShowReplace(true);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        clearHighlights();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const findMatches = useCallback(() => {
    if (!searchText) {
      setMatches([]);
      return;
    }

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const textContent = root.getTextContent();
      
      let pattern;
      if (useRegex) {
        try {
          pattern = new RegExp(searchText, matchCase ? 'g' : 'gi');
        } catch {
          return; // Invalid regex
        }
      } else {
        let escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) {
          escaped = `\\b${escaped}\\b`;
        }
        pattern = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }

      const foundMatches = [];
      let match;
      while ((match = pattern.exec(textContent)) !== null) {
        foundMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        });
      }

      setMatches(foundMatches);
      setCurrentMatchIndex(foundMatches.length > 0 ? 0 : -1);
    });
  }, [editor, searchText, matchCase, wholeWord, useRegex]);

  useEffect(() => {
    if (isOpen) {
      findMatches();
    }
  }, [isOpen, findMatches]);

  const navigateToMatch = useCallback(
    (index) => {
      if (index < 0 || index >= matches.length) return;

      const match = matches[index];
      editor.update(() => {
        const root = $getRoot();
        const textContent = root.getTextContent();
        
        // Find the node at this position
        let currentOffset = 0;
        const paragraphs = root.getChildren();
        
        for (const paragraph of paragraphs) {
          const paragraphText = paragraph.getTextContent();
          const paragraphEnd = currentOffset + paragraphText.length;
          
          if (match.start >= currentOffset && match.start < paragraphEnd) {
            const textNodes = paragraph.getChildren();
            let nodeOffset = currentOffset;
            
            for (const textNode of textNodes) {
              const nodeText = textNode.getTextContent();
              const nodeEnd = nodeOffset + nodeText.length;
              
              if (match.start >= nodeOffset && match.start < nodeEnd) {
                const localStart = match.start - nodeOffset;
                const localEnd = Math.min(match.end - nodeOffset, nodeText.length);
                
                const selection = $createRangeSelection();
                selection.anchor.set(textNode.getKey(), localStart, 'text');
                selection.focus.set(textNode.getKey(), localEnd, 'text');
                $setSelection(selection);
                
                // Scroll into view
                const editorElement = editor.getRootElement();
                if (editorElement) {
                  const range = window.getSelection()?.getRangeAt(0);
                  if (range) {
                    const rect = range.getBoundingClientRect();
                    editorElement.scrollTop += rect.top - editorElement.getBoundingClientRect().top - 100;
                  }
                }
                
                return;
              }
              
              nodeOffset = nodeEnd;
            }
            break;
          }
          
          currentOffset = paragraphEnd + 1; // +1 for newline
        }
      });
    },
    [editor, matches]
  );

  useEffect(() => {
    if (currentMatchIndex >= 0) {
      navigateToMatch(currentMatchIndex);
    }
  }, [currentMatchIndex, navigateToMatch]);

  const nextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const prevMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const replaceCurrent = () => {
    if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) return;

    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(replaceText);
      }
    });

    // Re-search after replace
    setTimeout(() => {
      findMatches();
    }, 10);
  };

  const replaceAll = () => {
    if (matches.length === 0) return;

    editor.update(() => {
      const root = $getRoot();
      const textContent = root.getTextContent();
      
      // Replace from end to start to preserve offsets
      const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
      
      let currentOffset = 0;
      const paragraphs = root.getChildren();
      
      sortedMatches.forEach((match) => {
        currentOffset = 0;
        
        for (const paragraph of paragraphs) {
          const paragraphText = paragraph.getTextContent();
          const paragraphEnd = currentOffset + paragraphText.length;
          
          if (match.start >= currentOffset && match.start < paragraphEnd) {
            const textNodes = paragraph.getChildren();
            let nodeOffset = currentOffset;
            
            for (const textNode of textNodes) {
              const nodeText = textNode.getTextContent();
              const nodeEnd = nodeOffset + nodeText.length;
              
              if (match.start >= nodeOffset && match.start < nodeEnd) {
                const localStart = match.start - nodeOffset;
                const localEnd = Math.min(match.end - nodeOffset, nodeText.length);
                
                const newText =
                  nodeText.slice(0, localStart) +
                  replaceText +
                  nodeText.slice(localEnd);
                
                textNode.setTextContent(newText);
                return;
              }
              
              nodeOffset = nodeEnd;
            }
            break;
          }
          
          currentOffset = paragraphEnd + 1;
        }
      });
    });

    // Re-search after replace all
    setTimeout(() => {
      findMatches();
    }, 10);
  };

  const clearHighlights = () => {
    setMatches([]);
    setCurrentMatchIndex(-1);
  };

  if (!isOpen) return null;

  return (
    <div className="search-replace-panel">
      <div className="search-row">
        <input
          type="text"
          className="search-input"
          placeholder="Find"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.shiftKey ? prevMatch() : nextMatch();
            }
          }}
          autoFocus
        />
        
        <div className="search-controls">
          <button
            className="search-icon-button"
            onClick={prevMatch}
            title="Previous Match (Shift+Enter)"
            disabled={matches.length === 0}
          >
            ↑
          </button>
          <button
            className="search-icon-button"
            onClick={nextMatch}
            title="Next Match (Enter)"
            disabled={matches.length === 0}
          >
            ↓
          </button>
          <span className="match-count">
            {matches.length > 0
              ? `${currentMatchIndex + 1} of ${matches.length}`
              : 'No results'}
          </span>
        </div>

        <div className="search-options">
          <button
            className={`option-button ${matchCase ? 'active' : ''}`}
            onClick={() => setMatchCase(!matchCase)}
            title="Match Case"
          >
            Aa
          </button>
          <button
            className={`option-button ${wholeWord ? 'active' : ''}`}
            onClick={() => setWholeWord(!wholeWord)}
            title="Match Whole Word"
          >
            |ab|
          </button>
          <button
            className={`option-button ${useRegex ? 'active' : ''}`}
            onClick={() => setUseRegex(!useRegex)}
            title="Use Regular Expression"
          >
            .*
          </button>
        </div>

        <button
          className="toggle-replace-button"
          onClick={() => setShowReplace(!showReplace)}
          title="Toggle Replace"
        >
          {showReplace ? '▼' : '▶'}
        </button>

        <button
          className="close-button"
          onClick={() => {
            setIsOpen(false);
            clearHighlights();
          }}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {showReplace && (
        <div className="replace-row">
          <input
            type="text"
            className="search-input"
            placeholder="Replace"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                replaceCurrent();
              }
            }}
          />
          
          <div className="replace-controls">
            <button
              className="replace-button"
              onClick={replaceCurrent}
              disabled={matches.length === 0}
            >
              Replace
            </button>
            <button
              className="replace-button"
              onClick={replaceAll}
              disabled={matches.length === 0}
            >
              Replace All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function clearHighlights() {
  // Remove any search highlights from the editor
}