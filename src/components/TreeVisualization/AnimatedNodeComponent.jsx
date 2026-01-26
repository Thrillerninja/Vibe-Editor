// In AnimatedNodeComponent.jsx

import React, { useRef, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { measureLabel } from '../../utils/measurements';
import { NODE_STYLES, NODE_WIDTH, LOGGING_ENABLED, LOG_PREFIX, EMOTION_COLORS, EMOTIONS, EMOTION_AXES } from '../../utils/constants';
import { EmotionSelectorPortal } from '../EmotionSelector/EmotionSelectorPortal';
import '../../components/TreeVisualization/TreeNode.css';
import { EMOTION_LABELS } from '../../utils/constants';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';
import { normalizeEmotionProfile, deriveLegacyFromProfile, profileFromLegacy } from '../../utils/emotionProfiles.js';
import { getSecondaryEmotions, getSecondaryEmotionTooltip } from '../../utils/secondaryEmotions.js';
import EmotionRadar from '../EmotionSelector/EmotionRadar.jsx';

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
 * Gets significant emotions from profile (above threshold)
 * Returns array of {emotion, intensity, color} sorted by intensity descending
 */
function getSignificantEmotions(profile, threshold = 30) {
  const normalized = normalizeEmotionProfile(profile);
  const secondary = getSecondaryEmotions(normalized);
  
  // Enrich with colors
  return secondary.map(item => {
    const colors = EMOTION_COLORS[item.emotion];
    const color = colors ?
      (item.intensity >= 66 ? colors.strong : item.intensity >= 33 ? colors.medium : colors.light) :
      '#e5e7eb';
    return { emotion: item.emotion, intensity: item.intensity, color };
  });
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
  // Check for merging state from data prop
  const [isNodeMerging, setIsNodeMerging] = useState(false);
  const initialProfile = normalizeEmotionProfile(
    data.emotions ?? profileFromLegacy(data.emotion, data.intensity)
  );
  const initialLegacy = deriveLegacyFromProfile(initialProfile);
  const [emotionProfile, setEmotionProfile] = useState(initialProfile);
  const [originalEmotionProfile, setOriginalEmotionProfile] = useState(initialProfile);
  const [emotion, setEmotion] = useState(initialLegacy.emotion || 'interest');
  const [intensity, setIntensity] = useState(initialLegacy.intensity ?? 0);
  const [selectedIntensity, setSelectedIntensity] = useState(initialLegacy.intensity ?? 0);
  const [suggestions, setSuggestions] = useState([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  // Subtree editing state (for non-sentence/group nodes)
  const [subtreeEmotionProfile, setSubtreeEmotionProfile] = useState(initialProfile);
  const [subtreeEmotion, setSubtreeEmotion] = useState(initialLegacy.emotion || 'interest');
  const [subtreeIntensity, setSubtreeIntensity] = useState(initialLegacy.intensity ?? 0);
  const [leafSuggestions, setLeafSuggestions] = useState({}); // id -> { original, options, selectedIdx }
  const [leafOrder, setLeafOrder] = useState([]);
  // const [activeTab, setActiveTab] = useState('information'); // Removed
  const emotionColor = getEmotionColor(emotion, intensity, data.type);
  const border = getBorderColor(emotion, intensity, data.type);
  const [previousEmotion, setPreviousEmotion] = useState(emotion);
  const subtreeEmotionColor = getEmotionColor(subtreeEmotion, subtreeIntensity, data.type);
  const modalAccentColor = data.type === 'sentence' ? emotionColor : subtreeEmotionColor;

  useEffect(() => {
    setNodeModified(data.isDirty);
  }, [data.isDirty]);

  useEffect(() => {
    setIsNodeMerging(data.isMerging || false);
  }, [data.isMerging]);

  // Sync nodeText and previousText with data.content when data changes
  // This is important for when AI merge completes and updates the content
  useEffect(() => {
    if (isDialogOpen) {
      setNodeText(data.content || data.label || "");
      setPreviousText(data.content || data.label || "");
      console.log('[AnimatedNodeComponent] Synced nodeText with new data.content:', data.content || data.label);
    }
  }, [data.content, data.label, isDialogOpen]);

  useEffect(() => {
    const profile = normalizeEmotionProfile(
      data.emotions ?? profileFromLegacy(data.emotion, data.intensity)
    );
    const legacy = deriveLegacyFromProfile(profile);
    setEmotionProfile(profile);
    setOriginalEmotionProfile(profile);
    setEmotion(legacy.emotion || 'interest');
    setIntensity(legacy.intensity ?? 0);
    setPreviousEmotion(legacy.emotion || 'interest');
    setPreviousText(data.content || data.label || "");
    setSubtreeEmotionProfile(profile);
    setSubtreeEmotion(legacy.emotion || 'interest');
    setSubtreeIntensity(typeof legacy.intensity === 'number' ? legacy.intensity : 0);
  }, [data.emotions, data.emotion, data.intensity]);

  function handleSave() {
    // If text hasn't changed, revert to original emotion profile
    const textChanged = nodeText !== previousText;
    const finalProfile = textChanged ? emotionProfile : originalEmotionProfile;
    const legacy = deriveLegacyFromProfile(finalProfile);
    setIntensity(legacy.intensity);
    setEmotion(legacy.emotion);
    setEmotionProfile(finalProfile);
    data.applyNodeSentenceEdit(id, nodeText, finalProfile);

    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    setIsDialogOpen(false);
    if (nodeText.length === 0) {
      // If the node text is empty after saving, we delete the node
      data.deleteNodeSentence(id);
    }
  }


  function handleCancel() {
    // Always restore original emotion and text
    const legacy = deriveLegacyFromProfile(originalEmotionProfile);
    setEmotionProfile(originalEmotionProfile);
    setEmotion(legacy.emotion);
    setSelectedIntensity(legacy.intensity);
    setNodeText(previousText);
    // Clear sentence suggestions
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
    // Clear subtree state and revert emotion/intensity
    setLeafSuggestions({});
    setLeafOrder([]);
    setSubtreeEmotionProfile(originalEmotionProfile);
    setSubtreeEmotion(legacy.emotion);
    setSubtreeIntensity(legacy.intensity);
    // Close dialog
    setIsDialogOpen(false);
  }

  function setNodeIntensity(inputIntensity) {
    setSelectedIntensity(inputIntensity);
    const next = normalizeEmotionProfile({ ...emotionProfile, [emotion]: inputIntensity });
    setEmotionProfile(next);
  }

  function setSubtreeNodeIntensity(inputIntensity) {
    setSubtreeIntensity(inputIntensity);
    const next = normalizeEmotionProfile({ ...emotionProfile, [subtreeEmotion]: inputIntensity });
    setEmotionProfile(next);
  }

  async function selectEmotionProfile(profileUpdate) {
    if (isNodeRewriting) return;
    const nextProfile = normalizeEmotionProfile(profileUpdate);
    setIsNodeRewriting(true);
    setEmotionProfile(nextProfile);
    const legacy = deriveLegacyFromProfile(nextProfile);
    setEmotion(legacy.emotion);
    setSelectedIntensity(legacy.intensity);
    try {
      const options = await rewriteSentenceWithEmotionOptions(nodeText, nextProfile, 3);
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
  async function selectSubtreeEmotionProfile(profileUpdate) {
    if (isNodeRewriting) return;
    const nextProfile = normalizeEmotionProfile(profileUpdate);
    const legacy = deriveLegacyFromProfile(nextProfile);
    setIsNodeRewriting(true);
    setSubtreeEmotionProfile(nextProfile);
    setSubtreeEmotion(legacy.emotion);
    setSubtreeIntensity(legacy.intensity);
    try {
      const leaves = typeof data.getSubtreeLeaves === 'function' ? data.getSubtreeLeaves(id) : [];
      setLeafOrder(leaves.map(l => l.id));
      const optionsList = await Promise.all(
        leaves.map(async (leaf) => {
          try {
            const opts = await rewriteSentenceWithEmotionOptions(leaf.content, nextProfile, 3);
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

  async function fetchSubtreeRewriteOptions() {
    if (isNodeRewriting) return;
    setIsNodeRewriting(true);
    try {
      const leaves = typeof data.getSubtreeLeaves === 'function' ? data.getSubtreeLeaves(id) : [];
      setLeafOrder(leaves.map(l => l.id));
      const optionsList = await Promise.all(
        leaves.map(async (leaf) => {
          try {
            const opts = await rewriteSentenceWithEmotionOptions(leaf.content, subtreeEmotionProfile, 3);
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
      console.error('Failed subtree rewrite:', e);
    }
    setIsNodeRewriting(false);
  }

  async function fetchRewriteOptions() {
    if (isNodeRewriting) return;
    setIsNodeRewriting(true);
    try {
      const options = await rewriteSentenceWithEmotionOptions(previousText || nodeText, emotionProfile, 3);
      setSuggestions(options || []);
      setCurrentSuggestionIndex(0);
      if (options && options.length > 0) {
        setNodeText(options[0]);
      }
    } catch (e) {
      console.error('Failed to get rewrite options:', e);
    }
    setIsNodeRewriting(false);
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
        alignItems: "flex-start",
        paddingTop: '10vh',
        zIndex: 9999999,
      }}
    >
      <div
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderRadius: "24px",
          padding: 0,
          maxWidth: 800,
          width: "90%",
          height: 'auto',
          maxHeight: '80vh',
          border: `3px solid ${modalAccentColor}`,
          boxShadow: `0 20px 40px -10px rgba(0, 0, 0, 0.2), 0 0 30px ${modalAccentColor}66`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#111827"
        }}
        onClick={(e) => e.stopPropagation()}
      >


        {/* Scrollable content area */}
        {!isNodeRewriting && (
          <div style={{ overflowY: 'auto', background: 'transparent', maxHeight: 'calc(72vh - 52px)' }}>


            {/* Editing Tab: Sentence editing */}
            {data.type === "sentence" && (
              <div style={{ padding: "20px 24px 16px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1 }}>
                  {/* Left Column: Text */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                      <div style={{ fontWeight: 600 }}>Edit Content</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {(data.author || data.timestamp) && (
                          <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                            {[data.author && `by ${data.author}`, data.timestamp].filter(Boolean).join(' • ')}
                          </span>
                        )}
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchRewriteOptions();
                            }}
                            disabled={isNodeRewriting}
                            title="Generate 3 rewrite options using current emotion profile"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              border: 'none',
                              background: isNodeRewriting ? '#e5e7eb' : '#111827',
                              color: isNodeRewriting ? '#9ca3af' : '#ffffff',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }}
                            onMouseOver={(e) => {
                              if (!isNodeRewriting) {
                                e.currentTarget.style.background = '#374151';
                                e.currentTarget.style.transform = 'scale(1.1)';
                              }
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#111827';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            ↻
                          </button>
                          {JSON.stringify(emotionProfile) !== JSON.stringify(originalEmotionProfile) && nodeText === previousText && (
                            <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                              !
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {suggestions.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <button
                          onClick={showPrevSuggestion}
                          disabled={isNodeRewriting}
                          title="Previous option"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.1)',
                            background: 'rgba(255,255,255,0.8)',
                            cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                            borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.1)',
                            background: 'rgba(255,255,255,0.8)',
                            cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                        flex: 1,
                        minHeight: 320,
                        padding: "16px",
                        borderRadius: "12px",
                        border: "1px solid rgba(0, 0, 0, 0.1)",
                        background: "rgba(255, 255, 255, 0.5)",
                        marginBottom: 16,
                        color: "#111827",
                        resize: "none",
                        fontFamily: "inherit",
                        fontSize: "14px",
                        outline: "none",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)"
                      }}
                    />
                  </div>

                  {/* Right Column: Emotion */}
                  <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
                    <div style={{ position: 'relative' }}>
                      <EmotionRadar
                        profile={emotionProfile}
                        onChange={(next) => {
                          setEmotionProfile(next);
                          const legacy = deriveLegacyFromProfile(next);
                          setEmotion(legacy.emotion);
                          setSelectedIntensity(legacy.intensity);
                        }}
                        size={340}
                        label="Emotion profile"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
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
                      padding: '8px 16px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                      marginRight: 'auto',
                      fontWeight: 500,
                      fontSize: '14px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      if (!isNodeRewriting) {
                        e.currentTarget.style.backgroundColor = '#dc2626';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#ef4444';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isNodeRewriting}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '14px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
                    }}
                  >
                    Cancel
                  </button>
                  {nodeText !== previousText && (
                    <button
                      onClick={handleSave}
                      disabled={isNodeRewriting}
                      style={{
                        padding: "8px 20px",
                        background: "#111827",
                        color: "white",
                        borderRadius: "12px",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: '14px',
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      }}
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Editing Tab: Subtree editing */}
            {data.type !== "sentence" && (
              <div style={{ padding: "20px 24px", background: "transparent", display: 'flex', flexDirection: 'column', height: '100%' }}>

                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                  {/* Left Column: List */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflowY: 'auto' }}>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}>
                      <div style={{ fontWeight: 600 }}>{data.label || 'Subtree Content'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {(data.author || data.timestamp) && (
                          <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>
                            {[data.author && `by ${data.author}`, data.timestamp].filter(Boolean).join(' • ')}
                          </span>
                        )}
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchSubtreeRewriteOptions();
                            }}
                            disabled={isNodeRewriting}
                            title="Generate 3 rewrite options for each sentence using current emotion profile"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              border: 'none',
                              background: isNodeRewriting ? '#e5e7eb' : '#111827',
                              color: isNodeRewriting ? '#9ca3af' : '#ffffff',
                              cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }}
                            onMouseOver={(e) => {
                              if (!isNodeRewriting) {
                                e.currentTarget.style.background = '#374151';
                                e.currentTarget.style.transform = 'scale(1.1)';
                              }
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#111827';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            ↻
                          </button>
                          {JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile) && (
                            <div className="modified-indicator" style={{ top: -4, right: -4, width: 14, height: 14, fontSize: 10, lineHeight: '14px', background: '#ef4444' }}>
                              !
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Leaf suggestions list */}
                    {leafOrder.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {leafOrder.map(leafId => {
                          const entry = leafSuggestions[leafId];
                          if (!entry) return null;
                          const currentText = entry.editedText ?? ((entry.options && entry.options.length > 0 && entry.selectedIdx >= 0) ? entry.options[entry.selectedIdx] : entry.original);
                          return (
                            <div key={leafId} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, background: "rgba(255,255,255,0.4)" }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <button
                                  onClick={() => rotateLeafPrev(leafId)}
                                  disabled={isNodeRewriting || !(entry.options && entry.options.length > 0)}
                                  title="Previous option"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    background: 'rgba(255,255,255,0.8)',
                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                                    borderRadius: 8,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    background: 'rgba(255,255,255,0.8)',
                                    cursor: isNodeRewriting ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
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
                                  padding: "12px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(0, 0, 0, 0.1)",
                                  background: "rgba(255, 255, 255, 0.5)",
                                  color: "#111827",
                                  resize: 'vertical',
                                  fontFamily: "inherit",
                                  fontSize: "14px",
                                  outline: "none",
                                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)"
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Emotion */}
                  <div style={{ width: 340, flexShrink: 0, paddingTop: 28 }}>
                    <div style={{ position: 'relative' }}>
                      <EmotionRadar
                        profile={subtreeEmotionProfile}
                        onChange={(next) => {
                          setSubtreeEmotionProfile(next);
                          const legacy = deriveLegacyFromProfile(next);
                          setSubtreeEmotion(legacy.emotion);
                          setSubtreeIntensity(legacy.intensity);
                        }}
                        size={340}
                        label="Subtree emotion profile"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <button
                    onClick={handleCancel}
                    disabled={isNodeRewriting}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: '14px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
                    }}
                  >
                    Cancel
                  </button>
                  {(() => {
                    const hasTextChanges = Object.keys(leafSuggestions).some(k => {
                      const e = leafSuggestions[k];
                      const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                      return chosen !== e.original;
                    });
                    const hasEmotionChanges = JSON.stringify(subtreeEmotionProfile) !== JSON.stringify(originalEmotionProfile);
                    return (hasTextChanges || hasEmotionChanges) && (
                      <button
                        onClick={() => {
                          // Build edits map
                          const edits = {};
                          let anyTextChanged = false;
                          Object.keys(leafSuggestions).forEach(k => {
                            const e = leafSuggestions[k];
                            const chosen = e.editedText ?? ((e.options && e.options.length > 0 && e.selectedIdx >= 0) ? e.options[e.selectedIdx] : e.original);
                            if (chosen && chosen.length > 0) {
                              edits[k] = chosen;
                              if (chosen !== e.original) anyTextChanged = true;
                            }
                          });
                          // If no text changed, revert to original emotion
                          const finalProfile = anyTextChanged ? subtreeEmotionProfile : originalEmotionProfile;
                          if (typeof data.applySubtreeChanges === 'function') {
                            data.applySubtreeChanges(id, normalizeEmotionProfile({ ...finalProfile }), edits);
                          }
                          // Reset and close
                          setLeafSuggestions({});
                          setLeafOrder([]);
                          setIsDialogOpen(false);
                        }}
                        disabled={isNodeRewriting}
                        style={{
                          padding: "8px 20px",
                          background: "#111827",
                          color: "white",
                          borderRadius: "12px",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 500,
                          fontSize: '14px',
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                        }}
                      >
                        Save
                      </button>
                    );
                  })()}
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

  // Get significant emotions for badge display, excluding the dominant one
  const significantEmotions = getSignificantEmotions(emotionProfile, 30)
    .filter(e => e.emotion !== emotion);

  return (
    <>
      <motion.div
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        onDoubleClick={() => setIsDialogOpen(true)}
        style={{
          padding: 12,
          borderRadius: 24,
          color: "black",
          textAlign: "center",
          cursor: "pointer",
          width: 220,
          background: emotionColor,
          border: nodeModified ? `3px solid ${border}` : '3px solid rgba(255, 255, 255, 0.6)',
          position: 'relative',
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
          transition: 'box-shadow 0.2s, transform 0.2s',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
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
            padding: significantEmotions.length > 0 ? '8px 32px 28px 8px' : '8px 32px 8px 8px',
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
          <>
            <div className="modified-indicator" title="This node has been modified.">
              !
            </div>
            {/* SVG based animated border for proper rounded corners */}
            <svg className="animated-border-svg">
              <rect
                x="3" y="3"
                width="calc(100% - 6px)"
                height="calc(100% - 6px)"
                className="animated-border-rect"
              />
            </svg>
          </>
        )}
        {/* Spinning wheel when node is being processed after merge - positioned at top right */}
        {isNodeMerging && (
          <div
            style={{
              position: 'absolute',
              top: -12,
              right: -12,
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: '#fff',
              border: '3px solid #8b5cf6',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
              zIndex: 20,
            }}
            title="Processing with AI..."
          />
        )}

        {/* Emotion badges - show additional emotions */}
        {significantEmotions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: -20,
              right: -20,
              display: 'flex',
              gap: 6,
              flexDirection: 'row',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {significantEmotions.slice(0, 5).map((emotionData, idx) => (
              <div
                key={emotionData.emotion}
                title={getSecondaryEmotionTooltip(emotionData.emotion, emotionData.intensity)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: emotionData.color,
                  border: '4px solid #fff',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
                  pointerEvents: 'auto',
                }}
              />
            ))}
            {significantEmotions.length > 5 && (
              <div
                title={`${significantEmotions.length - 5} more secondary emotions`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: '#9ca3af',
                  border: '4px solid #fff',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                  pointerEvents: 'auto',
                }}
              >
                +{significantEmotions.length - 5}
              </div>
            )}
          </div>
        )}
      </motion.div>
      {dialog}
    </>
  );
}