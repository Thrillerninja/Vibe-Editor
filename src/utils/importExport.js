/**
 * Import/Export Utilities
 * Handles parsing and exporting of various file formats
 * Exports plain text from the editor (not tree structure)
 */

import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import { LOGGING_ENABLED, LOG_PREFIX } from './constants';

/**
 * Parse file content into sentences array
 * @param {File} file - The uploaded file
 * @param {string} content - The file content as string (for text formats)
 * @returns {Promise<Array>} Array of sentence objects
 */
export async function parseFileContent(file, content) {
    const fileType = getFileType(file.name);
    
    console.log(`${LOG_PREFIX.PARSER} Parsing file: ${file.name} (type: ${fileType})`);

    switch (fileType) {
        case 'txt':
            return parseTextContent(content);
        case 'md':
            return parseMarkdownContent(content);
        case 'html':
            return parseHtmlContent(content);
        case 'pdf':
            return parsePdfContent(content);
        case 'docx':
            return parseDocxContent(content);
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

/**
 * Get file type from filename
 */
function getFileType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
        'txt': 'txt',
        'md': 'md',
        'markdown': 'md',
        'html': 'html',
        'htm': 'html',
        'pdf': 'pdf',
        'docx': 'docx',
        'doc': 'docx',
    };
    return typeMap[ext] || 'txt';
}

/**
 * Parse plain text content into sentences
 */
function parseTextContent(text) {
    console.log(`${LOG_PREFIX.PARSER} Parsing plain text`);
    return parseIntoSentences(text);
}

/**
 * Parse markdown content into sentences
 */
