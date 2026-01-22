/**
 * @fileoverview useLeafSuggestions - Leaf node suggestion management hook
 * 
 * Manages the complex state for fetching, rotating, and editing leaf node suggestions.
 * Centralizes all suggestion-related logic to keep components focused on UI.
 */

import { useState, useCallback } from 'react';
import { rewriteSentenceWithEmotionOptions } from '../../services/claude/claudeApi.js';

/**
 * @typedef {Object} LeafSuggestionEntry
 * @property {string} id - Leaf node ID
 * @property {string} original - Original content
 * @property {string[]} options - Rewrite suggestions
 * @property {number} selectedIdx - Currently selected option index
 * @property {string} editedText - Current edited text
 * @property {boolean} [error] - If rewrite failed
 */

/**
 * @typedef {Object} UseLeafSuggestionsReturn
 * @property {Record<string, LeafSuggestionEntry>} suggestions - Map of leafId → suggestion entry
 * @property {string[]} leafOrder - Ordered leaf IDs for iteration
 * @property {boolean} isLoading - Currently fetching suggestions
 * @property {Error | null} error - Any fetch error
 * @property {(leaves: Array, emotionProfile: Object) => Promise<void>} fetch - Fetch suggestions for leaves
 * @property {(leafId: string) => void} rotatePrev - Go to previous suggestion
 * @property {(leafId: string) => void} rotateNext - Go to next suggestion
 * @property {(leafId: string, newText: string) => void} updateText - Manually edit text
 */

/**
 * Hook for managing leaf node suggestion fetching and cycling
 * 
 * Handles:
 * - Parallel fetching of Claude suggestions for multiple leaves
 * - Error handling per-leaf
 * - Suggestion rotation (prev/next)
 * - Manual text editing
 * - Loading state tracking
 * 
 * @returns {UseLeafSuggestionsReturn}
 * 
 * @example
 * const suggestions = useLeafSuggestions();
 * await suggestions.fetch(leaves, emotionProfile);
 * suggestions.rotateNext('leaf-123');
 * suggestions.updateText('leaf-456', 'new content');
 */
export function useLeafSuggestions() {
  const [suggestions, setSuggestions] = useState({});
  const [leafOrder, setLeafOrder] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch suggestion options for multiple leaf nodes
   * Runs Claude API calls in parallel
   * 
   * @param {Array<{id: string, content: string}>} leaves - Leaf nodes to rewrite
   * @param {Object} emotionProfile - Emotion profile to guide rewrites
   */
  const fetch = useCallback(async (leaves, emotionProfile) => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        leaves.map(async (leaf) => {
          try {
            const opts = await rewriteSentenceWithEmotionOptions(
              leaf.content,
              emotionProfile,
              3
            );
            return {
              id: leaf.id,
              original: leaf.content,
              options: opts || [],
              selectedIdx: opts && opts.length > 0 ? 0 : -1,
              editedText: opts && opts.length > 0 ? opts[0] : leaf.content,
            };
          } catch (e) {
            console.error(`[useLeafSuggestions] Rewrite failed for leaf ${leaf.id}:`, e);
            return {
              id: leaf.id,
              original: leaf.content,
              options: [],
              selectedIdx: -1,
              editedText: leaf.content,
              error: true,
            };
          }
        })
      );

      // Build map and preserve order
      const map = Object.fromEntries(results.map((r) => [r.id, r]));
      setLeafOrder(results.map((r) => r.id));
      setSuggestions(map);
    } catch (err) {
      setError(err);
      console.error('[useLeafSuggestions] Failed to fetch suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Rotate to previous suggestion for a leaf
   * @param {string} leafId - Leaf node ID
   */
  const rotatePrev = useCallback((leafId) => {
    setSuggestions((prev) => {
      const entry = prev[leafId];
      if (!entry?.options?.length) return prev;

      const newIdx = (entry.selectedIdx - 1 + entry.options.length) % entry.options.length;
      return {
        ...prev,
        [leafId]: { ...entry, selectedIdx: newIdx, editedText: entry.options[newIdx] },
      };
    });
  }, []);

  /**
   * Rotate to next suggestion for a leaf
   * @param {string} leafId - Leaf node ID
   */
  const rotateNext = useCallback((leafId) => {
    setSuggestions((prev) => {
      const entry = prev[leafId];
      if (!entry?.options?.length) return prev;

      const newIdx = (entry.selectedIdx + 1) % entry.options.length;
      return {
        ...prev,
        [leafId]: { ...entry, selectedIdx: newIdx, editedText: entry.options[newIdx] },
      };
    });
  }, []);

  /**
   * Manually update text for a leaf (user editing)
   * @param {string} leafId - Leaf node ID
   * @param {string} newText - New text value
   */
  const updateText = useCallback((leafId, newText) => {
    setSuggestions((prev) => ({
      ...prev,
      [leafId]: { ...prev[leafId], editedText: newText },
    }));
  }, []);

  return {
    suggestions,
    leafOrder,
    isLoading,
    error,
    fetch,
    rotatePrev,
    rotateNext,
    updateText,
  };
}

export default useLeafSuggestions;