import { expect, test } from "@playwright/test";
import { hashBytes } from "@/features/attachments/attachments";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import {
  collectBackupAttachments,
  parseBackupAttachments,
  restoreBackupAttachments,
} from "@/features/transfer/backupAttachments";
import { createBackup, parseBackup } from "@/features/transfer/importExport";
import { note } from "@/features/notes/testing";

async function stored(text: string, name: string, type: string) {
  const store = createMemoryAttachmentStore();
  const bytes = new TextEncoder().encode(text);
  const id = await hashBytes(bytes.slice().buffer as ArrayBuffer);
  await store.put({ id, blob: new Blob([bytes], { type }), type, name, size: bytes.length, createdAt: 1 });
  return { store, id };
}

test("a backup carries the files its notes refer to and nothing else", async () => {
  const { store, id } = await stored("pixels", "a.png", "image/png");
  const other = "e".repeat(64);
  await store.put({ id: other, blob: new Blob(["x"]), type: "text/plain", name: "unused.txt", size: 1, createdAt: 1 });

  const notes = [note("n1", { content: `![a](attachment:${id})` })];
  const files = await collectBackupAttachments(notes, store);
  expect(files.map((f) => f.id)).toEqual([id]);

  const backup = createBackup({ notes, folders: [], tombstones: {} }, new Date(0), files);
  expect(backup.attachments).toHaveLength(1);
  expect(createBackup({ notes, folders: [], tombstones: {} }).attachments).toBeUndefined();
});

test("restoring a backup puts the files back, and the notes still parse", async () => {
  const { store, id } = await stored("pixels", "a.png", "image/png");
  const notes = [note("n1", { content: `![a](attachment:${id})` })];
  const text = JSON.stringify(
    createBackup({ notes, folders: [], tombstones: {} }, new Date(0), await collectBackupAttachments(notes, store))
  );

  expect(parseBackup(text).notes).toHaveLength(1);
  const fresh = createMemoryAttachmentStore();
  expect(await restoreBackupAttachments(parseBackupAttachments(text), fresh, 99)).toBe(1);
  const back = await fresh.get(id);
  expect(back?.name).toBe("a.png");
  expect(back?.type).toBe("image/png");
  expect(await back?.blob.text()).toBe("pixels");
  // Restoring again adds nothing new.
  expect(await restoreBackupAttachments(parseBackupAttachments(text), fresh, 100)).toBe(0);
});

test("files whose bytes do not match their id, or are malformed, are skipped", async () => {
  const id = "a".repeat(64);
  const text = JSON.stringify({
    attachments: [
      { id, type: "text/plain", name: "lie.txt", data: btoa("not what the id says") },
      { id: "short", data: "AAAA" },
      { id: "b".repeat(64), data: 5 },
      "junk",
    ],
  });
  const parsed = parseBackupAttachments(text);
  expect(parsed.map((p) => p.id)).toEqual([id]);
  const store = createMemoryAttachmentStore();
  expect(await restoreBackupAttachments(parsed, store, 1)).toBe(0);
  expect(store.files.size).toBe(0);
  expect(parseBackupAttachments("not json")).toEqual([]);
});
