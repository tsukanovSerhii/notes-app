import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  deleteRecovery,
  getRecovery,
  putRecovery,
  type RecoveryDeps,
  type RecoveryRepository,
} from "@/features/recovery/server/recoveryHandler";
import {
  createFileRecoveryRepository,
  createMemoryRecoveryRepository,
  createPostgresRecoveryRepository,
} from "@/features/recovery/server/recoveryRepositories";
import {
  RECOVERY_CODE_BYTES,
  formatRecoveryCode,
  parseRecoveryCode,
} from "@/features/recovery/shared/recovery";
import { createRateLimiter } from "@/features/sync/server/rateLimit";

const ID = "ab".repeat(32);

function contract(name: string, make: () => Promise<{ repo: RecoveryRepository; done: () => Promise<void> }>) {
  test.describe(name, () => {
    test("stores, replaces, reads and deletes a blob", async () => {
      const { repo, done } = await make();
      expect(await repo.get(ID)).toBeNull();
      await repo.put(ID, "first", 1);
      expect(await repo.get(ID)).toBe("first");
      await repo.put(ID, "second", 2);
      expect(await repo.get(ID)).toBe("second");
      expect(await repo.get("cd".repeat(32))).toBeNull();
      await repo.delete(ID);
      expect(await repo.get(ID)).toBeNull();
      await repo.delete(ID);
      await done();
    });
  });
}

contract("memory recovery repository", async () => ({ repo: createMemoryRecoveryRepository(), done: async () => {} }));
contract("file recovery repository", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "recovery-"));
  return { repo: createFileRecoveryRepository(dir), done: () => rm(dir, { recursive: true, force: true }) };
});
contract("Postgres recovery repository", async () => {
  const db = new PGlite();
  return { repo: createPostgresRecoveryRepository(db), done: () => db.close() };
});

const deps = (extra: Partial<RecoveryDeps> = {}): RecoveryDeps => ({ repo: createMemoryRecoveryRepository(), ...extra });

test("a blob is stored under its id and read back; unknown and malformed ids look alike", async () => {
  const d = deps();
  expect((await putRecovery(d, "ip", ID, { blob: "c2VhbGVk" })).status).toBe(200);
  expect((await getRecovery(d, "ip", ID)).json).toEqual({ blob: "c2VhbGVk" });
  const unknown = await getRecovery(d, "ip", "cd".repeat(32));
  const malformed = await getRecovery(d, "ip", "not-an-id");
  expect(unknown).toEqual(malformed);
  expect(unknown.status).toBe(404);
  expect((await deleteRecovery(d, "ip", ID)).status).toBe(200);
  expect((await getRecovery(d, "ip", ID)).status).toBe(404);
});

test("bad ids and payloads are refused", async () => {
  const d = deps();
  expect((await putRecovery(d, "ip", "short", { blob: "abc" })).status).toBe(400);
  expect((await putRecovery(d, "ip", ID, { blob: "has space" })).status).toBe(400);
  expect((await putRecovery(d, "ip", ID, { blob: "a".repeat(1025) })).status).toBe(400);
  expect((await putRecovery(d, "ip", ID, { blob: 5 })).status).toBe(400);
  expect((await putRecovery(d, "ip", ID, null)).status).toBe(400);
  expect((await deleteRecovery(d, "ip", "short")).status).toBe(400);
});

test("reads and writes are rate limited per caller", async () => {
  const d = deps({ limitWrite: createRateLimiter({ perMinute: 1 }), limitRead: createRateLimiter({ perMinute: 1 }) });
  expect((await putRecovery(d, "ip", ID, { blob: "abc" })).status).toBe(200);
  const slow = await putRecovery(d, "ip", ID, { blob: "abc" });
  expect(slow.status).toBe(429);
  expect(slow.retryAfterSec).toBeGreaterThan(0);
  expect((await getRecovery(d, "ip", ID)).status).toBe(200);
  expect((await getRecovery(d, "ip", ID)).status).toBe(429);
  expect((await getRecovery(d, "other", ID)).status).toBe(200);
});

test("a recovery code round-trips, ignores case and separators, and rejects typos", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
  const code = formatRecoveryCode(bytes);
  expect(code).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  expect(parseRecoveryCode(code)).toEqual(bytes);
  expect(parseRecoveryCode(code.toLowerCase().replace(/-/g, " "))).toEqual(bytes);
  expect(parseRecoveryCode(code.slice(0, -1))).toBeNull();
  expect(parseRecoveryCode(code + "A")).toBeNull();
  expect(parseRecoveryCode(code.replace(/[A-Z]/, "1"))).toBeNull();
  expect(parseRecoveryCode("")).toBeNull();
});

test("codes are distinct and cover all 160 bits", () => {
  const codes = new Set(Array.from({ length: 50 }, () => formatRecoveryCode(crypto.getRandomValues(new Uint8Array(20)))));
  expect(codes.size).toBe(50);
  expect(parseRecoveryCode(formatRecoveryCode(new Uint8Array(20).fill(255)))).toEqual(new Uint8Array(20).fill(255));
  expect(parseRecoveryCode(formatRecoveryCode(new Uint8Array(20)))).toEqual(new Uint8Array(20));
});
