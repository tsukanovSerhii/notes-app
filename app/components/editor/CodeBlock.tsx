"use client";

import { useMemo, useState } from "react";
import { highlight } from "@/app/lib/highlight";
import Icon from "@/app/components/ui/Icon";
import { useI18n } from "@/app/lib/i18n";

export function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const tokens = useMemo(() => highlight(code, lang), [code, lang]);
  return (
    <code className={`language-${lang}`}>
      {tokens.map((t, i) =>
        t.type === "plain" ? t.text : (
          <span key={i} className={`tok-${t.type}`}>
            {t.text}
          </span>
        )
      )}
    </code>
  );
}

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
