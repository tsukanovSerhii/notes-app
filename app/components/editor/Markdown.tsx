import { memo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];

const components: Components = {
  a: ({ href, title, children }) => {
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
  },
};

/** One Markdown pipeline for the live preview and the PDF export. */
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}

export default memo(Markdown);
