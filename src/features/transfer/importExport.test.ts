import { expect, test } from "@playwright/test";
import {
  ImportError,
  backupFileName,
  createBackup,
  isMarkdownFile,
  noteFromMarkdown,
  parseBackup,
} from "@/features/transfer/importExport";
import { folder, note } from "@/features/notes/testing";

test("noteFromMarkdown takes the title from the first heading", () => {
  const n = noteFromMarkdown("ignored.md", "﻿intro\r\n# Real title ##\r\nbody", "id", 5);
  expect(n).toMatchObject({ id: "id", title: "Real title", createdAt: 5, folderId: null });
  expect(n.content).toBe("intro\n# Real title ##\nbody");
});

test("noteFromMarkdown falls back to the file name", () => {
  expect(noteFromMarkdown("Shopping list.markdown", "milk", "id", 1).title).toBe("Shopping list");
});

test("backup round-trip keeps notes and folders but not tombstones", () => {
  const data = {
    notes: [note("a", { folderId: "f", tags: ["x"] })],
    folders: [folder("f", { name: "Work" })],
    tombstones: { old: 1 },
  };
  const backup = createBackup(data, new Date("2026-01-02T10:00:00Z"));
  expect(backup).toMatchObject({ app: "notevoid", exportedAt: "2026-01-02T10:00:00.000Z" });
  expect(parseBackup(JSON.stringify(backup))).toEqual({ ...data, tombstones: {} });
});

test("parseBackup rejects files that are not NoteVoid backups", () => {
  expect(() => parseBackup("not json")).toThrow(ImportError);
  expect(() => parseBackup(JSON.stringify({ notes: [] }))).toThrow("not a NoteVoid backup");
});

test("backupFileName and isMarkdownFile", () => {
  expect(backupFileName(new Date(2026, 4, 9))).toBe("notevoid-backup-2026-05-09.json");
  expect(isMarkdownFile({ name: "a.MD", type: "" })).toBe(true);
  expect(isMarkdownFile({ name: "a.png", type: "image/png" })).toBe(false);
});
