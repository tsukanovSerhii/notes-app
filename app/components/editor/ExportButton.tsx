"use client";

// ExportButton — exports the rendered preview (#preview-content) to a PDF
// using html2pdf.js, loaded lazily so it never runs on the server.

import { useState } from "react";

interface ExportButtonProps {
  title?: string;
}

export default function ExportButton({ title }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    const element = document.getElementById("preview-content");
    if (!element) return;

    setLoading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 12,
          filename: `${(title || "note").trim() || "note"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: "#0f0f11" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {loading ? "Exporting..." : "Export PDF"}
    </button>
  );
}
