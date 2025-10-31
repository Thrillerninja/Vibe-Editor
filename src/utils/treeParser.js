/**
 * Text parsing utilities
 * Converts plain text into hierarchical tree structure
 */

import { LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH } from './constants';

/**
 * Splits text into sentences based on punctuation
 * @param {string} text - Text to split
 * @returns {string[]} Array of sentences
 */
function extractSentences(text) {
  return text.split(/(?<=[.!?\n])\s+/);
}

/**
 * Parses plain text into a hierarchical tree structure
 * Structure: Document → Chapters (double newline) → Sections (single newline) → Sentences
 * 
 * @param {string} input - The raw text input
 * @returns {Object} Tree structure with id, type, label, and children
 */
export function parseTextToHierarchy(input) {
  console.log(`${LOG_PREFIX.PARSER} Starting parse...`);
  
  const text = String(input ?? '').trim();
  
  if (!text) {
    console.log(`${LOG_PREFIX.PARSER} Empty input, returning default root`);
    return { id: 'root', type: 'root', label: 'Document', children: [] };
  }

  // Split by double newlines to get chapters
  const chapters = text.trim().split(/(?:\r\n|\n){2,}/);
  console.log(`${LOG_PREFIX.PARSER} Found ${chapters.length} chapters`);

  const hierarchy = {
    id: 'root',
    type: 'root',
    label: 'Document',
    children: new Array(chapters.length),
  };

  for (let i = 0; i < chapters.length; i++) {
    console.log(`${LOG_PREFIX.PARSER} Processing chapter ${i}: "${chapters[i].substring(0, 30)}..."`);
    
    // Split by single newlines to get sections
    const sections = chapters[i].trim().split('\n');
    const sectionsCollected = [];

    for (let k = 0; k < sections.length; k++) {
      console.log(`${LOG_PREFIX.PARSER}   Section ${k}: "${sections[k].substring(0, 30)}..."`);
      
      // Split into sentences
      const sentenceStrings = sections[k].trim().split(/(?<=[.!?\n])\s+/);
      const sentencesCollected = [];

      for (let j = 0; j < sentenceStrings.length; j++) {
        console.log(`${LOG_PREFIX.PARSER}     Sentence ${j}: "${sentenceStrings[j].substring(0, 20)}..."`);
        sentencesCollected.push({
          id: `sentence-${i}${k}${j}`,
          type: 'argument',
          label: sentenceStrings[j].trim(),
          children: [],
        });
      }

      const section = {
        id: `section-${i}${k}`,
        type: 'section',
        label: sections[k].trim(),
        children: sentencesCollected,
      };
      sectionsCollected.push(section);
    }

    const chapter = {
      id: `chapter-${i}`,
      type: 'chapter',
      label: chapters[i].trim(),
      children: sectionsCollected,
    };
    hierarchy.children[i] = chapter;
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
      data: { label: curr.label, type: curr.type },
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH },
      type: 'animatedNode',
    });

    for (const child of curr.children || []) {
      edges.push({
        id: `${curr.id}-${child.id}`,
        source: curr.id,
        target: child.id,
        animated: false,
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