function parseMarkdownContent(text) {
    console.log(`${LOG_PREFIX.PARSER} Parsing markdown content`);
    // Remove markdown syntax and parse as text
    const plainText = text
        .replace(/^#{1,6}\s+.+$/gm, '$&') // Keep headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
        .replace(/\*(.+?)\*/g, '$1') // Italic
        .replace(/`(.+?)`/g, '$1') // Inline code
        .replace(/```[\s\S]*?```/g, '') // Code blocks
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
        .replace(/^\s*[-*+]\s/gm, '• ') // Lists
        .replace(/^\s*\d+\.\s/gm, '') // Numbered lists
        .replace(/>\s+/g, '') // Blockquotes
        .replace(/\n{3,}/g, '\n\n'); // Normalize spacing
    return parseIntoSentences(plainText);
}

/**
 * Parse HTML content into sentences
 */
function parseHtmlContent(text) {
    console.log(`${LOG_PREFIX.PARSER} Parsing HTML content`);
    // Extract text from HTML
    const plainText = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ') // Remove tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/ /g, ' ')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .trim();
    return parseIntoSentences(plainText);
}

/**
 * Parse PDF content into sentences using pdfjs-dist
 * Preserves paragraph structure from the original PDF
 */
async function parsePdfContent(content) {
    console.log(`${LOG_PREFIX.PARSER} Parsing PDF content with pdfjs-dist`);
    try {
        // Dynamic import for pdfjs-dist
        const pdfjsLib = await import('pdfjs-dist');
        
        // Use unpkg for the worker
        const workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs';
        
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        console.log(`${LOG_PREFIX.PARSER} PDF.js worker source: ${workerSrc}`);
        
        // Get the getDocument function
        const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
        if (!getDocument) {
            throw new Error('pdfjs-dist getDocument function not found');
        }
        
        console.log(`${LOG_PREFIX.PARSER} Loading PDF document...`);
        
        // Load the PDF document
        let loadingTask;
        if (content instanceof ArrayBuffer) {
            loadingTask = getDocument({ data: content });
        } else if (typeof content === 'string') {
            const buffer = Buffer.from(content, 'binary');
            loadingTask = getDocument({ data: buffer });
        } else {
            throw new Error('Invalid content type for PDF parsing');
        }
        
        const pdf = await loadingTask.promise;
        console.log(`${LOG_PREFIX.PARSER} PDF loaded, ${pdf.numPages} pages found`);
        
        // Extract text from all pages with structure preservation
        let allParagraphs = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
            console.log(`${LOG_PREFIX.PARSER} Extracting text from page ${i}/${pdf.numPages}`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Get page height to detect line breaks
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;
            
            // Group items by line based on Y position
            const lines = [];
            let currentLine = { y: -1, items: [] };
            
            for (const item of textContent.items) {
                const normalizedY = pageHeight - item.transform[5];
                
                if (currentLine.y !== -1 && Math.abs(normalizedY - currentLine.y) > 5) {
                    const lineText = currentLine.items.map(item => item.str).join(' ').trim();
                    if (lineText) {
                        lines.push(lineText);
                    }
                    currentLine = { y: normalizedY, items: [item] };
                } else {
                    if (currentLine.items.length === 0) {
                        currentLine.y = normalizedY;
                    }
                    currentLine.items.push(item);
                }
            }
            
            if (currentLine.items.length > 0) {
                const lineText = currentLine.items.map(item => item.str).join(' ').trim();
                if (lineText) {
                    lines.push(lineText);
                }
            }
            
            // Merge lines that are continuations of the same sentence
            const paragraphs = mergeLineContinuations(lines);
            
            console.log(`${LOG_PREFIX.PARSER} Page ${i}: ${lines.length} raw lines → ${paragraphs.length} paragraphs`);
            
            allParagraphs.push(...paragraphs);
        }
        
        // Join all paragraphs with double newlines
        const fullText = allParagraphs.join('\n\n');
        
        console.log(`${LOG_PREFIX.PARSER} PDF text extracted: ${fullText.length} chars, ${allParagraphs.length} paragraphs`);
        
        if (fullText.trim().length === 0) {
            throw new Error('No text found in PDF. The PDF may be scanned/image-based.');
        }
        
        return parseIntoSentences(fullText);
    } catch (error) {
        console.error(`${LOG_PREFIX.PARSER} Error parsing PDF:`, error);
        throw new Error('Failed to parse PDF file: ' + error.message);
    }
}

/**
 * Merge lines that appear to be continuations of the same sentence
 */
function mergeLineContinuations(lines) {
    const paragraphs = [];
    let currentParagraph = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const lastChar = line[line.length - 1];
        const endsWithPunctuation = '.!?'.includes(lastChar);
        
        if (currentParagraph !== '') {
            const prevLastChar = currentParagraph[currentParagraph.length - 1];
            const prevEndsWithPunctuation = '.!?'.includes(prevLastChar);
            
            const firstChar = line[0];
            const startsLowercase = firstChar === firstChar.toLowerCase() && /[a-z]/.test(firstChar);
            const commonContinuations = ['and', 'but', 'or', 'however', 'therefore', 'thus', 'hence', 'also', 'which', 'that', 'who', 'whom', 'where', 'when', 'why', 'how'];
            const startsWithCommon = commonContinuations.some(w => line.toLowerCase().startsWith(w + ' '));
            
            const shouldContinue = !prevEndsWithPunctuation || (startsLowercase && !prevEndsWithPunctuation) || startsWithCommon;
            
            if (shouldContinue) {
                currentParagraph += ' ' + line;
                continue;
            }
        }
        
        if (currentParagraph) {
            paragraphs.push(currentParagraph);
        }
        
        currentParagraph = line;
    }
    
    if (currentParagraph) {
        paragraphs.push(currentParagraph);
    }
    
    return paragraphs;
}

/**
 * Parse DOCX content into sentences
 */
