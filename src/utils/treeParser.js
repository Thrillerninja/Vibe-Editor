/**
 * Text parsing utilities
 * Converts plain text into hierarchical tree structure
 */

import { LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH } from './constants';

/**
 * Parses plain text into a hierarchical tree structure
 * Structure: Document → Chapters (double newline) → Sections (single newline) → Sentences
 * 
 * @param {string} input - The raw text input
 * @returns {Object} Tree structure with id, type, label, and children
 */
export function parseTextToHierarchy(text) {
  console.log(`${LOG_PREFIX.PARSER} Starting parse...`);
  
  if (!text) {
    console.log(`${LOG_PREFIX.PARSER} Empty input, returning default root`);
    return { id: 'root', startIdx: 0, type: 'root', label: 'Document', children: [] };
  }

  const hierarchy = {
    id: 'root',
    type: 'root',
    label: 'Document',
    children: [],
    startIdx: 0,
  };

  // globalIndex tracks our position in the *original* text
  let globalIndex = 0;
  let i = 0, k = 0, j = 0; // Node counters

  // --- FIX 1: Split by *exactly* two newlines (and capture them) ---
  const chapterStrings = text.split(/(\r\n\r\n|\n\n)/);

  for (const chapterText of chapterStrings) {
    // Check if the *entire string* is a delimiter
    if (chapterText === '\n\n' || chapterText === '\r\n\r\n') {
      // This is a delimiter, just advance the index
      globalIndex += chapterText.length;
      continue;
    }
    // --- FIX: Use .trim() to skip empty AND whitespace-only strings ---
    if (chapterText.trim() === '') {
      // **THE FIX**: We must still advance the index by the length of the whitespace
      globalIndex += chapterText.length;
      continue; 
    }

    const chapterStartIndex = globalIndex;
    const chapterNode = {
      id: `chapter-${i}`,
      type: 'chapter',
      label: `${chapterText}|${chapterStartIndex}|${chapterStartIndex + chapterText.length}`,
      children: [],
      startIdx: chapterStartIndex,
    };

    // --- FIX 2: Split by *exactly* one newline (and capture it) ---
    const sectionStrings = chapterText.split(/(\r\n|\n)/);

    for (const sectionText of sectionStrings) {
      // Check if the *entire string* is a delimiter
      if (sectionText === '\n' || sectionText === '\r\n') {
        // This is a delimiter, advance the index
        globalIndex += sectionText.length;
        continue;
      }
      // --- FIX: Use .trim() to skip empty AND whitespace-only strings ---
      if (sectionText.trim() === '') {
        // **THE FIX**: We must still advance the index by the length of the whitespace
        globalIndex += sectionText.length;
        continue;
      }

      const sectionStartIndex = globalIndex;
      const sectionNode = {
        id: `section-${i}-${k}`,
        type: 'section',
        label: `${sectionText}|${sectionStartIndex}|${sectionStartIndex + sectionText.length}`,
        children: [],
        startIdx: sectionStartIndex,
      };

      // --- FIX 3: Split by sentence-ending punctuation + space (and capture it) ---
      const sentenceStrings = sectionText.split(/((?<=[.!?])\s+)/);

      for (const sentenceText of sentenceStrings) {
        // Check if the *entire string* is a delimiter (e.g., " ")
        if (/^((?<=[.!?])\s+)$/.test(sentenceText)) {
           // This is a delimiter, advance the index
          globalIndex += sentenceText.length;
          continue;
        }
        // --- FIX: Use .trim() to skip empty AND whitespace-only strings ---
        if (sentenceText.trim() === '') {
          // **THE FIX**: We must still advance the index by the length of the whitespace
          globalIndex += sentenceText.length;
          continue;
        }

        const sentenceStartIndex = globalIndex;
        const sentenceNode = {
          id: `sentence-${i}-${k}-${j}`,
          type: 'argument',
          label: `${sentenceText}|${sentenceStartIndex}|${sentenceStartIndex + sentenceText.length}`,
          children: [],
          startIdx: sentenceStartIndex,
        };
        
        sectionNode.children.push(sentenceNode);
        globalIndex += sentenceText.length; // Advance index by sentence length
        j++;
      }
      
      chapterNode.children.push(sectionNode);
      k++;
    }
    
    hierarchy.children.push(chapterNode);
    i++;
  }

  console.log(`${LOG_PREFIX.PARSER} Parse complete. Total nodes: ${countNodes(hierarchy)}`);
  return hierarchy;
}


/**
 * Flattens tree structure into nodes and edges for ReactFlow
 * @param {Object} tree - Hierarchical tree structure
 * @returns {{nodes: Array, edges: Array}} Flattened structure
 */
export function flattenTree(tree) {
  console.log(`${LOG_PREFIX.PARSER} Flattening tree...`);
  
  const nodes = [];
  const edges = [];
  const stack = [tree];
  while (stack.length) {
    const curr = stack.pop();
    nodes.push({
      id: curr.id,
      data: {
        label: curr.label,
        type: curr.type,
        startIdx: curr.startIdx,     // <-- add this line
      },
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH },
      type: 'animatedNode',
    });

    for (const child of curr.children || []) {
      edges.push({
        id: `${curr.id}-${child.id}`,
        source: curr.id,
        target: child.id,
      });
      stack.push(child);
    }
  }
  console.log(`${LOG_PREFIX.PARSER} Flattened to ${nodes.length} nodes, ${edges.length} edges`);
  return { nodes, edges };
}

/**
 * Helper: counts total nodes in tree
 */
function countNodes(tree) {
  let count = 1;
  for (const child of tree.children || []) {
    count += countNodes(child);
  }
  return count;
}