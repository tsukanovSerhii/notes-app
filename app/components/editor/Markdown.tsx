import { memo, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton, HighlightedCode } from "@/app/components/editor/CodeBlock";
import { WikiLinkContext } from "@/app/components/editor/wikiLinkContext";
import { remarkWikiLinks, titleFromHref } from "@/app/lib/wikiLinks";
import { useI18n } from "@/app/lib/i18n";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkWikiLinks];

function languageOf(className: string | undefined): string | null {
  return /language-([\w+-]+)/.exec(className ?? "")?.[1] ?? null;
}

function textOf(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

/** A `[[Title]]` link: opens the note, or offers to create it. */
function WikiLink({ title, children }: { title: string; children: ReactNode }) {
  const target = useContext(WikiLinkContext);
  const { t } = useI18n();
  if (!target) return <span>{children}</span>;
  const exists = target.exists(title);
  return (
    <a
      href={`#note=${encodeURIComponent(title)}`}
      data-wiki-link={exists ? "found" : "missing"}
      title={exists ? undefined : t.links.missing(title)}
      onClick={(e) => {
        e.preventDefault();
        target.open(title);
      }}
      className={exists ? undefined : "opacity-70 decoration-dashed"}
    >
      {children}
    </a>
  );
}

const link: Components["a"] = ({ href, title, children }) => {
  const wiki = titleFromHref(href);
  if (wiki !== null) return <WikiLink title={wiki}>{children}</WikiLink>;
  const external = !!href && /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      title={title}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
};

const code: Components["code"] = ({ className, children }) => {
  const lang = languageOf(className);
  const text = textOf(children);
  if (!lang) return <code className={className}>{children}</code>;
  return <HighlightedCode code={text.replace(/\n$/, "")} lang={lang} />;
};

function makePre(withToolbar: boolean): Components["pre"] {
  return function Pre({ node, children }) {
    const codeEl = node?.children[0];
    const classes =
      codeEl && codeEl.type === "element" ? codeEl.properties?.className : undefined;
    const lang = languageOf(Array.isArray(classes) ? classes.join(" ") : undefined);
    const raw =
      codeEl && codeEl.type === "element"
        ? codeEl.children.map((c) => (c.type === "text" ? c.value : "")).join("")
        : "";

    if (!withToolbar) return <pre>{children}</pre>;
    return (
      <div className="group relative">
        <div className="absolute right-2 top-1.5 flex items-center gap-2">
          {lang && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {lang}
            </span>
          )}
          <CopyButton text={raw.replace(/\n$/, "")} />
        </div>
        <pre>{children}</pre>
      </div>
    );
  };
}

const screenComponents: Components = { a: link, code, pre: makePre(true) };
const printComponents: Components = { a: link, code, pre: makePre(false) };

/** One Markdown pipeline for the live preview and the PDF export. */
function Markdown({
  children,
  variant = "screen",
}: {
  children: string;
  variant?: "screen" | "print";
}) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={variant === "print" ? printComponents : screenComponents}
    >
      {children}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