async function parseDocxContent(content) {
    console.log(`${LOG_PREFIX.PARSER} Parsing DOCX content`);
    try {
        let arrayBuffer;
        if (content instanceof ArrayBuffer) {
            arrayBuffer = content;
        } else if (typeof content === 'string') {
            const bytes = new Uint8Array(content.length);
            for (let i = 0; i < content.length; i++) {
                bytes[i] = content.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
        } else {
            throw new Error('Invalid content type for DOCX parsing');
        }
        
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value || '';
        console.log(`${LOG_PREFIX.PARSER} DOCX text extracted: ${text.length} chars`);
        return parseIntoSentences(text);
    } catch (error) {
        console.error(`${LOG_PREFIX.PARSER} Error parsing DOCX:`, error);
        throw new Error('Failed to parse Word document. Please ensure it contains extractable text.');
    }
}

/**
 * Main sentence parsing function
 */
function parseIntoSentences(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const sentences = [];
    let currentIndex = 0;

    const parts = text.split(/((?<=[.!?])[\s\n]+|\n\n+|\n(?!\s*$))/);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part === '') {
            currentIndex += part.length;
            continue;
        }

        const isDelimiter = /^([\s\n]+|\n\n+|\n)$/.test(part);

        if (isDelimiter) {
            currentIndex += part.length;
            continue;
        }

        if (part.trim() === '') {
            currentIndex += part.length;
            continue;
        }

        const partLength = part.length;

        let trailingDelimiter = '';
        if (i + 1 < parts.length) {
            const nextPart = parts[i + 1];
            if (/^([\s\n]+|\n\n+|\n)$/.test(nextPart)) {
                trailingDelimiter = nextPart;
            }
        }

        let sentenceText = part.trimStart();
        if (!sentenceText) {
            currentIndex += partLength;
            continue;
        }

        const endIdx = currentIndex + partLength;

        let delimiterType = 'none';
        let punctuation = undefined;

        if (trailingDelimiter) {
            const lastChar = sentenceText[sentenceText.length - 1];
            if ('.!?'.includes(lastChar)) {
                punctuation = lastChar;
            }

            if (trailingDelimiter.includes('\n\n') || /\n\n+/.test(trailingDelimiter)) {
                delimiterType = 'paragraph';
            } else if (trailingDelimiter.includes('\n')) {
                delimiterType = 'newline';
            } else {
                delimiterType = 'space';
            }
        } else {
            const lastChar = sentenceText[sentenceText.length - 1];
            if ('.!?'.includes(lastChar)) {
                punctuation = lastChar;
            }
            delimiterType = 'none';
        }

        sentences.push({
            id: uuidv4(),
            type: 'sentence',
            content: sentenceText,
            punctuation: punctuation,
            delimiter: delimiterType,
            delimiterContent: trailingDelimiter,
        });

        currentIndex = endIdx;
    }

    console.log(`${LOG_PREFIX.PARSER} Parsed ${sentences.length} sentences from imported content`);
    return sentences;
}

/**
 * Export sentences to TXT format (plain text from editor)
 */
export function exportToTxt(sentences) {
    console.log(`${LOG_PREFIX.PARSER} Exporting to TXT format`);
    
    if (!sentences || sentences.length === 0) {
        return '';
    }
    
    let result = '';
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        result += sentence.content;
        
        if (sentence.punctuation && !'.!?'.includes(sentence.content[sentence.content.length - 1])) {
            result += sentence.punctuation;
        }
        
        if (sentence.delimiterContent !== undefined) {
            result += sentence.delimiterContent;
        } else if (sentence.delimiter === 'paragraph') {
            result += '\n\n';
        } else if (sentence.delimiter === 'newline') {
            result += '\n';
        } else if (sentence.delimiter === 'space') {
            result += ' ';
        }
    }
    
    return result;
}

/**
 * Export sentences to Markdown format (plain text from editor)
 */
export function exportToMd(sentences) {
    console.log(`${LOG_PREFIX.PARSER} Exporting to Markdown format`);
    
    if (!sentences || sentences.length === 0) {
        return '# Vibe Editor Export\n\n';
    }
    
    let result = '';
    
    if (sentences._hierarchyMeta && sentences._hierarchyMeta.rootTitle) {
        result += `# ${sentences._hierarchyMeta.rootTitle}\n\n`;
    } else {
        result += `# Vibe Editor Export\n\n`;
    }
    
    result += exportToTxt(sentences);
    
    return result;
}

/**
 * Export sentences to HTML format (plain text from editor)
 */
