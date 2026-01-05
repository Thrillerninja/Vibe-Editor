// In AnimatedNodeComponent.jsx

import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { measureLabel } from '../../utils/measurements';
import { NODE_STYLES, NODE_WIDTH, LOGGING_ENABLED, LOG_PREFIX, EMOTION_COLORS, EMOTIONS } from '../../utils/constants';
import { EmotionSelectorPortal } from '../EmotionSelector/EmotionSelectorPortal';
import '../../components/TreeVisualization/TreeNode.css';
import { EMOTION_LABELS } from '../../utils/constants';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';

/**
 * Gets node background color based on emotion
 */
function getEmotionColor(emotion, intensity, type) {
  // Try to get color from EMOTION_COLORS, fallback to a default
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  //console.log('[AnimatedNodeComponent] getEmotionColor for', emotion, 'intensity', intensity, 'type', type, '=>', colors);
  if (!colors) return '#ffffff';
  if (typeof intensity === 'number') {
    if (intensity < 33) return colors.light;
    if (intensity < 66) return colors.medium;
    return colors.strong;
  }
  return colors.medium;
}

/**
 * Gets border color based on emotion
 */
function getBorderColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  return colors?.strong || '#222';
}

/**
 * AnimatedNodeComponent - Renders a single node in the tree
 */
