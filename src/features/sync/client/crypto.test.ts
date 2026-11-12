import { expect, test } from "@playwright/test";
import {
  deriveSyncKeys,
  openData,
  openNote,
  sealData,
  sealNote,
  textHash,
} from "@/features/sync/client/crypto";
import { conflictCopy } from "@/features/sync/server/conflicts";
import { folder, note } from "@/features/notes/testing";

const KEY = "k".repeat(32);

test("derives a stable space token that reveals nothing of the key", async () => {
  const a = await deriveSyncKeys(KEY);
  const b = await deriveSyncKeys(KEY);
  const other = await deriveSyncKeys("x".repeat(32));
  expect(a.spaceToken).toBe(b.spaceToken);
  expect(a.spaceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a.spaceToken).not.toContain(KEY);
  expect(other.spaceToken).not.toBe(a.spaceToken);
});

test("seals text, tags and folder names, and opens them again", async () => {
  const keys = await deriveSyncKeys(KEY);
  const n = note("a", { title: "Plan", content: "secret", tags: ["work"], folderId: "f", editedBy: "dev" });
  const sealed = await sealData(keys, { notes: [n], folders: [folder("f", { name: "Hidden", parentId: "parent-folder" })], tombstones: { x: 1 } });
  const raw = JSON.stringify(sealed);
  for (const secret of ["Plan", "secret", "work", "Hidden", "parent-folder"]) expect(raw).not.toContain(secret);
  // What the server needs stays readable.
  expect(sealed.notes[0]).toMatchObject({ id: "a", folderId: "f", editedBy: "dev", conflictOf: null });
  expect(sealed.tombstones).toEqual({ x: 1 });

  const opened = await openData(keys, sealed);
  expect(opened).toEqual({ data: { notes: [n], folders: [folder("f", { name: "Hidden", parentId: "parent-folder" })], tombstones: { x: 1 } }, rejected: 0 });
});

test("each seal uses a fresh IV", async () => {
  const keys = await deriveSyncKeys(KEY);
  const n = note("a", { content: "same" });
  expect((await sealNote(keys, n)).sealed).not.toBe((await sealNote(keys, n)).sealed);
});

test("rejects blobs sealed with another key, tampered with, or moved to another note", async () => {
  const keys = await deriveSyncKeys(KEY);
  const wrong = await deriveSyncKeys("w".repeat(32));
  const a = await sealNote(keys, note("a", { content: "a's text" }));

  await expect(openNote(wrong, a)).rejects.toThrow();
  const flipped = a.sealed.slice(0, -2) + (a.sealed.endsWith("AA") ? "BB" : "AA");
  await expect(openNote(keys, { ...a, sealed: flipped })).rejects.toThrow();
  // The server cannot pass a's text off as note b.
  await expect(openNote(keys, { ...a, id: "b" })).rejects.toThrow();

  const { data, rejected } = await openData(keys, { notes: [a, { ...a, id: "b" }], folders: [], tombstones: {} });
  expect(data.notes.map((n) => n.id)).toEqual(["a"]);
  expect(rejected).toBe(1);
});

test("a server-made conflict copy opens, and resealing it keeps its text hash", async () => {
  const keys = await deriveSyncKeys(KEY);
  const original = await sealNote(keys, note("a", { title: "Plan", content: "mine", editedAt: 7 }));
  const sealedCopy = conflictCopy(original, 99);
  const copy = await openNote(keys, sealedCopy);
  expect(copy).toMatchObject({ id: "a~conflict-7", title: "Plan", content: "mine", conflictOf: "a" });

  // Sending the copy back must not look like changed text to the server.
  const resealed = await sealNote(keys, copy);
  expect(resealed).toMatchObject({ id: copy.id, conflictOf: "a", textHash: sealedCopy.textHash });
  expect(await openNote(keys, resealed)).toEqual(copy);
});

test("textHash is equal exactly when title and text are", async () => {
  const keys = await deriveSyncKeys(KEY);
  const other = await deriveSyncKeys("x".repeat(32));
  const h = await textHash(keys, "T", "body");
  expect(await textHash(keys, "T", "body")).toBe(h);
  expect(await textHash(keys, "T", "body!")).not.toBe(h);
  expect(await textHash(keys, "Tb", "ody")).not.toBe(h);
  // Keyed: without the sync key the hash of a guessed text cannot be checked.
  expect(await textHash(other, "T", "body")).not.toBe(h);
});
