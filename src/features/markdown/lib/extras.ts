import type { Options } from "react-markdown";

/** Prose without code, where `$` is still just a dollar sign. */
const prose = (md: string) => md.replace(/```[\s\S]*?(```|$)/g, " ").replace(/`[^`\n]*`/g, " ");

/** `$x^2$` or `$$…$$` outside code. A lone "$5" does not count. */
export function hasMath(md: string): boolean {
  if (!md.includes("$")) return false;
  return /\$\$[\s\S]+?\$\$|\$[^\s$](?:[^$\n]*[^\s$])?\$/.test(prose(md));
}

/** A fenced ```mermaid block. */
export const hasDiagram = (md: string) => /```mermaid\b/.test(md);

export interface MathPlugins {
  remark: NonNullable<Options["remarkPlugins"]>[number];
  rehype: NonNullable<Options["rehypePlugins"]>[number];
}

let math: Promise<MathPlugins> | null = null;

/**
 * KaTeX and its stylesheet are a few hundred kilobytes, so they load the
 * first time a note actually contains math.
 */
export function loadMath(): Promise<MathPlugins> {
  math ??= Promise.all([
    import("remark-math"),
    import("rehype-katex"),
    import("katex/dist/katex.min.css"),
  ])
    .then(([remark, rehype]) => ({ remark: remark.default, rehype: rehype.default }))
    .catch((error) => {
      math = null;
      throw error;
    });
  return math;
}
