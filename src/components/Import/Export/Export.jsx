import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";

function sanitizeFilename(name) {
  // Entfernt unzulässige Zeichen (Windows/Mac safe)
  return (name || "vibe_text")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");
}

export function exportTxt(text,filename) {
    if (!text) {
        alert("No text to export!");
        return; 
    }

    const safe = sanitizeFilename(filename);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${safe || "vibe_editor_text"}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function exportPdf(text,filename) {
    const content = String(text ?? "");
    if (!text) {
        alert("No text to export!");
        return; 
    }

    const safe = sanitizeFilename(filename);

    const doc = new jsPDF({
        unit: "pt",
        format: "a4"
    });
    // Typografie
    doc.setFont("times", "normal");     // wirkt „ruhiger“ als default
    doc.setFontSize(12);

    const margin = 56;                 // ca. 2cm
    const lineHeight = 16;             // 12pt Schrift -> ~16pt Zeilenhöhe
    const paragraphGap = 10;           // extra Abstand zwischen Absätzen

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;

    let y = margin;

    // Absätze erhalten: split nach Leerzeilen oder Zeilenumbrüchen
    const paragraphs = content
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/); // 2+ newlines => neuer Absatz

    for (const p of paragraphs) {
        const trimmed = p.trim();

        // Leerer Absatz -> nur Abstand
        if (!trimmed) {
        y += paragraphGap;
        continue;
        }

        // Zeilen im Absatz umbrechen
        const lines = doc.splitTextToSize(trimmed, maxWidth);

        for (const line of lines) {
        // Seitenumbruch
        if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
        }

        // Abstand nach Absatz
        y += paragraphGap;
    }

    doc.save(`${safe || "vibe_editor_text"}.pdf`);
}

export async function exportDocx(text, filename) {
    const content = String(text ?? "").trim();
    if (!content) {
        alert("No text to export!");
        return;
    }

    const paragraphs = content
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/); // Absätze behalten

    const doc = new Document({
        sections: [
        {
            children: paragraphs.map(p =>
            new Paragraph({
                children: [
                new TextRun({
                    text: p,
                    size: 24, // 12pt
                    font: "Times New Roman",
                }),
                ],
                spacing: { after: 200 },
            })
            ),
        },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const safe = sanitizeFilename(filename);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.docx`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportFile(text, format, filename) {
    if (format === "txt") {
        exportTxt(text, filename);
    } else if (format === "pdf") {
        exportPdf(text, filename);
    } else if (format === "docx") {
        exportDocx(text, filename);
    } else {
        alert("Unsupported format: " + format);
    }
}

