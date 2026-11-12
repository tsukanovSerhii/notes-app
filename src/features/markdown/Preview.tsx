"use client";

import { useDeferredValue } from "react";
import Markdown from "@/features/markdown/Markdown";
import { useThrottledValue } from "@/shared/hooks/useThrottledValue";
import { useI18n } from "@/shared/i18n";

/** The look of rendered notes, shared by the preview and the page a share link opens. */
export const PROSE_CLASS = `prose dark:prose-invert max-w-none transition-opacity
          prose-headings:text-text-primary
          prose-p:text-text-secondary
          prose-li:text-text-secondary
          prose-strong:text-text-primary
          prose-a:text-accent
          prose-code:text-accent prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-bg-base/80 prose-pre:border prose-pre:border-border
          prose-blockquote:border-l-accent prose-blockquote:text-text-secondary
          prose-th:text-text-primary prose-td:text-text-secondary`;

/** How often the preview may redraw while the text is changing. */
const PREVIEW_INTERVAL_MS = 150;

interface PreviewProps {
  content: string;
}

export default function Preview({ content }: PreviewProps) {
  const { t } = useI18n();
  // Parsing Markdown on every keystroke lags on long notes and on slow
  // devices, so the preview follows typing at most every 150 ms; the deferred
  // value then lets React keep typing responsive while it catches up.
  const throttled = useThrottledValue(content, PREVIEW_INTERVAL_MS);
  const deferred = useDeferredValue(throttled);
  const stale = deferred !== content;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <article
        id="preview-content"
        aria-label={t.editor.preview}
        aria-busy={stale}
        className={PROSE_CLASS}
      >
        {deferred.trim() ? (
          <Markdown>{deferred}</Markdown>
        ) : (
          <p className="text-text-muted">{t.editor.nothingToPreview}</p>
        )}
      </article>
    </div>
  );
}
