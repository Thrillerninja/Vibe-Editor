import { LEAF_NODE_LEVEL } from "../utils/constants";
import { buildTree, sanitizeTreeDepth } from '../ClaudeAlternative/claudeAPI';


export function sentenceKey(sentence) {
  // Separator must be impossible in normal text
  return sentence.content + "\u0000" + sentence.trailing;
}

export function diffSentences(oldList, newList) {
  const ops = [];

  let i = 0; // old index
  let j = 0; // new index

  while (i < oldList.length || j < newList.length) {
    const oldItem = oldList[i];
    const newItem = newList[j];

    // 1) Both exist and are equal → KEEP
    if (
      oldItem &&
      newItem &&
      sentenceKey(oldItem) === sentenceKey(newItem)
    ) {
      ops.push({ type: "KEEP", old: oldItem, new: newItem });
      i++;
      j++;
      continue;
    }

    // 2) Old exists, but skipping it aligns us
    if (
      oldItem &&
      oldList[i + 1] &&
      newItem &&
      sentenceKey(oldList[i + 1]) === sentenceKey(newItem)
    ) {
      ops.push({ type: "DELETE", old: oldItem });
      i++;
      continue;
    }

    // 3) New exists, but skipping it aligns us
    if (
      newItem &&
      newList[j + 1] &&
      oldItem &&
      sentenceKey(oldItem) === sentenceKey(newList[j + 1])
    ) {
      ops.push({ type: "INSERT", new: newItem });
      j++;
      continue;
    }

    // 4) Fallback → REPLACE (edit)
    if (oldItem && newItem) {
      ops.push({ type: "REPLACE", old: oldItem, new: newItem });
      i++;
      j++;
      continue;
    }

    // 5) Only old remains → DELETE
    if (oldItem) {
      ops.push({ type: "DELETE", old: oldItem });
      i++;
      continue;
    }

    // 6) Only new remains → INSERT
    if (newItem) {
      ops.push({ type: "INSERT", new: newItem });
      j++;
      continue;
    }
  }

  return ops;
}

export function applyDiffToTree(tree, diffOps) {
  // 1) clone tree shallowly
  const newTree = structuredClone(tree);

  // 2) get fresh leaf list from clone
  let leaves = collectLeavesInOrder(newTree);

  let leafIndex = 0;

  for (const op of diffOps) {
    switch (op.type) {
      case "KEEP": {
        // nothing changes
        leafIndex++;
        break;
      }

      case "REPLACE": {
        const leaf = leaves[leafIndex];
        leaf.content = op.new.content;
        leaf.label = op.new.content;
        leaf.trailing = op.new.trailing;
        leaf.isModified = true;
        leafIndex++;
        break;
      }

      case "DELETE": {
        const leaf = leaves[leafIndex];
        removeLeafById(newTree, leaf.id);
        // do NOT advance leafIndex
        leaves = collectLeavesInOrder(newTree);
        break;
      }

      case "INSERT": {
        const newLeaf = {
          id: `leaf-${crypto.randomUUID()}`,
          level: LEAF_NODE_LEVEL,
          content: op.new.content,
          label: op.new.content,
          trailing: op.new.trailing,
          children: [],
          emotion: "NEUTRAL",
          isModified: true
        };

        // simplest policy: append to root
        newTree.children.push(newLeaf);
        break;
      }
    }
  }

  return newTree;
}

export function removeLeafById(root, id) {
  function walk(node) {
    if (!node.children) return;

    node.children = node.children.filter(ch => ch.id !== id);
    node.children.forEach(walk);
  }

  walk(root);
}


export function hasModified(node) {
  if (!node) return false;
  if (node.isModified) return true;
  return node.children?.some(hasModified) ?? false;
}
export function collectLeavesInOrder(root) {
  const leaves = [];

  function walk(node) {
    if (!node) return;
    if (node.level === LEAF_NODE_LEVEL) {
      leaves.push(node);
      return;
    }
    node.children?.forEach(walk);
  }

  walk(root);
  return leaves;
}

export function textToSentences(text) {
  // Returns tokens preserving exact whitespace/newlines AFTER each sentence chunk.
  // "content" includes the sentence (and punctuation), "trailing" is whatever comes next.
  const tokens = [];
  if (typeof text !== "string" || text.length === 0) return tokens;

  // Split into (sentence-ish chunk)(trailing whitespace) pairs.
  // This is a pragmatic rule: it treats a "sentence" as up to and including a terminal punctuation,
  // and captures ALL following whitespace as trailing.
  const re = /([\s\S]*?[.!?])(\s+|$)/g;

  let lastIndex = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    const content = m[1] ?? "";
    const trailing = m[2] ?? "";
    tokens.push({ content, trailing });
    lastIndex = re.lastIndex;
  }

  // If there's leftover text without terminal punctuation, keep it as a final token
  // (still preserving any trailing whitespace).
  if (lastIndex < text.length) {
    tokens.push({ content: text.slice(lastIndex), trailing: "" });
  }

  // Drop tokens that are only whitespace (optional safety)
  return tokens.filter(t => (t.content + t.trailing).trim().length > 0);
}

