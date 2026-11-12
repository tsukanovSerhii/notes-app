import { expect, test } from "@playwright/test";
import {
  getAttachmentChunk,
  manageAttachments,
  putAttachmentChunk,
} from "@/features/sync/server/attachmentHandler";
import { createMemoryAttachmentRepository } from "@/features/sync/server/attachmentRepositories";
import { createRateLimiter } from "@/features/sync/server/rateLimit";
import { MAX_CHUNK_BYTES, MAX_PARTS, PRUNE_GRACE_MS } from "@/features/sync/shared/attachments";

const TOKEN = "t".repeat(43);
const RID = "r".repeat(43);
const auth = `Bearer ${TOKEN}`;
const hashKey = (token: string) => (token === TOKEN ? "a".repeat(64) : "b".repeat(64));
const chunk = (n = 100) => new Uint8Array(n).fill(3);

function setup(options: { quotaBytes?: number; now?: () => number } = {}) {
  let clock = options.now ?? (() => 1_000_000_000_000);
  const repo = createMemoryAttachmentRepository(() => clock());
  const deps = { repo, hashKey, quotaBytes: options.quotaBytes ?? 10_000, now: () => clock() };
  return { repo, deps, setClock: (fn: () => number) => void (clock = fn) };
}

test("a chunk is stored and read back with the file's part count", async () => {
  const { deps } = setup();
  expect((await putAttachmentChunk(deps, auth, RID, "0", "2", chunk())).status).toBe(200);
  const got = await getAttachmentChunk(deps, auth, RID, "0");
  expect(got.status).toBe(200);
  expect(got.headers?.["X-Parts"]).toBe("2");
  expect(got.bytes?.byteLength).toBe(100);
  expect((await getAttachmentChunk(deps, auth, RID, "1")).status).toBe(404);
});

test("requests without a valid space token are refused", async () => {
  const { deps } = setup();
  expect((await putAttachmentChunk(deps, null, RID, "0", "1", chunk())).status).toBe(401);
  expect((await putAttachmentChunk(deps, "Bearer short", RID, "0", "1", chunk())).status).toBe(401);
  expect((await getAttachmentChunk(deps, "Basic abc", RID, "0")).status).toBe(401);
  expect((await manageAttachments(deps, { op: "have", ids: [] })).status).toBe(401);
});

test("malformed chunks are rejected before storage", async () => {
  const { deps, repo } = setup();
  const put = (rid: string, i: string, parts: string | null, body = chunk()) =>
    putAttachmentChunk(deps, auth, rid, i, parts, body);
  expect((await put("../x", "0", "1")).status).toBe(400);
  expect((await put(RID, "x", "1")).status).toBe(400);
  expect((await put(RID, "0", null)).status).toBe(400);
  expect((await put(RID, "0", "0")).status).toBe(400);
  expect((await put(RID, "2", "2")).status).toBe(400);
  expect((await put(RID, "0", String(MAX_PARTS + 1))).status).toBe(400);
  expect((await put(RID, "0", "1", new Uint8Array(0))).status).toBe(413);
  expect((await put(RID, "0", "1", new Uint8Array(MAX_CHUNK_BYTES + 1))).status).toBe(413);
  expect(repo.spaces.size).toBe(0);
});

test("a space past its quota gets 413 and nothing is stored", async () => {
  const { deps } = setup({ quotaBytes: 150 });
  expect((await putAttachmentChunk(deps, auth, RID, "0", "1", chunk(100))).status).toBe(200);
  const over = await putAttachmentChunk(deps, auth, "q".repeat(43), "0", "1", chunk(100));
  expect(over.status).toBe(413);
  expect(over.json?.error).toMatch(/attachment storage/);
});

test("have lists only complete files, and rejects bad ids", async () => {
  const { deps } = setup();
  await putAttachmentChunk(deps, auth, RID, "0", "2", chunk());
  const other = "o".repeat(43);
  await putAttachmentChunk(deps, auth, other, "0", "1", chunk());
  const reply = await manageAttachments(deps, { key: TOKEN, op: "have", ids: [RID, other] });
  expect(reply.json).toEqual({ have: [other] });
  expect((await manageAttachments(deps, { key: TOKEN, op: "have", ids: ["bad id"] })).status).toBe(400);
  expect((await manageAttachments(deps, { key: TOKEN, op: "have", ids: new Array(201).fill(RID) })).status).toBe(400);
  expect((await manageAttachments(deps, { key: TOKEN, op: "nope" })).status).toBe(400);
});

test("prune removes unreferenced files only after the grace period", async () => {
  let t = 1_000_000_000_000;
  const { deps, setClock } = setup({ now: () => t });
  setClock(() => t);
  const keep = "k".repeat(43);
  await putAttachmentChunk(deps, auth, RID, "0", "1", chunk());
  await putAttachmentChunk(deps, auth, keep, "0", "1", chunk());

  // Too young: nothing is removed.
  t += PRUNE_GRACE_MS - 1000;
  expect((await manageAttachments(deps, { key: TOKEN, op: "prune", keep: [keep] })).json).toEqual({ removed: 0 });
  // Past the grace period only the unreferenced file goes.
  t += 2000;
  expect((await manageAttachments(deps, { key: TOKEN, op: "prune", keep: [keep] })).json).toEqual({ removed: 1 });
  expect((await getAttachmentChunk(deps, auth, RID, "0")).status).toBe(404);
  expect((await getAttachmentChunk(deps, auth, keep, "0")).status).toBe(200);
});

test("a space's files are invisible to another space's token", async () => {
  const { deps } = setup();
  await putAttachmentChunk(deps, auth, RID, "0", "1", chunk());
  const intruder = `Bearer ${"x".repeat(43)}`;
  expect((await getAttachmentChunk(deps, intruder, RID, "0")).status).toBe(404);
});

test("the per-space limit answers 429 with a retry time", async () => {
  const { deps } = setup();
  const limited = { ...deps, limitSpace: createRateLimiter({ perMinute: 2 }) };
  await getAttachmentChunk(limited, auth, RID, "0");
  await getAttachmentChunk(limited, auth, RID, "0");
  const third = await getAttachmentChunk(limited, auth, RID, "0");
  expect(third.status).toBe(429);
  expect(third.retryAfterSec).toBeGreaterThan(0);
});
