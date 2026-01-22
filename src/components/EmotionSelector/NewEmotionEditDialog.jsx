/**
 * @fileoverview NewEmotionEditDialog - Modal dialog for editing node emotions and content
 *
 * Orchestrates emotion and content editing for both individual content nodes (sentences)
 * and subtree/group nodes (multiple descendants).
 *
 * Architecture:
 * - DialogShell: Modal backdrop + container
 * - LeafEditingPanel: Content node editing (sentences, headings, etc.)
 * - SubtreeEditingPanel: Group node editing (multiple leaves)
 * - DialogFooter: Sticky footer with actions
 *
 * State management:
 * - useEmotionProfile: Handles emotion profile normalization + comparison
 * - useLeafSuggestions: Manages leaf suggestion fetching + cycling
 *
 * @typedef {import('../../types/node.js').NodeData} NodeData
 */

import React from 'react';
import { useMemo } from 'react';
import { isContentNode } from '../../types/node.js';
import { getEmotionColor } from '../TreeVisualization/animatedNodeComponentHelpers.js';
import useEmotionProfile from './useEmotionProfile.js';
import useLeafSuggestions from './useLeafSuggestions.js';
import DialogShell from './DialogShell.jsx';
import DialogFooter from './DialogFooter.jsx';
import LeafEditingPanel from './LeafEditingPanel.jsx';
import SubtreeEditingPanel from './SubtreeEditingPanel.jsx';

/**
 * NewEmotionEditDialog - Comprehensive emotion + content editing modal
 *
 * Supports two editing modes:
 * 1. **Leaf/Content nodes** (sentences, headings, list items):
 *    - Single textarea with Claude-powered rewrite suggestions
 *    - Emotion radar for profile adjustment
 *    - Delete option
 *
 * 2. **Subtree/Group nodes** (organizational containers):
 *    - Bulk editing of descendant leaf nodes
 *    - Per-leaf suggestion cycling
 *    - Collective emotion adjustment across subtree
 *    - Skeleton loaders during fetch
 *
 * Change tracking ensures save button only shows when:
 * - Text was modified, OR
 * - Emotion profile was modified (leaf only if suggestions fetched)
 *
 * @param {Object} props
 * @param {string} props.id - Node UUID
 * @param {NodeData} props.data - Node with handlers (applyNodeEdit, applySubtreeChanges, deleteNode, getDescendantLeaves)
 * @param {Function} props.onClose - Close dialog callback
 * @returns {React.ReactElement} Portal-rendered modal dialog
 *
 * @example
 * <NewEmotionEditDialog
 *   id="node-123"
 *   data={nodeData}
 *   onClose={() => setDialogOpen(false)}
 * />
 */