export function exportToHtml(sentences) {
    console.log(`${LOG_PREFIX.PARSER} Exporting to HTML format`);
    
    if (!sentences || sentences.length === 0) {
        return generateEmptyHtml('Vibe Editor Export');
    }
    
    const title = sentences._hierarchyMeta?.rootTitle || 'Vibe Editor Export';
    const content = exportSentencesToHtml(sentences);
    
    return generateHtmlDocument(title, content);
}

/**
 * Export sentences to HTML (plain text)
 */
function exportSentencesToHtml(sentences) {
    let html = '<div class="section">\n';
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        
        const prevDelimiter = i > 0 ? sentences[i - 1].delimiter : null;
        if (prevDelimiter === 'paragraph') {
            html += '</div>\n<div class="section">\n';
        }
        
        html += `<p>${escapeHtml(sentence.content)}`;
        
        if (sentence.punctuation && !'.!?'.includes(sentence.content[sentence.content.length - 1])) {
            html += sentence.punctuation;
        }
        
        html += '</p>\n';
    }
    
    html += '</div>\n';
    return html;
}

/**
 * Generate HTML document wrapper
 */
function generateHtmlDocument(title, content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 { font-size: 2em; margin-bottom: 0.5em; color: #111; }
        p { margin: 0 0 1em 0; }
        .section { margin-bottom: 2em; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.9em; color: #666; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    ${content}
    <div class="footer">
        <p>Exported from Vibe Editor</p>
    </div>
</body>
</html>`;
}

/**
 * Generate empty HTML document
 */
function generateEmptyHtml(title) {
    return generateHtmlDocument(title, '<p>No content to export.</p>');
}

/**
 * Export sentences to PDF format using jsPDF (plain text from editor)
 */
export function exportToPdf(sentences) {
    console.log(`${LOG_PREFIX.PARSER} Exporting to PDF format`);
    
    if (!sentences || sentences.length === 0) {
        return null;
    }
    
    // Create PDF document
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const margin = 20;
    const lineHeight = 7;
    const fontSize = 11;
    const titleFontSize = 18;
    
    // Set font
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    
    let y = margin;
    const title = sentences._hierarchyMeta?.rootTitle || 'Vibe Editor Export';
    
    // Add title
    doc.setFontSize(titleFontSize);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, y, { align: 'center' });
    y += lineHeight * 2;
    
    // Reset font for content
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    
    // Export plain text content
    const text = exportToTxt(sentences);
    y = addTextToPdf(doc, text, y, pageWidth, margin, pageHeight, lineHeight);
    
    // Add footer
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Exported from Vibe Editor', pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    console.log(`${LOG_PREFIX.PARSER} PDF export complete`);
    
    return doc;
}

/**
 * Add text to PDF with word wrapping and page breaks
 */
function addTextToPdf(doc, text, startY, pageWidth, margin, pageHeight, lineHeight) {
    const lines = text.split('\n');
    let y = startY;
    
    for (const line of lines) {
        if (!line.trim()) {
            y += lineHeight;
            continue;
        }
        
        // Check if we need a new page
        if (y > pageHeight - margin - lineHeight) {
            doc.addPage();
            y = margin;
        }
        
        // Word wrap the line
        const wrappedLines = doc.splitTextToSize(line, pageWidth - (margin * 2));
        
        for (const wrappedLine of wrappedLines) {
            if (y > pageHeight - margin - lineHeight) {
                doc.addPage();
                y = margin;
            }
            
            doc.text(wrappedLine, margin, y);
            y += lineHeight;
        }
    }
    
    return y;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Download content as a file
 */
export function downloadFile(content, filename, mimeType) {
    console.log(`${LOG_PREFIX.PARSER} Downloading file: ${filename}`);
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    console.log(`${LOG_PREFIX.PARSER} Download complete: ${filename}`);
}

/**
 * Download PDF document
 */
export function downloadPdf(doc, filename) {
    console.log(`${LOG_PREFIX.PARSER} Downloading PDF: ${filename}`);
    
    if (doc) {
        doc.save(filename);
        console.log(`${LOG_PREFIX.PARSER} PDF download complete: ${filename}`);
    }
}