function reassignIds(node) {
  return {
    ...node,
    id: crypto.randomUUID(),
    children: node.children?.map(reassignIds) ?? []
  };
}
export function extractSentencesFromSubtree(node) {
  const leaves = [];
  const walk = (n) => {
    if (!n) return;
    if (n.level === LEAF_NODE_LEVEL) {
      leaves.push(n);
    } else {
      n.children?.forEach(walk);
    }
  };
  walk(node);
  return leaves.map(l => l.content);
}
export async function rebuildSubtree(node, maxDepth) {
  const sentences = extractSentencesFromSubtree(node);
  var originalNode = node;
  var rebuilt = await buildTree(sentences, maxDepth);
  rebuilt = reassignIds(rebuilt); 
  rebuilt.id = originalNode.id;
  // Preserve trailing whitespace & coords
  const tokens = sentences.map(s => ({ content: s, trailing: " " }));
  const withTrailing = reattachTrailingToLeaves(rebuilt, tokens);
  const withCoords = addYCoord(withTrailing);

  return {
    ...withCoords,
    id: node.id,           // keep identity stable
    level: node.level      // preserve hierarchy depth
  };
}
export async function refreshNode(node, maxDepth) {
  if (!node) return node;

  // Leaf case
  if (node.level === LEAF_NODE_LEVEL) {
    if (node.isModified) {
      return await rebuildSubtree(node, 1);
    }
    return node;
  }

  const modifiedChildren = node.children?.filter(hasModified) ?? [];

  // Nothing changed
  if (modifiedChildren.length === 0) {
    return node;
  }

  // Exactly one modified child → recurse
  if (modifiedChildren.length === 1) {
    const target = modifiedChildren[0];

    const newChildren = await Promise.all(
      node.children.map(async ch =>
        ch === target ? await refreshNode(ch, ch.level+1) : ch
      )
    );

    return { ...node, children: newChildren };
  }

  // ≥ 2 modified children → regenerate here (LCA)
  return await rebuildSubtree(node, maxDepth);
}
export function addYCoord(node) {
  if (!node) return node;

  const updated = {
    ...node,
    // Preserve isModified flag - don't clear it here
    y_coord: node.y_coord ?? 0   // default value
  };

  if (!node.children) return updated;

  return {
    ...updated,
    children: node.children.map(addYCoord)
  };
}

export function reattachTrailingToLeaves(tree, tokens) {
  let i = 0;

  const attach = (node) => {
    if (!node) return node;

    if (node.level === LEAF_NODE_LEVEL) {
      const tok = tokens[i++];
      return {
        ...node,
        content: tok?.content ?? node.content,
        label: tok?.content ?? node.label,
        trailing: tok?.trailing ?? ""
      };
    }

    if (node.children) {
      return {
        ...node,
        children: node.children.map(attach)
      };
    }

    return node;
  };

  return attach(tree);
}
export function extractSubtreeTextFromTextarea(
  subtreeNode,
  textareaContent
) {
  // 1) get leaf order from subtree
  const leaves = [];
  const collect = (n) => {
    if (!n) return;
    if (n.level === LEAF_NODE_LEVEL) {
      leaves.push(n);
    } else {
      n.children?.forEach(collect);
    }
  };
  collect(subtreeNode);

  if (leaves.length === 0) return "";

  // 2) tokenize FULL textarea once
  const tokens = textToSentences(textareaContent);

  // 3) map subtree leaves → token indices
  // assumes order consistency (your invariant)
  const startIdx = leaves[0]._tokenIndex;
  const endIdx   = leaves[leaves.length - 1]._tokenIndex;

  // 4) reconstruct exact text slice
  return tokens
    .slice(startIdx, endIdx + 1)
    .map(t => t.content + t.trailing)
    .join("");
}

export async function rebuildSubtreeFromText(
  subtreeText,
  maxDepth
) {
  const tokens = textToSentences(subtreeText);
  const sentences = tokens.map(t => t.content);

  const aiSubtree = await buildTree(sentences, maxDepth);

  const withTrailing = reattachTrailingToLeaves(aiSubtree, tokens);
  const withCoords   = addYCoord(withTrailing);

  return withCoords;
}
export function findNodeById(root, targetId) {
  if (!root) return null;
  if (root.id === targetId) return root;

  if (!root.children || root.children.length === 0) {
    return null;
  }

  for (const child of root.children) {
    const found = findNodeById(child, targetId);
    if (found) return found;
  }

  return null;
}


export function replaceSubtree(root, targetId, newSubtree) {
  function walk(node) {
    if (!node) return node;

    if (node.id === targetId) {
      return {
        ...newSubtree,
        id: node.id,
        level: node.level
      };
    }

    if (!node.children) return node;

    const nextChildren = node.children.map(walk);

    // preserve identity if unchanged
    if (nextChildren.every((c, i) => c === node.children[i])) {
      return node;
    }

    return { ...node, children: nextChildren };
  }

  return walk(root);
}

