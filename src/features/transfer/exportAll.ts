import { ATTACHMENT_ID, attachmentRefs, readBytes } from "@/features/attachments/attachments";
import type { AttachmentStore } from "@/features/attachments/attachmentStore";
import type { Folder, Note } from "@/features/notes/model/types";
import { createZip, type ZipEntry } from "@/features/transfer/zip";

/** A name that is valid on Windows, macOS and Linux. */
export function safeName(name: string, fallback = "Untitled"): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 100)
    .trim();
  if (clean === "") return fallback;
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) ? `${fallback}_${clean}` : clean;
}

/** The folder names from the top down; a missing parent or a cycle just ends the path. */
function folderNames(folders: readonly Folder[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (
    let at = id ? byId.get(id) : undefined;
    at && !seen.has(at.id);
    at = at.parentId ? byId.get(at.parentId) : undefined
  ) {
    seen.add(at.id);
    names.unshift(safeName(at.name, "Folder"));
  }
  return names;
}

function yamlList(values: string[]): string {
  return `[${values.map((v) => (/^[\w-]+$/.test(v) ? v : JSON.stringify(v))).join(", ")}]`;
}

export interface PlannedFile {
  path: string;
  text: string;
  modified: number;
  /** How many folders deep the file is: a link to the archive root needs that many `../`. */
  depth: number;
}

/**
 * The Markdown files of an archive: one per live note, in folders that mirror
 * the library, named after the note (a repeated name gets " (2)"). Tags go
 * into front matter, the form the folder import reads back.
 */
export function planExport(notes: readonly Note[], folders: readonly Folder[]): PlannedFile[] {
  const used = new Set<string>();
  const live = notes.filter((n) => n.trashedAt === null).sort((a, b) => a.createdAt - b.createdAt);
  return live.map((note) => {
    const dir = folderNames(folders, note.folderId);
    const base = safeName(note.title);
    let name = base;
    for (let i = 2; used.has([...dir, `${name}.md`].join("/").toLowerCase()); i++) name = `${base} (${i})`;
    const path = [...dir, `${name}.md`].join("/");
    used.add(path.toLowerCase());

    const meta: string[] = [];
    const title = note.title.trim();
    if (title && name !== title) meta.push(`title: ${JSON.stringify(title)}`);
    if (note.tags.length) meta.push(`tags: ${yamlList(note.tags)}`);
    const front = meta.length ? `---\n${meta.join("\n")}\n---\n\n` : "";
    const body = note.content.endsWith("\n") ? note.content : `${note.content}\n`;
    return { path, text: front + body, modified: note.updatedAt, depth: dir.length };
  });
}

/**
 * The whole library as a ZIP: notes in folders, plus the pictures and files
 * they use under attachments/, with links rewritten to point there.
 */
export async function buildArchive(
  notes: readonly Note[],
  folders: readonly Folder[],
  store: AttachmentStore
): Promise<{ zip: Uint8Array; notes: number }> {
  const planned = planExport(notes, folders);
  const encoder = new TextEncoder();

  const wanted = new Set(planned.flatMap((p) => attachmentRefs(p.text)));
  const fileName = new Map<string, string>();
  const entries: ZipEntry[] = [];
  const taken = new Set<string>();
  for (const id of wanted) {
    const file = ATTACHMENT_ID.test(id) ? await store.get(id) : null;
    if (!file) continue;
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot) : "";
    let name = `${safeName(dot > 0 ? file.name.slice(0, dot) : file.name, "file")}${ext}`;
    if (taken.has(name.toLowerCase())) name = `${id.slice(0, 8)}-${name}`;
    taken.add(name.toLowerCase());
    fileName.set(id, name);
    entries.push({
      path: `attachments/${name}`,
      data: new Uint8Array(await readBytes(file.blob)),
      modified: new Date(file.createdAt),
    });
  }

  for (const p of planned) {
    const text = p.text.replace(/attachment:([a-f0-9]{64})(?![a-f0-9])/g, (whole, id: string) => {
      const name = fileName.get(id);
      return name ? `${"../".repeat(p.depth)}attachments/${encodeURIComponent(name)}` : whole;
    });
    entries.push({ path: p.path, data: encoder.encode(text), modified: new Date(p.modified) });
  }
  return { zip: createZip(entries), notes: planned.length };
}
