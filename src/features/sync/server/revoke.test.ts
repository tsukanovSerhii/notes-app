import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  getAttachmentChunk,
  manageAttachments,
  putAttachmentChunk,
} from "@/features/sync/server/attachmentHandler";
import { createMemoryAttachmentRepository } from "@/features/sync/server/attachmentRepositories";
import { createMemoryRepository, handleSyncRequest } from "@/features/sync/server/handler";
import { PROTOCOL_VERSION as v } from "@/features/sync/shared/protocol";
import { sealedNote } from "@/features/sync/testing";

const KEY = "o".repeat(43);
const NEW_KEY = "n".repeat(43);
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const data = (ids: string[]) => ({ notes: ids.map((id) => sealedNote(id)), folders: [], tombstones: {} });

test("a revoked space erases its data and answers 410 to every later request", async () => {
  const repo = createMemoryRepository();
  await handleSyncRequest(repo, { v, key: KEY, data: data(["a", "b"]) }, hash);

  const revoked = await handleSyncRequest(repo, { v, key: KEY, revoke: true }, hash);
  expect(revoked.status).toBe(200);
  expect(revoked.body).toMatchObject({ revoked: true, data: { notes: [] } });
  expect(repo.spaces.get(hash(KEY))?.data.notes).toEqual([]);
  expect(repo.spaces.get(hash(KEY))?.revokedAt).not.toBeNull();

  // Neither reading nor writing works any more, whatever the cursor says.
  const read = await handleSyncRequest(repo, { v, key: KEY, data: data([]), cursor: 0 }, hash);
  expect(read.status).toBe(410);
  expect(read.body).toMatchObject({ revoked: true });
  const write = await handleSyncRequest(repo, { v, key: KEY, data: data(["c"]) }, hash);
  expect(write.status).toBe(410);
  expect(repo.spaces.get(hash(KEY))?.data.notes).toEqual([]);
});

test("revoking is repeatable and also retires a space that never held anything", async () => {
  const repo = createMemoryRepository();
  expect((await handleSyncRequest(repo, { v, key: KEY, revoke: true }, hash)).status).toBe(200);
  expect((await handleSyncRequest(repo, { v, key: KEY, revoke: true }, hash)).status).toBe(200);
  // A key that was retired before it was ever used cannot be started afterwards.
  expect((await handleSyncRequest(repo, { v, key: KEY, data: data(["a"]) }, hash)).status).toBe(410);
});

test("the new space is untouched by retiring the old one", async () => {
  const repo = createMemoryRepository();
  await handleSyncRequest(repo, { v, key: KEY, data: data(["a"]) }, hash);
  await handleSyncRequest(repo, { v, key: NEW_KEY, data: data(["a"]), since: null }, hash);
  await handleSyncRequest(repo, { v, key: KEY, revoke: true }, hash);

  const fresh = await handleSyncRequest(repo, { v, key: NEW_KEY, data: data([]), cursor: null }, hash);
  expect(fresh.status).toBe(200);
  expect((fresh.body as { data: { notes: unknown[] } }).data.notes).toHaveLength(1);
});

test("revoking needs a valid key and the current protocol", async () => {
  const repo = createMemoryRepository();
  expect((await handleSyncRequest(repo, { v, key: "short", revoke: true }, hash)).status).toBe(400);
  expect((await handleSyncRequest(repo, { key: KEY, revoke: true }, hash)).status).toBe(426);
  expect(repo.spaces.size).toBe(0);
});

test("a retired space keeps no attachments and takes no more, but can be purged", async () => {
  const repo = createAttachmentDeps();
  const auth = `Bearer ${KEY}`;
  const rid = "r".repeat(43);
  const chunk = new Uint8Array(10).fill(1);
  expect((await putAttachmentChunk(repo.deps, auth, rid, "0", "1", chunk)).status).toBe(200);

  repo.retire();
  expect((await putAttachmentChunk(repo.deps, auth, rid, "0", "1", chunk)).status).toBe(410);
  expect((await getAttachmentChunk(repo.deps, auth, rid, "0")).status).toBe(410);
  expect((await manageAttachments(repo.deps, { key: KEY, op: "have", ids: [rid] })).status).toBe(410);
  expect((await manageAttachments(repo.deps, { key: KEY, op: "prune", keep: [] })).status).toBe(410);

  // Purging works on a retired space: that is how its files are removed.
  expect((await manageAttachments(repo.deps, { key: KEY, op: "purge" })).status).toBe(200);
  expect(repo.repo.spaces.size).toBe(0);
});

test("purging removes every file of one space and no other", async () => {
  const { deps, repo } = createAttachmentDeps();
  const rid = "r".repeat(43);
  await putAttachmentChunk(deps, `Bearer ${KEY}`, rid, "0", "1", new Uint8Array(5));
  await putAttachmentChunk(deps, `Bearer ${NEW_KEY}`, rid, "0", "1", new Uint8Array(5));
  await manageAttachments(deps, { key: KEY, op: "purge" });
  expect(repo.spaces.has(hash(KEY))).toBe(false);
  expect((await getAttachmentChunk(deps, `Bearer ${NEW_KEY}`, rid, "0")).status).toBe(200);
});

function createAttachmentDeps() {
  const repo = createMemoryAttachmentRepository();
  let retired = false;
  return {
    repo,
    deps: { repo, hashKey: hash, quotaBytes: 1_000_000, isRevoked: async () => retired },
    retire: () => void (retired = true),
  };
}
