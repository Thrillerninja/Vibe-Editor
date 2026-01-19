/**
 * @fileoverview File Operations - Import/Export functionality for the editor
 * 
 * Supports importing from: TXT, MD, JSON, PDF, DOCX
 * Supports exporting to: TXT, MD, HTML, JSON
 * 
 * @typedef {import('../types/node').Node} Node
 */

import { getContentNodesInDocumentOrder } from '@utils/nodeHelpers';
import { isContentNode, createRootNode, createContentNode, cloneNode } from '../types/node';
import { v4 as uuidv4 } from 'uuid';
import { EMOTION_COLORS } from '@utils/constants';

/**
 * Detect file type from extension
 * @param {string} filename 
 * @returns {string}
 */
export function detectFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const typeMap = {
    'txt': 'txt',
    'md': 'md',
    'markdown': 'md',
    'json': 'json',
    'html': 'html',
    'htm': 'html',
    'pdf': 'pdf',
    'docx': 'docx',
    'doc': 'docx',
  };
  return typeMap[ext] || 'unknown';
}

/**
 * Parse plain text into sentences
 * @param {string} text 
 * @returns {Array<{content: string, delimiter: string, delimiterContent: string}>}
 */
function parseTextToSentences(text) {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const sentences = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    
    if (!trimmed) {
      if (sentences.length > 0 && sentences[sentences.length - 1].delimiter === 'space') {
        sentences[sentences.length - 1].delimiter = 'newline';
        sentences[sentences.length - 1].delimiterContent = '\n';
      }
      continue;
    }

    const parts = [];
    let current = '';
    let i = 0;

    while (i < trimmed.length) {
      const char = trimmed[i];
      current += char;

      if (char === '.' || char === '!' || char === '?') {
        let spaceStart = i + 1;
        while (spaceStart < trimmed.length && /\s/.test(trimmed[spaceStart])) {
          spaceStart++;
        }

        if (spaceStart > i + 1 && spaceStart < trimmed.length) {
          const currentTrimmed = current.trim();
          const isListMarker = /^[0-9]+\.$|^[a-zA-Z]\.$/.test(currentTrimmed);

          if (!isListMarker) {
            parts.push({
              content: current.trim(),
              delimiter: 'space',
              delimiterContent: ' ',
            });
            current = '';
            i = spaceStart - 1;
          }
        }
      }
      i++;
    }

    if (current.trim()) {
      parts.push({
        content: current.trim(),
        delimiter: lineIdx < lines.length - 1 ? 'newline' : 'none',
        delimiterContent: lineIdx < lines.length - 1 ? '\n' : '',
      });
    }

    sentences.push(...parts);
  }

  return sentences.filter(s => s.content && s.content.length > 0);
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export nodeMap to plain text
 * @param {Map<string, Node>} nodeMap 
 * @param {string} rootId 
 * @returns {string}
 */
export function exportToTxt(nodeMap, rootId) {
  const contentNodes = getContentNodesInDocumentOrder(nodeMap, rootId);
  
  const text = contentNodes
    .map((node, idx) => {
      const isLastNode = idx === contentNodes.length - 1;
      const node_textRep = node.textRep || {};
      const delimiter = node_textRep.delimiter || (isLastNode ? '' : 'space');
      const delimiterContent = node_textRep.delimiterContent || 
        (delimiter === 'space' ? ' ' : delimiter === 'newline' ? '\n' : '');
      return node.content + delimiterContent;
    })
    .join('')
    .trim();

  return text;
}

/**
 * Export nodeMap to Markdown format
 * @param {Map<string, Node>} nodeMap 
 * @param {string} rootId 
 * @returns {string}
 */
export function exportToMd(nodeMap, rootId) {
  const root = nodeMap.get(rootId);
  if (!root) return '';

  let md = '# ' + root.content + '\n\n';

  const traverseAndAdd = (nodeId, indentLevel) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const indent = '  '.repeat(indentLevel);

    if (isContentNode(node)) {
      if (node.type === 'heading') {
        md += indent + node.content + '\n\n';
      } else if (node.type === 'list-item') {
        const marker = node.structure?.marker || '-';
        md += indent + marker + ' ' + node.content + '\n';
      } else if (node.type === 'blockquote') {
        const depth = node.structure?.depth || 1;
        md += indent + '> '.repeat(depth) + ' ' + node.content + '\n';
      } else if (node.type === 'code-block') {
        const lang = node.structure?.language || '';
        md += indent + '```' + lang + '\n' + indent + node.content + '\n' + indent + '```\n\n';
      } else {
        md += indent + node.content + '\n\n';
      }
    } else if (node.type === 'group') {
      const title = node.content || 'Section';
      md += indent + '## ' + title + '\n\n';
    }

    if (node.hierarchy.childIds) {
      node.hierarchy.childIds.forEach(childId => {
        traverseAndAdd(childId, indentLevel + 1);
      });
    }
  };

  if (root.hierarchy.childIds) {
    root.hierarchy.childIds.forEach(childId => {
      traverseAndAdd(childId, 0);
    });
  }

  return md.trim();
}

