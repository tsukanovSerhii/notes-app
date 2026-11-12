import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresShareRepository } from "@/features/sharing/server/postgresShareRepository";
import { createFileShareRepository, createMemoryShareRepository } from "@/features/sharing/server/shareRepositories";
import {
  createShare,
  deleteShare,
  readShare,
  type ShareDeps,
  type ShareRepository,
} from "@/features/sharing/server/shareHandler";
import { createRateLimiter } from "@/features/sync/server/rateLimit";
import { DAY_MS, MAX_SHARE_BYTES } from "@/features/sharing/shared/share";

const ID = "a".repeat(22);
const TOKEN = "t".repeat(32);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const request = (over: Record<string, unknown> = {}) => ({
  id: ID,
  blob: "c2VhbGVk",
  deleteHash: sha256(TOKEN),
  ttlDays: 7,
  ...over,
});

function deps(repo: ShareRepository, extra: Partial<ShareDeps> = {}): ShareDeps {
  return { repo, sha256, now: () => 1_000_000, ...extra };
}

/** What every share repository must do. */
function contract(name: string, make: () => Promise<{ repo: ShareRepository; done: () => Promise<void> }>) {
  test.describe(name, () => {
    const share = { id: ID, blob: "abc", deleteHash: "h", createdAt: 100, expiresAt: 500 };

    test("stores a share once and reads it back", async () => {
      const { repo, done } = await make();
      expect(await repo.create(share)).toBe(true);
      expect(await repo.create({ ...share, blob: "other" })).toBe(false);
      expect(await repo.get(ID, 200)).toEqual(share);
      await done();
    });

    test("an expired share is gone", async () => {
      const { repo, done } = await make();
      await repo.create(share);
      expect(await repo.get(ID, 500)).toBeNull();
      expect(await repo.get(ID, 100)).toBeNull();
      // The id is free again once the old share has expired and been removed.
      expect(await repo.create({ ...share, expiresAt: 900 })).toBe(true);
      await done();
    });

    test("deleting removes it, and deleting again is fine", async () => {
      const { repo, done } = await make();
      await repo.create(share);
      await repo.delete(ID);
      expect(await repo.get(ID, 200)).toBeNull();
      await repo.delete(ID);
      await done();
    });
  });
}

contract("memory share repository", async () => ({ repo: createMemoryShareRepository(), done: async () => {} }));
contract("file share repository", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "shares-"));
  return { repo: createFileShareRepository(dir), done: () => rm(dir, { recursive: true, force: true }) };
});
contract("Postgres share repository", async () => {
  const db = new PGlite();
  return { repo: createPostgresShareRepository(db), done: () => db.close() };
});

test("a share is created, read and revoked with its token", async () => {
  const d = deps(createMemoryShareRepository());
  const created = await createShare(d, "ip", request());
  expect(created.status).toBe(201);
  expect(created.json.expiresAt).toBe(1_000_000 + 7 * DAY_MS);

  const read = await readShare(d, "ip", ID);
  expect(read.status).toBe(200);
  expect(read.json).toEqual({ blob: "c2VhbGVk", expiresAt: 1_000_000 + 7 * DAY_MS });

  expect((await deleteShare(d, ID, "Bearer wrong".padEnd(32, "x"))).status).toBe(404);
  expect((await readShare(d, "ip", ID)).status).toBe(200);
  expect((await deleteShare(d, ID, `Bearer ${TOKEN}`)).status).toBe(200);
  expect((await readShare(d, "ip", ID)).status).toBe(404);
});

test("a link stops working when it expires", async () => {
  let now = 1_000_000;
  const d = deps(createMemoryShareRepository(), { now: () => now });
  await createShare(d, "ip", request({ ttlDays: 1 }));
  now += DAY_MS - 1;
  expect((await readShare(d, "ip", ID)).status).toBe(200);
  now += 2;
  expect((await readShare(d, "ip", ID)).status).toBe(404);
});

test("bad requests are refused before anything is stored", async () => {
  const repo = createMemoryShareRepository();
  const d = deps(repo);
  const status = async (over: Record<string, unknown>) => (await createShare(d, "ip", request(over))).status;
  expect(await status({ id: "short" })).toBe(400);
  expect(await status({ blob: "has spaces!" })).toBe(400);
  expect(await status({ blob: "" })).toBe(400);
  expect(await status({ deleteHash: "nothex" })).toBe(400);
  expect(await status({ ttlDays: 365 })).toBe(400);
  expect(await status({ blob: "a".repeat(Math.ceil((MAX_SHARE_BYTES * 4) / 3) + 1) })).toBe(413);
  expect((await createShare(d, "ip", null)).status).toBe(400);
  expect(repo.shares.size).toBe(0);
});

test("an id cannot be taken over by a second request", async () => {
  const d = deps(createMemoryShareRepository());
  expect((await createShare(d, "ip", request())).status).toBe(201);
  expect((await createShare(d, "ip", request({ blob: "b3RoZXI" }))).status).toBe(409);
  expect((await readShare(d, "ip", ID)).json.blob).toBe("c2VhbGVk");
});

test("a missing link and a wrong token look the same to the caller", async () => {
  const d = deps(createMemoryShareRepository());
  await createShare(d, "ip", request());
  const wrong = await deleteShare(d, ID, `Bearer ${"w".repeat(32)}`);
  const missing = await deleteShare(d, "b".repeat(22), `Bearer ${TOKEN}`);
  expect(wrong).toEqual(missing);
  expect((await deleteShare(d, ID, null)).status).toBe(404);
});

test("creating and reading are rate limited per caller", async () => {
  const d = deps(createMemoryShareRepository(), {
    limitCreate: createRateLimiter({ perMinute: 1 }),
    limitRead: createRateLimiter({ perMinute: 1 }),
  });
  expect((await createShare(d, "ip", request())).status).toBe(201);
  const limited = await createShare(d, "ip", request({ id: "b".repeat(22) }));
  expect(limited.status).toBe(429);
  expect(limited.retryAfterSec).toBeGreaterThan(0);
  expect((await createShare(d, "other", request({ id: "c".repeat(22) }))).status).toBe(201);

  expect((await readShare(d, "ip", ID)).status).toBe(200);
  expect((await readShare(d, "ip", ID)).status).toBe(429);
});
