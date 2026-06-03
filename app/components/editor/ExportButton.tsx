"use client";

// ExportButton — exports the active note as a clean, light-themed PDF.
//
// We deliberately do NOT screenshot the dark on-screen preview: html2canvas
// (inside html2pdf.js) can't parse modern oklch/oklab colors that Tailwind 4
// emits, which produced white-on-white text. Instead we render the markdown
// into a hidden, print-oriented container with explicit hex colors and export
// that.

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Button from "@/app/components/ui/Button";

interface ExportButtonProps {
  title?: string;
  content: string;
  disabled?: boolean;
}

// Inline CSS lives *inside* the cloned container so html2canvas (which clones
// the node into its own iframe, without our global stylesheet) still applies
// it. Explicit hex colors only — no oklch/CSS variables.
const PDF_STYLES = `
.pdf-document { color: #1f2933; }
.pdf-document h1, .pdf-document h2, .pdf-document h3, .pdf-document h4 {
  color: #111827; font-weight: 700; line-height: 1.3; margin: 14pt 0 6pt;
}
.pdf-document h1 { font-size: 18pt; }
.pdf-document h2 { font-size: 15pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 3pt; }
.pdf-document h3 { font-size: 13pt; }
.pdf-document p, .pdf-document li { color: #1f2933; margin: 4pt 0; }
.pdf-document a { color: #4f46e5; text-decoration: underline; }
.pdf-document strong { color: #111827; font-weight: 700; }
.pdf-document em { color: #1f2933; }
.pdf-document ul, .pdf-document ol { padding-left: 18pt; margin: 4pt 0; }
.pdf-document code {
  background: #f3f4f6; color: #be185d; padding: 1pt 4pt; border-radius: 3pt;
  font-family: 'JetBrains Mono', monospace; font-size: 10.5pt;
}
.pdf-document pre {
  background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6pt; padding: 8pt;
}
.pdf-document pre code { background: transparent; color: #1f2933; padding: 0; }
.pdf-document blockquote {
  border-left: 3px solid #4f46e5; margin: 6pt 0; padding: 2pt 0 2pt 10pt; color: #4b5563;
}
.pdf-document table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
.pdf-document th, .pdf-document td {
  border: 1px solid #d1d5db; padding: 4pt 8pt; text-align: left; color: #1f2933;
}
.pdf-document th { background: #f3f4f6; font-weight: 700; }
.pdf-document hr { border: none; border-top: 1px solid #e5e7eb; margin: 10pt 0; }
.pdf-document ul.contains-task-list, .pdf-document li.task-list-item { list-style: none; }
.pdf-document li.task-list-item { padding-left: 0; }
.pdf-document input[type="checkbox"] {
  -webkit-appearance: none; appearance: none; width: 11pt; height: 11pt;
  margin-right: 6pt; border: 1.5px solid #6b7280; border-radius: 3pt;
  vertical-align: -1.5pt; display: inline-block; position: relative;
}
.pdf-document input[type="checkbox"]:checked { background: #4f46e5; border-color: #4f46e5; }
.pdf-document input[type="checkbox"]:checked::after {
  content: ""; position: absolute; left: 3.2pt; top: 0.5pt; width: 2.6pt; height: 6pt;
  border: solid #ffffff; border-width: 0 1.5pt 1.5pt 0; transform: rotate(45deg);
}
`;

export default function ExportButton({
  title,
  content,
  disabled,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    const element = printRef.current;
    if (!element) return;

    setLoading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [14, 14, 14, 14],
          filename: `${(title || "note").trim() || "note"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        size="md"
        onClick={handleExport}
        disabled={loading || disabled}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {loading ? "Exporting..." : "Export PDF"}
      </Button>

      {/* Hidden, light-themed render target for the PDF. Offscreen, not
          display:none — html2canvas needs it laid out to measure it. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
        <div
          ref={printRef}
          style={{
            width: "180mm",
            padding: "4mm",
            background: "#ffffff",
            color: "#1f2933",
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: "12pt",
            lineHeight: 1.6,
          }}
          className="pdf-document"
        >
          <style dangerouslySetInnerHTML={{ __html: PDF_STYLES }} />
          {title?.trim() ? (
            <h1
              style={{
                fontSize: "20pt",
                fontWeight: 700,
                color: "#111827",
                marginBottom: "8pt",
              }}
            >
              {title}
            </h1>
          ) : null}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || "_(empty note)_"}
          </ReactMarkdown>
        </div>
      </div>
    </>
  );
}
