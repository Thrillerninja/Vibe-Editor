/**
 * Node merge utilities
 *
 * Allows merging two nodes into a single node.
 *
 * Semantics:
 * - If both are hierarchy nodes: keeps `targetId`, moves children from `sourceId` onto `targetId`,
 *   removes `sourceId` from the hierarchy, and removes `sourceId` from its parent.
 * - If both are sentences: keeps the earlier sentence in document order, concatenates the other
 *   sentence's content, and adopts the later sentence's delimiter/punctuation (so the merged
 *   sentence ends where the later one ended).
 *
 * NOTE: We intentionally do NOT merge sentence ↔ group nodes here.
 */

/**
 * @param {Array} sentences - SSOT sentence array (may include sentences._hierarchyMeta)
 * @param {string} sourceId - dragged node id
 * @param {string} targetId - drop target node id
 * @returns {Array} updated sentences (new array) with preserved _hierarchyMeta
 */
export function mergeNodes(sentences, sourceId, targetId) {
  if (!sentences || sourceId === targetId) return sentences;

  const meta = sentences._hierarchyMeta;

  // Helper: treat any id present in meta.nodes as a hierarchy/group node
  const isHierarchyNode = (id) => !!meta?.nodes?.some((n) => n.id === id);
  const isSentenceNode = (id) => sentences.some((s) => s.id === id);

  const sourceIsGroup = isHierarchyNode(sourceId);
  const targetIsGroup = isHierarchyNode(targetId);
  const sourceIsSentence = isSentenceNode(sourceId);
  const targetIsSentence = isSentenceNode(targetId);

  // --- Group ↔ Group merge ---
  if (meta && sourceIsGroup && targetIsGroup) {
    const updated = sentences.map((s) => ({ ...s }));
    const hierarchyMeta = { ...meta };
    const nodes = hierarchyMeta.nodes.map((n) => ({ ...n, childIds: [...(n.childIds || [])] }));

    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);

    if (!sourceNode || !targetNode) return sentences;

    // Remove sourceId from its parent (if any)
    const sourceParent = nodes.find((n) => (n.childIds || []).includes(sourceId));
    if (sourceParent) {
      sourceParent.childIds = sourceParent.childIds.filter((id) => id !== sourceId);
    }

    // Also remove sourceId from any other parent's childIds (defensive)
    for (const n of nodes) {
      if ((n.childIds || []).includes(sourceId)) {
        n.childIds = n.childIds.filter((id) => id !== sourceId);
      }
    }

    // Move children onto target node (preserve order: target children first, then source)
    const mergedChildIds = [...(targetNode.childIds || [])];
    for (const childId of sourceNode.childIds || []) {
      if (!mergedChildIds.includes(childId)) mergedChildIds.push(childId);
    }
    targetNode.childIds = mergedChildIds;

    // Optionally combine labels so user sees the merge immediately.
    // AI can refine later.
    if (sourceNode.label && targetNode.label && sourceNode.label !== targetNode.label) {
      targetNode.label = `${targetNode.label} + ${sourceNode.label}`;
    }

    // Drop the source node from hierarchy
    hierarchyMeta.nodes = nodes.filter((n) => n.id !== sourceId);

    // Mark merged node as dirty so downstream logic can refresh titles/emotions if needed
    const dirty = new Set(hierarchyMeta.dirtyNodeIds || []);
    dirty.add(targetId);
    dirty.add('root');
    hierarchyMeta.dirtyNodeIds = Array.from(dirty);

    updated._hierarchyMeta = hierarchyMeta;
    return updated;
  }

  // --- Sentence ↔ Sentence merge ---
  if (sourceIsSentence && targetIsSentence) {
    const srcIdx = sentences.findIndex((s) => s.id === sourceId);
    const tgtIdx = sentences.findIndex((s) => s.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return sentences;

    // Keep earlier sentence in document order to preserve the text flow
    const keepId = srcIdx <= tgtIdx ? sourceId : targetId;
    const dropId = keepId === sourceId ? targetId : sourceId;

    const keep = sentences.find((s) => s.id === keepId);
    const drop = sentences.find((s) => s.id === dropId);
    if (!keep || !drop) return sentences;

    const mergedContent = `${keep.content}${keep.content.endsWith(' ') ? '' : ' '}${drop.content}`;

    const updated = sentences
      .filter((s) => s.id !== dropId)
      .map((s) => {
        if (s.id !== keepId) return { ...s };
        // Adopt delimiter/punctuation from the later sentence so merged sentence ends correctly
        return {
          ...s,
          content: mergedContent,
          delimiter: drop.delimiter ?? s.delimiter,
          delimiterContent: drop.delimiterContent !== undefined ? drop.delimiterContent : s.delimiterContent,
          punctuation: drop.punctuation ?? s.punctuation,
        };
      });

    // Update hierarchy references (remove dropId from any parent childIds)
    if (meta?.nodes?.length) {
      const hierarchyMeta = { ...meta };
      const nodes = hierarchyMeta.nodes.map((n) => ({ ...n, childIds: [...(n.childIds || [])] }));
      for (const n of nodes) {
        if ((n.childIds || []).includes(dropId)) {
          n.childIds = n.childIds.filter((id) => id !== dropId);
        }
      }
      // Mark the sentence and its branch dirty
      const dirtySentences = new Set(hierarchyMeta.dirtySentenceIds || []);
      dirtySentences.add(keepId);
      hierarchyMeta.dirtySentenceIds = Array.from(dirtySentences);
      const dirtyNodes = new Set(hierarchyMeta.dirtyNodeIds || []);
      dirtyNodes.add('root');
      hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodes);

      updated._hierarchyMeta = hierarchyMeta;
    }

    return updated;
  }

  // Not supported (sentence ↔ group, root, etc.)
  return sentences;
}