export function AnimatedNodeComponent({ id, data }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nodeText, setNodeText] = useState(data.content || data.label || "");
  const [previousText, setPreviousText] = useState(data.content || data.label || "");
  const [isNodeRewriting, setIsNodeRewriting] = useState(false);
  const [nodeModified, setNodeModified] = useState(data.isDirty);
  const [emotion, setEmotion] = useState(data.emotion || 'neutral');
  const [intensity, setIntensity] = useState(data.intensity ?? 50);
  const [selectedIntensity, setSelectedIntensity] = useState(intensity);
  const [suggestions, setSuggestions] = useState([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  // Subtree editing state (for non-sentence/group nodes)
  const [subtreeEmotion, setSubtreeEmotion] = useState(data.emotion || 'neutral');
  const [subtreeIntensity, setSubtreeIntensity] = useState(data.intensity ?? 50);
  const [leafSuggestions, setLeafSuggestions] = useState({}); // id -> { original, options, selectedIdx }
  const [leafOrder, setLeafOrder] = useState([]);
  const [activeTab, setActiveTab] = useState('information');
  const emotionColor = getEmotionColor(emotion, intensity, data.type);
  const border = getBorderColor(emotion, intensity, data.type);
  const [previousEmotion, setPreviousEmotion] = useState(emotion);
  const subtreeEmotionColor = getEmotionColor(subtreeEmotion, subtreeIntensity, data.type);
  const modalAccentColor = data.type === 'sentence' ? emotionColor : subtreeEmotionColor;

  useEffect(() => {
    setNodeModified(data.isDirty);
  }, [data.isDirty]);

  useEffect(() => {
    setEmotion(data.emotion || 'neutral');
    setPreviousEmotion(data.emotion || 'neutral');
    setPreviousText(data.content || data.label || "");
    setSubtreeEmotion(data.emotion || 'neutral');
    setSubtreeIntensity(typeof data.intensity === 'number' ? data.intensity : 50);
  }, [data.emotion]);

  function handleSave() {
    if (!(data.content === nodeText)) {

      setIntensity(selectedIntensity);
      data.applyNodeSentenceEdit(id, nodeText);
    } else {

      setSelectedIntensity(intensity);
    }
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setIsDialogOpen(false);
    if (nodeText.length === 0) {
      // If the node text is empty after saving, we delete the node
      data.deleteNodeSentence(id);
    }
  }


  function handleCancel() {
    // Restore prior emotion and text for sentence nodes
    setEmotion(previousEmotion);
    setNodeText(previousText);
    // Clear sentence suggestions
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    // Clear subtree state and revert emotion/intensity
    setLeafSuggestions({});
    setLeafOrder([]);
    setSubtreeEmotion(previousEmotion);
    setSubtreeIntensity(typeof data.intensity === 'number' ? data.intensity : 50);
    // Close dialog
    setIsDialogOpen(false);
  }

  function setNodeIntensity(inputIntensity) {
    setSelectedIntensity(inputIntensity);
  }

  function setSubtreeNodeIntensity(inputIntensity) {
    setSubtreeIntensity(inputIntensity);
  }

  async function selectEmotion(inputEmotion) {
    if (isNodeRewriting) return;
    if (inputEmotion === emotion) return;
    setIsNodeRewriting(true);
    setEmotion(inputEmotion);
    // Optional: inform user
    // alert(`Selected emotion: ${inputEmotion} (${EMOTION_LABELS[inputEmotion] || 'No label'})`);
    try {
      const options = await rewriteSentenceWithEmotionOptions(nodeText, inputEmotion, selectedIntensity, 3);
      setSuggestions(options);
      setCurrentSuggestionIndex(0);
      if (options && options.length > 0) {
        setNodeText(options[0]);
      }
    } catch (e) {
      console.error('Failed to get rewrite options:', e);
    }
    setIsNodeRewriting(false);
  }

  // Subtree: load rewrite options for all leaf sentences under this node
  async function selectSubtreeEmotion(inputEmotion) {
    if (isNodeRewriting) return;
    setIsNodeRewriting(true);
    setSubtreeEmotion(inputEmotion);
    try {
      const leaves = typeof data.getSubtreeLeaves === 'function' ? data.getSubtreeLeaves(id) : [];
      setLeafOrder(leaves.map(l => l.id));
      const optionsList = await Promise.all(
        leaves.map(async (leaf) => {
          try {
            const opts = await rewriteSentenceWithEmotionOptions(leaf.content, inputEmotion, subtreeIntensity, 3);
            return { id: leaf.id, original: leaf.content, options: opts || [], selectedIdx: (opts && opts.length > 0) ? 0 : -1, editedText: (opts && opts.length > 0) ? opts[0] : leaf.content };
          } catch (e) {
            console.error('Failed to get options for leaf', leaf.id, e);
            return { id: leaf.id, original: leaf.content, options: [], selectedIdx: -1, editedText: leaf.content };
          }
        })
      );
      const map = {};
      optionsList.forEach(entry => { map[entry.id] = entry; });
      setLeafSuggestions(map);
    } catch (e) {
      console.error('Failed subtree emotion rewrite:', e);
    }
    setIsNodeRewriting(false);
  }

  function rotateLeafPrev(leafId) {
    const entry = leafSuggestions[leafId];
    if (!entry || !entry.options || entry.options.length === 0) return;
    const newIdx = (entry.selectedIdx - 1 + entry.options.length) % entry.options.length;
    setLeafSuggestions(prev => ({ ...prev, [leafId]: { ...entry, selectedIdx: newIdx, editedText: entry.options[newIdx] } }));
  }

  function rotateLeafNext(leafId) {
    const entry = leafSuggestions[leafId];
    if (!entry || !entry.options || entry.options.length === 0) return;
    const newIdx = (entry.selectedIdx + 1) % entry.options.length;
    setLeafSuggestions(prev => ({ ...prev, [leafId]: { ...entry, selectedIdx: newIdx, editedText: entry.options[newIdx] } }));
  }

  function showPrevSuggestion() {
    if (!suggestions || suggestions.length === 0) return;
    const newIdx = (currentSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    setCurrentSuggestionIndex(newIdx);
    setNodeText(suggestions[newIdx]);
  }

  function showNextSuggestion() {
    if (!suggestions || suggestions.length === 0) return;
    const newIdx = (currentSuggestionIndex + 1) % suggestions.length;
    setCurrentSuggestionIndex(newIdx);
    setNodeText(suggestions[newIdx]);
  }

  // Dialog/modal for editing node - redesigned
  const dialog = isDialogOpen ? createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 0,
          maxWidth: 600,
          width: "90%",
          height: '72vh',
          maxHeight: '72vh',
          border: `3px solid ${modalAccentColor}`,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#000"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs header - simplified underline style */}
        {!isNodeRewriting && (
          <div
            style={{
              padding: '0 16px',
              borderBottom: '1px solid #e5e7eb',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              {['information', 'editing'].map((key) => {
                const label = key === 'information' ? 'Information' : 'Editing';
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      padding: '12px 4px',
                      margin: 0,
                      cursor: 'pointer',
                      color: active ? '#111827' : '#6b7280',
                      fontSize: 14,
                      fontWeight: active ? 600 : 500,
                      position: 'relative',
                      outline: 'none',
                    }}
                  >
                    <span>{label}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 2,
                        backgroundColor: active ? '#000000' : 'transparent',
                        borderRadius: 2,
                        transition: 'background-color 120ms ease',
                      }}
                    />
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleCancel}
              disabled={isNodeRewriting}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        {!isNodeRewriting && (
          <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
            {/* Information Tab */}
            {activeTab === 'information' && (
              <div style={{
                padding: "24px 24px 16px 24px",
                background: "#fff"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div><strong>Content:</strong> {data.content || data.label || "-"}</div>
                  <div><strong>Emotion:</strong> {data.type === 'sentence' ? emotion : subtreeEmotion}</div>
                  <div><strong>Intensity:</strong> {data.type === 'sentence' ? intensity : subtreeIntensity}</div>
                  <div><strong>Type:</strong> {data.type || "-"}</div>
                  {data.author && <div><strong>Author:</strong> {data.author}</div>}
                  {data.timestamp && <div><strong>Timestamp:</strong> {data.timestamp}</div>}
                </div>
              </div>
            )}

            {/* Editing Tab: Sentence editing */}
            {activeTab === 'editing' && data.type === "sentence" && (
              <div style={{ padding: "20px 24px 16px 24px", background: "#fff" }}>
            {/* Options Section: actions like delete */}
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Options</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button
                title="Delete this sentence"
                onClick={(e) => {
                  e.stopPropagation();
                  const ok = window.confirm('Delete this sentence? This cannot be undone.');
                  if (ok && typeof data.deleteNodeSentence === 'function') {
                    data.deleteNodeSentence(id);
                    setIsDialogOpen(false);
                  }
                }}
                disabled={isNodeRewriting}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
                }}
              >
                Delete
              </button>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Edit Content</div>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={showPrevSuggestion}
                  disabled={isNodeRewriting}
                  title="Previous option"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    background: '#f8f8f8',
                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                  }}
                >
                  ◀
                </button>
                <div style={{ fontSize: 12, color: '#555' }}>
                  Option {currentSuggestionIndex + 1} / {suggestions.length}
                </div>
                <button
                  onClick={showNextSuggestion}
                  disabled={isNodeRewriting}
                  title="Next option"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    background: '#f8f8f8',
                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                  }}
                >
                  ▶
                </button>
              </div>
            )}
            <textarea
              value={nodeText}
              onChange={(e) => setNodeText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 120,
                padding: 10,
                borderRadius: 6,
                border: "1px solid #bbb",
                marginBottom: 16,
                color: "#000000",
                resize: "vertical"
              }}
            />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Select Emotion:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(EMOTION_COLORS).map(([optEmotion, colors]) => {
                  const isSelected = emotion.toLowerCase() === optEmotion.toLocaleLowerCase();
                  return (
                    <button
                      key={optEmotion}
                      onClick={() => selectEmotion(optEmotion)}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: isSelected ? colors.medium : '#f5f5f5',
                        color: isSelected ? '#fff' : '#333',
                        border: `1px solid ${isSelected ? colors.strong : '#ccc'}`,
                        borderRadius: '4px',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: isSelected ? '600' : '400',
                        textTransform: 'capitalize'
                      }}
                    >
                      {optEmotion}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Intensity: {selectedIntensity}</div>
              <input
                type="range"
                min="0"
                max="99"
                value={selectedIntensity}
                onChange={(e) => setNodeIntensity(parseInt(e.target.value))}
                disabled={isNodeRewriting}
                style={{
                  accentColor: emotionColor,
                  backgroundColor: '#f',
                  color: '#10B981',
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  background: emotionColor,
                  outline: 'none',
                  cursor: isNodeRewriting ? 'not-allowed' : 'pointer'
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={handleCancel}
                disabled={isNodeRewriting}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isNodeRewriting}
                style={{
                  padding: "8px 14px",
                  background: "#10B981",
                  color: "white",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
              </div>
            )}

            {/* Close button for non-editable nodes */}
            {/* Editing Tab: Subtree editing */}
            {activeTab === 'editing' && data.type !== "sentence" && (
              <div style={{ padding: "20px 24px", background: "#fff" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Edit Subtree</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Select Emotion for Subtree:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(EMOTION_COLORS).map(([optEmotion, colors]) => {
                  const isSelected = subtreeEmotion.toLowerCase() === optEmotion.toLocaleLowerCase();
                  return (
                    <button
                      key={optEmotion}
                      onClick={() => selectSubtreeEmotion(optEmotion)}
                      disabled={isNodeRewriting}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: isSelected ? colors.medium : '#f5f5f5',
                        color: isSelected ? '#fff' : '#333',
                        border: `1px solid ${isSelected ? colors.strong : '#ccc'}`,
                        borderRadius: '4px',
                        cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: isSelected ? '600' : '400',
                        textTransform: 'capitalize'
                      }}
                    >
                      {optEmotion}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: '500', marginBottom: '8px' }}>Intensity: {subtreeIntensity}</div>
              <input
                type="range"
                min="0"
                max="99"
                value={subtreeIntensity}
                onChange={(e) => setSubtreeNodeIntensity(parseInt(e.target.value))}
                disabled={isNodeRewriting}
                style={{
                  accentColor: subtreeEmotionColor,
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  background: subtreeEmotionColor,
                  outline: 'none',
                  cursor: isNodeRewriting ? 'not-allowed' : 'pointer'
                }}
              />
            </div>

            {/* Leaf suggestions list */}
            {leafOrder.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {leafOrder.map(leafId => {
                    const entry = leafSuggestions[leafId];
                    if (!entry) return null;
                    const currentText = entry.editedText ?? ((entry.options && entry.options.length > 0 && entry.selectedIdx >= 0) ? entry.options[entry.selectedIdx] : entry.original);
                    return (
                      <div key={leafId} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <button
                            onClick={() => rotateLeafPrev(leafId)}
                            disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                            title="Previous option"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              border: '1px solid #ccc',
                              background: '#f8f8f8',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ◀
                          </button>
                          <div style={{ fontSize: 12, color: '#555' }}>
                            {entry.options && entry.options.length > 0 ? `Option ${entry.selectedIdx + 1} / ${entry.options.length}` : 'No options'}
                          </div>
                          <button
                            onClick={() => rotateLeafNext(leafId)}
                            disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                            title="Next option"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              border: '1px solid #ccc',
                              background: '#f8f8f8',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ▶
                          </button>
                        </div>
                        <textarea
                          value={currentText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLeafSuggestions(prev => ({ ...prev, [leafId]: { ...entry, editedText: val } }));
                          }}
                          style={{
                            width: '100%',
                            minHeight: 100,
                            padding: 8,
                            borderRadius: 6,
                            border: '1px solid #bbb',
                            color: '#000000',
                            resize: 'vertical'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={handleCancel}
                disabled={isNodeRewriting}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Build edits map
                  const edits = {};
                  Object.keys(leafSuggestions).forEach(k => {
                    const e = leafSuggestions[k];
                    const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                    if (chosen && chosen.length > 0) edits[k] = chosen;
                  });
                  if (typeof data.applySubtreeChanges === 'function') {
                    data.applySubtreeChanges(id, subtreeEmotion, subtreeIntensity, edits);
                  }
                  // Reset and close
                  setLeafSuggestions({});
                  setLeafOrder([]);
                  setIsDialogOpen(false);
                }}
                disabled={isNodeRewriting}
                style={{
                  padding: "8px 14px",
                  background: "#10B981",
                  color: "white",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
              </div>
            )}
          </div>
        )}
        {/* Loading spinner if rewriting */}
        {isNodeRewriting && (
          <div style={{ padding: "32px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: "5px solid #ccc",
                borderTop: `5px solid ${modalAccentColor}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <motion.div
        className={nodeModified ? "animated-border" : ""}
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        style={{
          padding: 12,
          borderRadius: 8,
          color: "black",
          textAlign: "center",
          cursor: "pointer",
          width: 200,
          background: emotionColor,
          border: nodeModified ? `2px solid ${border}` : '2px solid transparent',
          position: 'relative',
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 32px 8px 8px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: data.type === 'root' ? 600 : 500,
            color: '#000',
            lineHeight: 1.45,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {data.label}{"\n"}
        </div>
        {nodeModified && (
          <div className="modified-indicator" title="This node has been modified.">
            !
          </div>
        )}
      </motion.div>
      {dialog}
    </>
  );
}