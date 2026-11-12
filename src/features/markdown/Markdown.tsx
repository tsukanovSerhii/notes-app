import { cloneElement, isValidElement, memo, useContext, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import { AttachmentImage, AttachmentLink } from "@/features/attachments/AttachmentView";
import { ATTACHMENT_SCHEME, attachmentIdFromUrl } from "@/features/attachments/attachments";
import remarkGfm from "remark-gfm";
import { HighlightedCode } from "@/features/markdown/CodeBlock";
import { CopyButton } from "@/shared/ui/CopyButton";
import { WikiLinkContext } from "@/features/markdown/wikiLinkContext";
import { remarkWikiLinks, titleFromHref } from "@/features/markdown/lib/wikiLinks";
import { useI18n } from "@/shared/i18n";
import MermaidDiagram from "@/features/markdown/MermaidDiagram";
import { hasMath, loadMath, type MathPlugins } from "@/features/markdown/lib/extras";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkWikiLinks];

/** The KaTeX plugins once a note with math has asked for them. */
function useMathPlugins(needed: boolean): MathPlugins | null {
  const [plugins, setPlugins] = useState<MathPlugins | null>(null);
  useEffect(() => {
    if (!needed || plugins) return;
    let cancelled = false;
    loadMath()
      .then((p) => !cancelled && setPlugins(p))
      .catch(() => {
        // Without KaTeX the formulas stay as written.
      });
    return () => {
      cancelled = true;
    };
  }, [needed, plugins]);
  return needed ? plugins : null;
}

function languageOf(className: string | undefined): string | null {
  return /language-([\w+-]+)/.exec(className ?? "")?.[1] ?? null;
}

function textOf(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(children)) return textOf(children.props.children);
  return "";
}

/**
 * A task-list item. The rendered checkbox has no label of its own, so it gets
 * the item's text, which is what a screen reader should announce.
 */
const listItem: Components["li"] = ({ className, children }) => {
  if (!className?.includes("task-list-item")) return <li className={className}>{children}</li>;
  const items = Array.isArray(children) ? children : [children];
  const label = textOf(items.filter((c) => !(isValidElement(c) && c.type === "input"))).trim();
  return (
    <li className={className}>
      {items.map((c, i) =>
        isValidElement<{ "aria-label"?: string }>(c) && c.type === "input"
          ? cloneElement(c, { key: i, "aria-label": label || undefined })
          : c
      )}
    </li>
  );
};

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
      // Dashed, not faded: opacity would fail the contrast requirement.
      className={exists ? undefined : "decoration-dashed"}
    >
      {children}
    </a>
  );
}

const link: Components["a"] = ({ href, title, children }) => {
  const attachment = attachmentIdFromUrl(href);
  if (attachment) return <AttachmentLink id={attachment}>{children}</AttachmentLink>;
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
    if (lang === "mermaid") return <MermaidDiagram code={raw.replace(/\n$/, "")} />;
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

/** Attachments are drawn from this device's files; other images are left to the browser. */
function makeImage(eager: boolean): Components["img"] {
  return function Image({ src, alt }) {
    const id = attachmentIdFromUrl(typeof src === "string" ? src : undefined);
    if (id) return <AttachmentImage id={id} alt={alt} eager={eager} />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading={eager ? "eager" : "lazy"} />;
  };
}

/** react-markdown drops unknown URL schemes; attachment links are ours. */
const urlTransform: Options["urlTransform"] = (url) =>
  url.startsWith(ATTACHMENT_SCHEME) ? url : defaultUrlTransform(url);

const screenComponents: Components = { a: link, code, pre: makePre(true), li: listItem, img: makeImage(false) };
const printComponents: Components = { a: link, code, pre: makePre(false), li: listItem, img: makeImage(true) };

/** One Markdown pipeline for the live preview and the PDF export. */
function Markdown({
  children,
  variant = "screen",
}: {
  children: string;
  variant?: "screen" | "print";
}) {
  const math = useMathPlugins(hasMath(children));
  return (
    <ReactMarkdown
      remarkPlugins={math ? [...remarkPlugins!, math.remark] : remarkPlugins}
      rehypePlugins={math ? [math.rehype] : undefined}
      components={variant === "print" ? printComponents : screenComponents}
      urlTransform={urlTransform}
    >
      {children}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