/**
 * Get emotion color for a node
 * @param {Object} emotionProfile 
 * @returns {string|null}
 */
function getEmotionColor(emotionProfile) {
  if (!emotionProfile || typeof emotionProfile !== 'object') return null;
  
  const entries = Object.entries(emotionProfile).filter(([, v]) => typeof v === 'number');
  if (entries.length === 0) return null;
  
  const dominant = entries.sort((a, b) => b[1] - a[1])[0];
  if (!dominant || dominant[1] === 0) return null;
  
  return EMOTION_COLORS[dominant[0]] || null;
}

/**
 * Escape HTML special characters
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render a single node to HTML
 * @param {string} nodeId 
 * @param {Map<string, Node>} nodeMap 
 * @returns {string}
 */
function renderNodeToHtml(nodeId, nodeMap) {
  const node = nodeMap.get(nodeId);
  if (!node) return '';

  const emotionColor = getEmotionColor(node.emotion?.profile);
  const style = emotionColor ? 'style="background-color: ' + emotionColor + '20; border-bottom: 2px solid ' + emotionColor + ';"' : '';

  let content = '';
  
  if (isContentNode(node)) {
    if (node.type === 'heading') {
      const level = node.structure?.level || 1;
      content = '<h' + level + ' ' + style + '>' + escapeHtml(node.content) + '</h' + level + '>';
    } else if (node.type === 'list-item') {
      content = '<li ' + style + '>' + escapeHtml(node.content) + '</li>';
    } else if (node.type === 'blockquote') {
      content = '<blockquote ' + style + '>' + escapeHtml(node.content) + '</blockquote>';
    } else if (node.type === 'code-block') {
      content = '<pre><code class="language-' + (node.structure?.language || 'text') + '">' + escapeHtml(node.content) + '</code></pre>';
    } else {
      content = '<p ' + style + '>' + escapeHtml(node.content) + '</p>';
    }
  } else if (node.type === 'group') {
    content = '<div class="section"><h2>' + escapeHtml(node.content) + '</h2>';
  }

  if (node.hierarchy.childIds) {
    const childrenHtml = node.hierarchy.childIds
      .map(childId => renderNodeToHtml(childId, nodeMap))
      .join('\n');
    
    if (node.type === 'group') {
      content += childrenHtml + '</div>';
    } else if (node.type === 'root') {
      content = childrenHtml;
    }
  }

  return content;
}

/**
 * Export nodeMap to HTML format with emotion coloring
 * @param {Map<string, Node>} nodeMap 
 * @param {string} rootId 
 * @returns {string}
 */
export function exportToHtml(nodeMap, rootId) {
  const root = nodeMap.get(rootId);
  if (!root) return '';

  let bodyContent = '';
  if (root.hierarchy.childIds) {
    bodyContent = root.hierarchy.childIds
      .map(childId => renderNodeToHtml(childId, nodeMap))
      .join('\n');
  }

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + escapeHtml(root.content) + '</title>\n  <style>\n    body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }\n    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }\n    p { margin: 1em 0; }\n    ul, ol { padding-left: 2em; }\n    blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }\n    pre { background: #f4f4f4; padding: 1em; overflow-x: auto; border-radius: 4px; }\n    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }\n    .section { margin: 1em 0; }\n  </style>\n</head>\n<body>\n  <h1>' + escapeHtml(root.content) + '</h1>\n  ' + bodyContent + '\n</body>\n</html>';
}

/**
 * Export nodeMap to JSON format (full backup)
 * @param {Map<string, Node>} nodeMap 
 * @param {string} rootId 
 * @returns {string}
 */
