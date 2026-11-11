"use client";

import { useMemo } from "react";
import { highlight } from "@/features/markdown/lib/highlight";

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
