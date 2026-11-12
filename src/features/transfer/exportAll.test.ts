import { expect, test } from "@playwright/test";
import zlib from "node:zlib";
import { hashBytes } from "@/features/attachments/attachments";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import { buildArchive, planExport, safeName } from "@/features/transfer/exportAll";
import { createZip, crc32 } from "@/features/transfer/zip";
import { folder, note } from "@/features/notes/testing";

/** Reads a ZIP back through its central directory. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files: { path: string; data: Uint8Array; crc: number }[] = [];
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const path = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.push({ path, data: zip.slice(start, start + size), crc });
    at += 46 + nameLength;
  }
  return files;
}

test("the checksum matches the one from zlib", () => {
  const data = new TextEncoder().encode("The quick brown fox jumps over the lazy dog");
  expect(crc32(data)).toBe(0x414fa339);
  expect(crc32(data)).toBe(zlib.crc32(data));
  expect(crc32(new Uint8Array(0))).toBe(0);
});

test("a ZIP holds every file with its name and bytes, and checksums that verify", () => {
  const zip = createZip([
    { path: "a.md", data: new TextEncoder().encode("hello"), modified: new Date(2024, 4, 6, 7, 8, 10) },
    { path: "Папка/нотатка.md", data: new Uint8Array([0, 1, 2, 255]), modified: new Date(2024, 4, 6) },
    { path: "empty.md", data: new Uint8Array(0), modified: new Date() },
  ]);
  const files = readZip(zip);
  expect(files.map((f) => f.path)).toEqual(["a.md", "Папка/нотатка.md", "empty.md"]);
  expect(new TextDecoder().decode(files[0].data)).toBe("hello");
  expect([...files[1].data]).toEqual([0, 1, 2, 255]);
  for (const f of files) expect(f.crc).toBe(zlib.crc32(f.data));
});

test("file names are safe on every system", () => {
  expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  expect(safeName("  ..hidden. ")).toBe("hidden");
  expect(safeName("")).toBe("Untitled");
  expect(safeName("CON")).toBe("Untitled_CON");
  expect(safeName("x".repeat(300))).toHaveLength(100);
});

test("notes are laid out in their folders; names are unique, tags go to front matter", () => {
  const folders = [folder("w", { name: "Work" }), { ...folder("p", { name: "Plans" }), parentId: "w" }];
  const files = planExport(
    [
      note("1", { title: "Idea", content: "text", folderId: "p", tags: ["a", "two words"], createdAt: 1 }),
      note("2", { title: "Idea", content: "other\n", folderId: "p", createdAt: 2 }),
      note("3", { title: "idea", content: "top", folderId: null, createdAt: 3 }),
      note("4", { title: "a/b", content: "x", createdAt: 4 }),
      note("5", { title: "Gone", content: "x", trashedAt: 9, createdAt: 5 }),
    ],
    folders
  );
  expect(files.map((f) => f.path)).toEqual(["Work/Plans/Idea.md", "Work/Plans/Idea (2).md", "idea.md", "a-b.md"]);
  expect(files[0].text).toBe('---\ntags: [a, "two words"]\n---\n\ntext\n');
  // The file name differs from the title, so the real title is kept in front matter.
  expect(files[1].text).toBe('---\ntitle: "Idea"\n---\n\nother\n');
  expect(files[3].text).toBe('---\ntitle: "a/b"\n---\n\nx\n');
  expect(files[0].depth).toBe(2);
});

test("a folder cycle or missing parent does not break the export", () => {
  const folders = [
    { ...folder("a", { name: "A" }), parentId: "b" },
    { ...folder("b", { name: "B" }), parentId: "a" },
    { ...folder("c", { name: "C" }), parentId: "gone" },
  ];
  const files = planExport([note("1", { folderId: "a" }), note("2", { folderId: "c" })], folders);
  expect(files.map((f) => f.path.split("/").length)).toEqual([3, 2]);
});

test("the archive carries the pictures notes use, with links that resolve from the note folder", async () => {
  const store = createMemoryAttachmentStore();
  const bytes = new TextEncoder().encode("pixels");
  const id = await hashBytes(bytes.slice().buffer as ArrayBuffer);
  await store.put({ id, blob: new Blob([bytes]), type: "image/png", name: "my pic.png", size: 6, createdAt: 1 });
  const lost = "9".repeat(64);

  const { zip, notes } = await buildArchive(
    [
      note("1", { title: "Top", content: `![a](attachment:${id})` }),
      note("2", { title: "Deep", content: `![a](attachment:${id}) ![b](attachment:${lost})`, folderId: "f" }),
    ],
    [folder("f", { name: "Folder" })],
    store
  );
  expect(notes).toBe(2);
  const files = Object.fromEntries(readZip(zip).map((f) => [f.path, f.data]));
  expect(Object.keys(files).sort()).toEqual(["Folder/Deep.md", "Top.md", "attachments/my pic.png"]);
  expect(new TextDecoder().decode(files["attachments/my pic.png"])).toBe("pixels");
  expect(new TextDecoder().decode(files["Top.md"])).toBe("![a](attachments/my%20pic.png)\n");
  expect(new TextDecoder().decode(files["Folder/Deep.md"])).toBe(
    `![a](../attachments/my%20pic.png) ![b](attachment:${lost})\n`
  );
});
