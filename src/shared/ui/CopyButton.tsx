"use client";

import { useState } from "react";
import Icon from "@/shared/ui/Icon";
import { useI18n } from "@/shared/i18n";

/** Copies `text` to the clipboard and confirms it for a moment. */
export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked (insecure context, permissions): no-op.
        }
      }}
      aria-label={copied ? t.common.copied : t.common.copyCode}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      {copied ? t.common.copied : t.common.copy}
    </button>
  );
}
