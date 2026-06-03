"use client";

// Preview — renders the markdown content with react-markdown + remark-gfm.
// The wrapper carries id="preview-content" so the PDF export can target it.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PreviewProps {
  content: string;
}

export default function Preview({ content }: PreviewProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div
        id="preview-content"
        className="prose prose-invert max-w-none
          prose-headings:text-text-primary
          prose-p:text-text-muted
          prose-li:text-text-muted
          prose-strong:text-text-primary
          prose-a:text-accent
          prose-code:text-accent
          prose-pre:bg-bg-base prose-pre:border prose-pre:border-border
          prose-blockquote:border-l-accent prose-blockquote:text-text-muted"
      >
        {content.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <p className="text-text-muted">Nothing to preview yet.</p>
        )}
      </div>
    </div>
  );
}
