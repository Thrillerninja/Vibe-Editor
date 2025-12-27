import { useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function ExportPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);

  const exportAsMarkdown = () => {
    editor.getEditorState().read(() => {
      const markdown = $convertToMarkdownString(TRANSFORMERS);
      downloadFile('document.md', markdown, 'text/markdown');
    });
  };

  const exportAsText = () => {
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const text = root.getTextContent();
      downloadFile('document.txt', text, 'text/plain');
    });
  };

  const exportAsHTML = () => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            color: #1f2937;
        }
        h1 { font-size: 32px; margin: 24px 0 16px; }
        h2 { font-size: 24px; margin: 20px 0 12px; }
        h3 { font-size: 20px; margin: 16px 0 8px; }
        p { margin: 8px 0; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; }
        pre { background: #1f2937; color: #f3f4f6; padding: 16px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 4px solid #d1d5db; padding-left: 16px; color: #6b7280; }
    </style>
</head>
<body>
${editorElement.innerHTML}
</body>
</html>`;

    downloadFile('document.html', htmlContent, 'text/html');
  };

  const exportAsPDF = async () => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    try {
      const canvas = await html2canvas(editorElement, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297; // A4 height

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      pdf.save('document.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const downloadFile = (filename, content, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-plugin">
      <button
        className="export-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Export Document"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export
      </button>

      {isOpen && (
        <div className="export-dropdown">
          <button className="export-option" onClick={exportAsMarkdown}>
            📝 Export as Markdown (.md)
          </button>
          <button className="export-option" onClick={exportAsText}>
            📄 Export as Text (.txt)
          </button>
          <button className="export-option" onClick={exportAsHTML}>
            🌐 Export as HTML (.html)
          </button>
          <button className="export-option" onClick={exportAsPDF}>
            📕 Export as PDF (.pdf)
          </button>
        </div>
      )}
    </div>
  );
}