export function exportToJson(nodeMap, rootId) {
  const root = nodeMap.get(rootId);
  if (!root) return '{}';

  const nodes = Array.from(nodeMap.entries()).map(([id, node]) => ({
    id,
    type: node.type,
    content: node.content,
    hierarchy: node.hierarchy,
    structure: node.structure,
    formatting: node.formatting,
    textRep: node.textRep,
    emotion: node.emotion,
    metadata: node.metadata,
  }));

  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    rootId,
    maxDepth: root.hierarchy.level + 1,
    nodes: nodes,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Trigger file download
 * @param {string} content 
 * @param {string} filename 
 * @param {string} mimeType 
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generic export function - dispatches to appropriate format
 * @param {Map<string, Node>} nodeMap 
 * @param {string} rootId 
 * @param {string} format - 'txt', 'md', 'html', 'json'
 * @param {string} [filename] - Optional filename (auto-generated if not provided)
 * @returns {string} The filename of the downloaded file
 */
export function exportDocument(nodeMap, rootId, format, filename) {
  const root = nodeMap.get(rootId);
  const defaultName = (root?.content?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'document') + '_' + new Date().toISOString().split('T')[0];
  
  let content, mimeType, extension;

  switch (format.toLowerCase()) {
    case 'txt':
      content = exportToTxt(nodeMap, rootId);
      mimeType = 'text/plain';
      extension = 'txt';
      break;
    case 'md':
      content = exportToMd(nodeMap, rootId);
      mimeType = 'text/markdown';
      extension = 'md';
      break;
    case 'html':
      content = exportToHtml(nodeMap, rootId);
      mimeType = 'text/html';
      extension = 'html';
      break;
    case 'json':
      content = exportToJson(nodeMap, rootId);
      mimeType = 'application/json';
      extension = 'json';
      break;
    default:
      throw new Error('Unsupported export format: ' + format);
  }

  const finalFilename = filename || defaultName + '.' + extension;
  downloadFile(content, finalFilename, mimeType);

  console.log('[FileOperations] Exported as ' + format.toUpperCase() + ': ' + finalFilename);
  return finalFilename;
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/**
 * Import from text format (TXT or MD)
 * @param {string} content 
 * @param {number} maxDepth 
 * @returns {{ nodeMap: Map<string, Node>, rootId: string, draftText: string }}
 */
function importFromText(content, maxDepth) {
  const rootId = 'root'; // Always use 'root' for consistency
  const root = createRootNode(rootId, 'Imported Document', []);
  const nodeMap = new Map([[rootId, root]]);

  const sentences = parseTextToSentences(content);
  const contentLevel = maxDepth - 1;

  sentences.forEach((sentenceObj) => {
    const nodeId = uuidv4();
    const node = createContentNode(
      nodeId,
      'sentence',
      sentenceObj.content,
      rootId,
      maxDepth,
      {
        metadata: { isDirty: true, createdAt: new Date().toISOString(), version: 1 },
        textRep: {
          delimiter: sentenceObj.delimiter,
          delimiterContent: sentenceObj.delimiterContent,
        },
      }
    );
    node.hierarchy.level = contentLevel;
    nodeMap.set(nodeId, node);
  });

  // Update root children
  const contentIds = Array.from(nodeMap.values())
    .filter(isContentNode)
    .map(n => n.id);
  const updatedRoot = cloneNode(root);
  updatedRoot.hierarchy.childIds = contentIds;
  nodeMap.set(rootId, updatedRoot);

  const draftText = sentences
    .map((s) => s.content + (s.delimiterContent || ''))
    .join('')
    .trim();

  return { nodeMap, rootId, draftText };
}

/**
 * Import from JSON format
 * @param {Object} data 
 * @param {number} maxDepth 
 * @returns {{ nodeMap: Map<string, Node>, rootId: string, draftText: string }}
 */
function importFromJson(data, maxDepth) {
  const nodeMap = new Map();
  let draftText = '';

  // Use 'root' as rootId for consistency
  const originalRootId = data.rootId || 'root';
  let rootId = 'root';

  // Import nodes
  if (data.nodes && Array.isArray(data.nodes)) {
    data.nodes.forEach((nodeData) => {
      // Remap IDs if this is the root node
      let finalId = nodeData.id;

      if (nodeData.type === 'root' || nodeData.id === originalRootId) {
        // This is the root node - ensure it uses 'root' as ID
        finalId = 'root';
        rootId = 'root';
      }

      const node = {
        id: finalId,
        type: nodeData.type,
        content: nodeData.content,
        hierarchy: nodeData.hierarchy ? {
          ...nodeData.hierarchy,
          parentId: nodeData.hierarchy.parentId === originalRootId ? 'root' : nodeData.hierarchy.parentId,
        } : undefined,
        structure: nodeData.structure,
        formatting: nodeData.formatting,
        textRep: nodeData.textRep,
        emotion: nodeData.emotion,
        metadata: nodeData.metadata,
      };
      nodeMap.set(finalId, node);

      // Build draft text from content nodes
      if (isContentNode(node)) {
        const node_textRep = node.textRep || {};
        const delimiter = node_textRep.delimiter || 'space';
        const delimiterContent = node_textRep.delimiterContent || ' ';
        draftText += node.content + delimiterContent;
      }
    });
  }

  // Ensure root exists
  if (!nodeMap.has('root')) {
    const root = createRootNode('root', data.rootTitle || 'Imported Document', []);
    nodeMap.set('root', root);
  }

  return { nodeMap, rootId: 'root', draftText: draftText.trim() };
}

/**
 * Parse PDF text using pdfjs-dist library
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<string>}
 */
async function parsePdfText(arrayBuffer) {
  try {
    // Dynamic import for pdf.js
    const pdfjsLib = await import('pdfjs-dist');
    
    // Configure worker using blob approach for Vite compatibility
    const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default || workerModule;
    
    // Use getDocument API
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    console.log('[FileOperations] PDF parsed, extracted ' + fullText.length + ' characters');
    return fullText;
  } catch (error) {
    console.error('[FileOperations] PDF parsing error:', error);
    throw new Error('Failed to parse PDF. Please try converting to text first.');
  }
}

/**
 * Parse Word document (.docx) text using mammoth.js
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<string>}
 */
async function parseDocxText(arrayBuffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('[FileOperations] DOCX parsing error:', error);
    throw new Error('Failed to parse Word document. Please try converting to text first.');
  }
}

/**
 * Generic import function - handles all supported formats
 * @param {File} file 
 * @param {number} maxDepth 
 * @returns {Promise<{ nodeMap: Map<string, Node>, rootId: string, draftText: string, format: string }>}
 */
export async function importDocument(file, maxDepth = 3) {
  const fileType = detectFileType(file.name);
  
  console.log('[FileOperations] Importing file: ' + file.name + ', type: ' + fileType);

  let nodeMap, rootId, draftText;

  switch (fileType) {
    case 'txt':
    case 'md': {
      const text = await file.text();
      ({ nodeMap, rootId, draftText } = importFromText(text, maxDepth));
      break;
    }
    
    case 'json': {
      const text = await file.text();
      const data = JSON.parse(text);
      ({ nodeMap, rootId, draftText } = importFromJson(data, maxDepth));
      break;
    }
    
    case 'pdf': {
      const arrayBuffer = await file.arrayBuffer();
      const text = await parsePdfText(arrayBuffer);
      ({ nodeMap, rootId, draftText } = importFromText(text, maxDepth));
      break;
    }
    
    case 'docx': {
      const arrayBuffer = await file.arrayBuffer();
      const text = await parseDocxText(arrayBuffer);
      ({ nodeMap, rootId, draftText } = importFromText(text, maxDepth));
      break;
    }
    
    default:
      throw new Error('Unsupported file format: ' + fileType + '. Supported formats: TXT, MD, JSON, PDF, DOCX');
  }

  return { nodeMap, rootId, draftText, format: fileType };
}

/**
 * Create a file input element for file selection
 * @param {string} accept - Comma-separated list of accepted file types
 * @param {Function} onFileSelected - Callback with (file) parameter
 * @returns {HTMLInputElement}
 */
export function createFileInput(accept = '.txt,.md,.json,.pdf,.docx', onFileSelected) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };
  
  document.body.appendChild(input);
  return input;
}

/**
 * Trigger file input click
 * @param {string} accept 
 * @param {Function} callback 
 */
export function triggerFilePicker(accept, callback) {
  const input = createFileInput(accept, callback);
  input.click();
  document.body.removeChild(input);
}

export default {
  detectFileType,
  exportToTxt,
  exportToMd,
  exportToHtml,
  exportToJson,
  exportDocument,
  importDocument,
  createFileInput,
  triggerFilePicker,
};