export function NewEmotionEditDialog({ id, data, onClose }) {
  const isLeaf = isContentNode(data);

  // =========================================================================
  // STATE: Text & Emotion Drafts
  // =========================================================================

  // Snapshots for change detection
  const originalText = useMemo(() => data.content || '', [data.content]);
  const originalEmotion = useMemo(() => data.emotion, [data.emotion]);

  // Text editing (leaf nodes only)
  const [draftText, setDraftText] = React.useState(originalText);

  // Emotion management (separate for leaf vs. subtree)
  const leafEmotion = useEmotionProfile(originalEmotion);
  const subtreeEmotion = useEmotionProfile(originalEmotion);

  // Leaf suggestions management
  const leafSuggestions = useLeafSuggestions();

  // =========================================================================
  // COMPUTED: Modal styling
  // =========================================================================

  const modalAccentColor = isLeaf
    ? getEmotionColor(
        leafEmotion.profile.dominantEmotion,
        leafEmotion.profile.dominantIntensity,
        data.type
      )
    : getEmotionColor(
        subtreeEmotion.profile.dominantEmotion,
        subtreeEmotion.profile.dominantIntensity,
        data.type
      );

  // =========================================================================
  // HANDLERS: Leaf editing
  // =========================================================================

  /**
   * Save leaf node changes (text + emotion)
   * Deletes if text is empty
   */
  const handleSaveLeaf = () => {
    if (!draftText.trim()) {
      if (typeof data.deleteNode === 'function') {
        data.deleteNode(id);
      }
      onClose();
      return;
    }

    if (typeof data.applyNodeEdit === 'function') {
      data.applyNodeEdit(id, draftText, leafEmotion.profile);
    }

    onClose();
  };

  /**
   * Delete leaf node with confirmation
   */
  const handleDeleteLeaf = () => {
    if (typeof data.deleteNode === 'function') {
      data.deleteNode(id);
    }
    onClose();
  };

  // =========================================================================
  // HANDLERS: Subtree editing
  // =========================================================================

  /**
   * Fetch rewrite suggestions for all descendant leaves
   */
  const handleFetchSubtreeSuggestions = async (e) => {
    e.stopPropagation();
    const leaves =
      typeof data.getDescendantLeaves === 'function'
        ? data.getDescendantLeaves(id)
        : [];

    await leafSuggestions.fetch(leaves, subtreeEmotion.profile.profile);
  };

  /**
   * Save subtree changes (bulk text edits + emotion)
   */
  const handleSaveSubtree = () => {
    const edits = {};

    for (const leafId of leafSuggestions.leafOrder) {
      const entry = leafSuggestions.suggestions[leafId];
      if (!entry) continue;

      const chosen = entry.editedText ?? entry.original;
      if (chosen && chosen.trim()) {
        edits[leafId] = chosen;
      }
    }

    if (typeof data.applySubtreeChanges === 'function') {
      data.applySubtreeChanges(id, subtreeEmotion.profile, edits);
    }

    onClose();
  };

  // =========================================================================
  // COMPUTED: Button visibility
  // =========================================================================

  // Leaf: Show save if text OR emotion changed
  const leafHasChanges = draftText !== originalText || leafEmotion.hasChanged(originalEmotion);

  // Subtree: Show save if suggestions generated AND (text OR emotion changed)
  const suggestionsGenerated = leafSuggestions.leafOrder.length > 0;
  const subtreeHasTextChanges = Object.keys(leafSuggestions.suggestions).some((leafId) => {
    const entry = leafSuggestions.suggestions[leafId];
    const chosen = entry.editedText ?? entry.original;
    return chosen !== entry.original;
  });
  const subtreeHasEmotionChanges = suggestionsGenerated && subtreeEmotion.hasChanged(originalEmotion);
  const subtreeHasChanges = subtreeHasTextChanges || subtreeHasEmotionChanges;

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <DialogShell accentColor={modalAccentColor} onBackdropClick={onClose}>
      {isLeaf ? (
        // LEAF EDITING MODE
        <>
          <LeafEditingPanel
            id={id}
            data={data}
            draftText={draftText}
            onTextChange={setDraftText}
            emotion={leafEmotion.profile}
            onEmotionChange={leafEmotion.updateProfile}
            onDelete={handleDeleteLeaf}
            onSave={handleSaveLeaf}
            isLoading={false}
          />
          <DialogFooter
            onDelete={handleDeleteLeaf}
            onCancel={onClose}
            onSave={handleSaveLeaf}
            showDelete={true}
            showSave={leafHasChanges}
          />
        </>
      ) : (
        // SUBTREE EDITING MODE
        <>
          <SubtreeEditingPanel
            id={id}
            data={data}
            suggestions={leafSuggestions.suggestions}
            leafOrder={leafSuggestions.leafOrder}
            emotion={subtreeEmotion.profile}
            onEmotionChange={subtreeEmotion.updateProfile}
            onFetchSuggestions={handleFetchSubtreeSuggestions}
            onRotatePrev={leafSuggestions.rotatePrev}
            onRotateNext={leafSuggestions.rotateNext}
            onUpdateText={leafSuggestions.updateText}
            isLoading={leafSuggestions.isLoading}
          />
          <DialogFooter
            onCancel={onClose}
            onSave={handleSaveSubtree}
            showSave={subtreeHasChanges}
            isLoading={leafSuggestions.isLoading}
          />
        </>
      )}
    </DialogShell>
  );
}

export default NewEmotionEditDialog;