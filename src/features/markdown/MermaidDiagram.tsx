"use client";

import { useEffect, useId, useState } from "react";

type MermaidApi = (typeof import("mermaid"))["default"];
let mermaid: Promise<MermaidApi> | null = null;
let renders = 0;

/** Mermaid is large, so it loads the first time a note has a diagram. */
function loadMermaid() {
  mermaid ??= import("mermaid").then((m) => m.default);
  return mermaid;
}

/**
 * Renders a ```mermaid block as an SVG. Mermaid runs with securityLevel
 * "strict", which sanitizes the diagram (DOMPurify) and disables clicks and
 * HTML labels, so the SVG it returns is safe to insert.
 */
export default function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const [result, setResult] = useState<{ svg: string } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const light = document.documentElement.dataset.theme === "light";
    void loadMermaid()
      .then(async (api) => {
        api.initialize({ startOnLoad: false, securityLevel: "strict", theme: light ? "default" : "dark" });
        const { svg } = await api.render(`mermaid-${id}-${++renders}`, code);
        if (!cancelled) setResult({ svg });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (result && "error" in result) {
    return (
      <div role="alert" className="not-prose my-4 rounded-md border border-red-500/40 p-3 text-xs">
        <p className="mb-2 font-semibold text-red-400">Mermaid: {result.error.split("\n")[0]}</p>
        <pre className="overflow-x-auto font-mono text-text-muted">{code}</pre>
      </div>
    );
  }
  return (
    <div
      data-mermaid={result ? "rendered" : "loading"}
      className="not-prose my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
      // Sanitized by Mermaid in strict mode; see above.
      dangerouslySetInnerHTML={result ? { __html: result.svg } : undefined}
    >
      {result ? undefined : <pre className="w-full font-mono text-xs text-text-muted">{code}</pre>}
    </div>
  );
}
