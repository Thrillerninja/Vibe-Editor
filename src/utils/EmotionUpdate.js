/**
 * Tree Refresh Service
 * Handles refreshing and restructuring modified nodes in the tree
 */

import { restructureSubtreePreservingIds } from '../ClaudeAlternative/claudeAPI';

/**
 * Deep-clear isModified flags in a subtree
 */
function clearModified(node) {
  if (!node) return node;
  const out = { ...node, isModified: false };
  if (out.children) out.children = out.children.map(clearModified);
  return out;
}

/**
 * Extract only dirty nodes from a subtree for restructuring
 * If a node is dirty, includes it with all its children for context
 */
function extractDirtySubtree(node) {
  if (!node) return null;

  // If this node itself is dirty, include it with all its children (dirty or not)
  // Claude needs the full context to reorganize the dirty node's children
  if (node.isModified === true) {
    return {
      ...node,
      children: node.children ? node.children.map(child => ({ ...child })) : []
    };
  }

  // If node is clean but has dirty children, we need to process those children
  if (!node.children || node.children.length === 0) {
    return null; // Leaf node, not dirty, skip
  }

  const dirtyChildren = node.children
    .map(child => extractDirtySubtree(child))
    .filter(Boolean);

  if (dirtyChildren.length === 0) {
    return null; // No dirty descendants
  }

  // Return node with only dirty children
  return {
    ...node,
    children: dirtyChildren
  };
}

/**
 * Merge restructured dirty nodes back into the clean tree
 */
function mergeRestructuredNodes(originalNode, restructuredSubtree) {
  if (!originalNode) return originalNode;
  if (!restructuredSubtree) return originalNode;

  // If the restructured subtree is for this node, replace it
  if (originalNode.id === restructuredSubtree.id) {
    // Merge: take label/emotion from restructured, preserve clean children
    const mergedChildren = (restructuredSubtree.children || []).map(restructuredChild => {
      const originalChild = (originalNode.children || []).find(c => c.id === restructuredChild.id);
      if (!originalChild) {
        // New child from restructuring (shouldn't happen with our constraints)
        return restructuredChild;
      }
      // Recursively merge
      return mergeRestructuredNodes(originalChild, restructuredChild);
    });

    return {
      ...originalNode,
      ...restructuredSubtree,
      children: mergedChildren,
      isModified: false // Clear dirty flag
    };
  }

  // This node wasn't restructured, but children might have been
  if (!originalNode.children || originalNode.children.length === 0) {
    return originalNode;
  }

  const mergedChildren = originalNode.children.map(child => {
    // Find if this child was restructured
    const findRestructured = (subtree) => {
      if (!subtree) return null;
      if (subtree.id === child.id) return subtree;
      if (!subtree.children) return null;
      for (const c of subtree.children) {
        const found = findRestructured(c);
        if (found) return found;
      }
      return null;
    };

    const restructuredChild = findRestructured(restructuredSubtree);
    return mergeRestructuredNodes(child, restructuredChild);
  });

  return {
    ...originalNode,
    children: mergedChildren
  };
}

/**
 * Count nodes with dirty flag
 */
function countDirtyNodes(node) {
  if (!node) return 0;
  let count = node.isModified ? 1 : 0;
  if (node.children) {
    count += node.children.reduce((sum, child) => sum + countDirtyNodes(child), 0);
  }
  return count;
}

/**
 * Recursive function to check and regenerate nodes with modified children
 */
async function processNode(node) {
  if (!node) return node;

  console.log('[TreeRefresh] Processing node:', node.id, 'isModified:', node.isModified);

  // If this node itself is modified (e.g., reordered or edited), regenerate it
  if (node.isModified === true) {
    try {
      console.log(`[TreeRefresh] Node ${node.id} is dirty, regenerating with Claude`);
      const regenerated = await restructureSubtreePreservingIds(node);
      const cleaned = clearModified(regenerated);
      return cleaned;
    } catch (e) {
      console.error('[TreeRefresh] Subtree regeneration failed for node', node.id, ':', e);
      // Keep the node with its dirty flag so user can retry
      return node;
    }
  }

  // Node is clean, but check if children need processing
  if (!node.children || node.children.length === 0) {
    return node; // Leaf node, nothing to do
  }

  // Check if any direct children are modified
  const hasModifiedChild = node.children.some(child => child.isModified === true);

  if (hasModifiedChild) {
    // This clean node has dirty children - only restructure the dirty ones
    // and preserve clean children exactly as-is (no label changes)
    console.log(`[TreeRefresh] Node ${node.id} is clean but has dirty children`);

    // Separate dirty and clean children
    const dirtyChildren = [];
    const cleanChildren = [];

    for (const child of node.children) {
      if (child.isModified === true) {
        dirtyChildren.push(child);
      } else {
        cleanChildren.push(child);
      }
    }

    console.log(`[TreeRefresh] Processing ${dirtyChildren.length} dirty children, preserving ${cleanChildren.length} clean children`);

    // Process dirty children - catch errors individually to preserve state
    const processedDirty = await Promise.all(
      dirtyChildren.map(async child => {
        try {
          return await processNode(child);
        } catch (e) {
          console.error(`[TreeRefresh] Failed to process dirty child ${child.id}, keeping with dirty flag:`, e);
          return child; // Keep original with dirty flag
        }
      })
    );

    // Recursively process clean children (they might have dirty descendants)
    const processedClean = await Promise.all(
      cleanChildren.map(async child => {
        try {
          return await processNode(child);
        } catch (e) {
          console.error(`[TreeRefresh] Failed to process clean child ${child.id}, keeping as-is:`, e);
          return child; // Keep original
        }
      })
    );

    // Reconstruct children array maintaining original order
    const processedChildren = node.children.map(child => {
      const processed = [...processedDirty, ...processedClean].find(c => c.id === child.id);
      return processed || child;
    });

    return {
      ...node,
      children: processedChildren
    };
  }

  // No modified children, but might have modified descendants
  const processedChildren = await Promise.all(
    node.children.map(async child => {
      try {
        return await processNode(child);
      } catch (e) {
        console.error(`[TreeRefresh] Failed to process descendant ${child.id}, keeping as-is:`, e);
        return child; // Keep original
      }
    })
  );

  // Check if any children actually changed
  const childrenChanged = processedChildren.some((child, i) => child !== node.children[i]);

  if (!childrenChanged) {
    return node; // Nothing changed, return original
  }

  return {
    ...node,
    children: processedChildren
  };
}

/**
 * Refresh emotions in modified subtree
 * Main entry point that processes the tree and updates it
 */
export async function refreshEmotionsInModifiedSubtree(tree) {
  if (!tree) return tree;

  console.log('[TreeRefresh] Refreshing tree...');

  try {
    const refreshedTree = await processNode(tree);

    // Check if any nodes still have dirty flags (indicating partial failure)
    const dirtyCount = countDirtyNodes(refreshedTree);

    return {
      refreshedTree,
      dirtyCount,
      success: dirtyCount === 0
    };
  } catch (error) {
    console.error('[TreeRefresh] Tree refresh failed:', error);
    throw error;
  }
}