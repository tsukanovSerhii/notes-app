import { expect, test } from "@playwright/test";
import {
  convertNotionLinks,
  frontmatterTags,
  inlineTags,
  normalizeObsidianLinks,
  parseVault,
  splitFrontmatter,
} from "@/features/transfer/importVault";

test("splitFrontmatter separates the YAML block", () => {
  expect(splitFrontmatter("---\ntags: a\n---\nBody")).toEqual({ yaml: "tags: a", body: "Body" });
  expect(splitFrontmatter("No block\n---\nnot this")).toEqual({ yaml: "", body: "No block\n---\nnot this" });
});

test("frontmatterTags reads every form Obsidian writes", () => {
  expect(frontmatterTags("tags: [alpha, beta]")).toEqual(["alpha", "beta"]);
  expect(frontmatterTags("tags: alpha, beta")).toEqual(["alpha", "beta"]);
  expect(frontmatterTags("title: x\ntags:\n  - alpha\n  - \"beta\"\nother: 1")).toEqual(["alpha", "beta"]);
  expect(frontmatterTags("title: x")).toEqual([]);
});

test("inlineTags finds #tags but not headings, code or anchors", () => {
  const md = "# Heading\n\nText #idea and (#work/todo).\n\n`#code` and\n```\n#fenced\n```\nsee page#anchor and #123";
  expect(inlineTags(md)).toEqual(["idea", "work/todo"]);
});

test("Obsidian link forms become plain wiki links", () => {
  expect(normalizeObsidianLinks("A [[Note#Section]] B [[Note^block|alias]] C ![[Embed]] D [[Plain]]")).toBe(
    "A [[Note]] B [[Note|alias]] C [[Embed]] D [[Plain]]"
  );
  expect(normalizeObsidianLinks("[[Projects/Web/Site|the site]] and [[a/b#H]]")).toBe("[[Site|the site]] and [[b]]");
});

test("Notion page links become wiki links, other links stay", () => {
  const id = "0123456789abcdef0123456789abcdef";
  expect(
    convertNotionLinks(`[Roadmap](Roadmap%20${id}.md) [the plan](Projects/Big%20Plan%20${id}.md) [web](https://a.com/x.md) ![img](a.md)`)
  ).toBe("[[Roadmap]] [[Big Plan|the plan]] [web](https://a.com/x.md) ![img](a.md)");
});

test("parses an Obsidian vault: folders, tags, links, ignored settings and attachments", () => {
  const { notes, source, skipped } = parseVault([
    { path: "Vault/Welcome.md", text: "---\ntags: [start]\n---\n# Welcome\n\nSee [[Projects/../Plan#Goals|the plan]] #hello" },
    { path: "Vault/Projects/Plan.md", text: "Goals for [[Welcome]]." },
    { path: "Vault/Projects/Web/Site.md", text: "Site #web" },
    { path: "Vault/.obsidian/app.json", text: "{}" },
    { path: "Vault/.obsidian/notes.md", text: "settings" },
    { path: "Vault/image.png", text: "binary" },
  ]);
  expect(source).toBe("obsidian");
  expect(skipped).toBe(3);
  expect(notes.map((n) => [n.title, n.folderPath.join("/")])).toEqual([
    ["Welcome", ""],
    ["Plan", "Projects"],
    ["Site", "Projects/Web"],
  ]);
  // The repeated heading is dropped; frontmatter and inline tags are merged.
  expect(notes[0].content.startsWith("See ")).toBe(true);
  expect(notes[0].tags).toEqual(["start", "hello"]);
  expect(notes[2].tags).toEqual(["web"]);
});

test("parses a Notion export: ids are stripped from titles and folders, links rewired", () => {
  const a = "11111111111111111111111111111111";
  const b = "22222222222222222222222222222222";
  const c = "33333333333333333333333333333333";
  const { notes, source } = parseVault([
    { path: `Export/Roadmap ${a}.md`, text: `# Roadmap\n\nSee [Tasks](Roadmap%20${a}/Tasks%20${b}.md)` },
    { path: `Export/Roadmap ${a}/Tasks ${b}.md`, text: "# Tasks\n\nBack to [Roadmap](../Roadmap%20" + a + ".md)" },
    { path: `Export/Notes ${c}.md`, text: "Plain" },
  ]);
  expect(source).toBe("notion");
  expect(notes.map((n) => [n.title, n.folderPath.join("/")])).toEqual([
    ["Roadmap", ""],
    ["Tasks", "Roadmap"],
    ["Notes", ""],
  ]);
  expect(notes[0].content).toBe("See [[Tasks]]");
  expect(notes[1].content).toBe("Back to [[Roadmap]]");
});

test("duplicate titles in one folder are numbered", () => {
  const { notes } = parseVault([
    { path: "V/a/Same.md", text: "1" },
    { path: "V/a/Same.markdown", text: "2" },
    { path: "V/b/Same.md", text: "3" },
  ]);
  expect(notes.map((n) => n.title)).toEqual(["Same", "Same (2)", "Same"]);
});
