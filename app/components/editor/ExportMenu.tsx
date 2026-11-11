"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import Markdown from "@/app/components/editor/Markdown";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import { useDismiss } from "@/app/hooks/useDismiss";
import { downloadText } from "@/app/lib/download";
import { toFileName } from "@/app/lib/text";
import { useI18n } from "@/app/lib/i18n";

interface ExportMenuProps {
  title?: string;
  content: string;
  disabled?: boolean;
  onError: (message: string) => void;
  /** Lets the command palette start an export. */
  ref?: Ref<ExportActions>;
}

export interface ExportActions {
  exportPdf(): void;
  exportMarkdown(): void;
}

type Html2Pdf = (typeof import("html2pdf.js"))["default"];
/** html2pdf.js supports `pagebreak`, but its bundled typings leave it out. */
type PdfOptions = Parameters<InstanceType<Html2Pdf["Worker"]>["set"]>[0] & {
  pagebreak?: { mode?: ("avoid-all" | "css" | "legacy")[]; avoid?: string[] };
};

interface PdfJob {
  title: string;
  content: string;
  /** Captured when the job starts, so the effect does not depend on the locale. */
  failedMessage: string;
}

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
.pdf-document ul, .pdf-document ol { padding-left: 18pt; margin: 4pt 0; }
.pdf-document ul { list-style: disc; }
.pdf-document ol { list-style: decimal; }
.pdf-document code {
  background: #f3f4f6; color: #be185d; padding: 1pt 4pt; border-radius: 3pt;
  font-family: 'JetBrains Mono', monospace; font-size: 10.5pt;
}
.pdf-document pre {
  background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 6pt; padding: 8pt;
  white-space: pre-wrap;
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
.pdf-document .tok-keyword { color: #7c3aed; }
.pdf-document .tok-string { color: #047857; }
.pdf-document .tok-number, .pdf-document .tok-literal { color: #b45309; }
.pdf-document .tok-comment { color: #6b7280; font-style: italic; }
.pdf-document .tok-function { color: #1d4ed8; }
.pdf-document .tok-type, .pdf-document .tok-tag { color: #0e7490; }
.pdf-document .tok-property, .pdf-document .tok-attr { color: #be185d; }
.pdf-document .tok-variable { color: #a16207; }
.pdf-document ul.contains-task-list, .pdf-document li.task-list-item { list-style: none; }
.pdf-document ul.contains-task-list { padding-left: 4pt; }
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

export default function ExportMenu({
  title,
  content,
  disabled,
  onError,
  ref,
}: ExportMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pdfJob, setPdfJob] = useState<PdfJob | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, open, () => setOpen(false));

  // The print-only copy of the note is mounted only while a PDF is being
  // generated, instead of re-rendering a second Markdown tree on every keystroke.
  useEffect(() => {
    if (!pdfJob) return;
    let cancelled = false;

    (async () => {
      try {
        const element = printRef.current;
        if (!element) throw new Error("Nothing to export");
        const html2pdf = (await import("html2pdf.js")).default;
        const options: PdfOptions = {
          margin: [14, 14, 14, 14],
          filename: toFileName(pdfJob.title, "pdf"),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          // Keep code blocks, table rows and quotes from being cut between pages.
          pagebreak: { mode: ["css", "legacy"], avoid: ["pre", "tr", "img", "blockquote"] },
        };
        await html2pdf().set(options).from(element)
          .save();
      } catch {
        if (!cancelled) onError(pdfJob.failedMessage);
      } finally {
        if (!cancelled) setPdfJob(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfJob, onError]);

  const exportPdf = () => {
    setOpen(false);
    setPdfJob({ title: title ?? "", content, failedMessage: t.export.failed });
  };

  const exportMarkdown = () => {
    setOpen(false);
    downloadText(toFileName(title, "md"), content.endsWith("\n") ? content : `${content}\n`);
  };

  const busy = pdfJob !== null;

  useImperativeHandle(ref, () => ({
    exportPdf: () => {
      if (!disabled && !busy) exportPdf();
    },
    exportMarkdown: () => {
      if (!disabled) exportMarkdown();
    },
  }));

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        disabled={busy || disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="download" strokeWidth={2.2} />
        <span className="hidden sm:inline">{busy ? t.export.exporting : t.export.button}</span>
        <Icon name="chevronDown" size={12} className="hidden sm:block" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-48 rounded-lg border border-border bg-bg-elevated p-1 shadow-xl"
        >
          <MenuItem icon="download" label={t.export.pdf} onClick={exportPdf} />
          <MenuItem icon="fileText" label={t.export.markdown} onClick={exportMarkdown} />
        </div>
      )}

      {pdfJob && (
        <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
          <div
            ref={printRef}
            className="pdf-document"
            style={{
              width: "180mm",
              padding: "4mm",
              background: "#ffffff",
              color: "#1f2933",
              fontFamily: "Inter, Arial, sans-serif",
              fontSize: "12pt",
              lineHeight: 1.6,
            }}
          >
            <style>{PDF_STYLES}</style>
            {pdfJob.title.trim() && (
              <h1 style={{ fontSize: "20pt", marginBottom: "8pt" }}>{pdfJob.title}</h1>
            )}
            <Markdown variant="print">{pdfJob.content || t.export.empty}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: "download" | "fileText";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
