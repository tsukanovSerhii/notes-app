import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { AttachmentRepository } from "@/features/sync/server/attachmentHandler";
import {
  createFileAttachmentRepository,
  createMemoryAttachmentRepository,
} from "@/features/sync/server/attachmentRepositories";
import { createPostgresAttachmentRepository } from "@/features/sync/server/postgresAttachmentRepository";

const SPACE = "a".repeat(64);
const OTHER = "b".repeat(64);
const F1 = "f".repeat(43);
const F2 = "g".repeat(43);
const QUOTA = 1000;
const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
const future = () => Date.now() + 60_000;

/** The contract every attachment repository must keep. */
function contract(name: string, make: () => Promise<{ repo: AttachmentRepository; done: () => Promise<void> }>) {
  test.describe(name, () => {
    test("a file exists once every part is stored, and chunks read back unchanged", async () => {
      const { repo, done } = await make();
      expect(await repo.putChunk(SPACE, F1, 0, 2, bytes(10, 1), QUOTA)).toBe("ok");
      expect(await repo.complete(SPACE, [F1])).toEqual([]);
      expect(await repo.putChunk(SPACE, F1, 1, 2, bytes(5, 2), QUOTA)).toBe("ok");
      expect(await repo.complete(SPACE, [F1, F2])).toEqual([F1]);

      const first = await repo.getChunk(SPACE, F1, 0);
      expect(first?.parts).toBe(2);
      expect([...(first?.bytes ?? [])]).toEqual([...bytes(10, 1)]);
      expect(await repo.getChunk(SPACE, F1, 5)).toBeNull();
      await done();
    });

    test("spaces cannot see each other's files", async () => {
      const { repo, done } = await make();
      await repo.putChunk(SPACE, F1, 0, 1, bytes(4), QUOTA);
      expect(await repo.complete(OTHER, [F1])).toEqual([]);
      expect(await repo.getChunk(OTHER, F1, 0)).toBeNull();
      await done();
    });

    test("storing a chunk again replaces it", async () => {
      const { repo, done } = await make();
      await repo.putChunk(SPACE, F1, 0, 1, bytes(4, 1), QUOTA);
      await repo.putChunk(SPACE, F1, 0, 1, bytes(6, 9), QUOTA);
      expect([...((await repo.getChunk(SPACE, F1, 0))?.bytes ?? [])]).toEqual([...bytes(6, 9)]);
      await done();
    });

    test("a space cannot store more than its quota, and replacing does not count twice", async () => {
      const { repo, done } = await make();
      expect(await repo.putChunk(SPACE, F1, 0, 1, bytes(600), QUOTA)).toBe("ok");
      expect(await repo.putChunk(SPACE, F2, 0, 1, bytes(500), QUOTA)).toBe("quota");
      expect(await repo.complete(SPACE, [F2])).toEqual([]);
      // Overwriting the same chunk with a similar size stays under the quota.
      expect(await repo.putChunk(SPACE, F1, 0, 1, bytes(900), QUOTA)).toBe("ok");
      // Another space has its own quota.
      expect(await repo.putChunk(OTHER, F2, 0, 1, bytes(900), QUOTA)).toBe("ok");
      await done();
    });

    test("prune keeps referenced files and files younger than the cutoff", async () => {
      const { repo, done } = await make();
      await repo.putChunk(SPACE, F1, 0, 1, bytes(4), QUOTA);
      await repo.putChunk(SPACE, F2, 0, 1, bytes(4), QUOTA);
      // Nothing is older than the cutoff: nothing goes, referenced or not.
      expect(await repo.prune(SPACE, new Set(), 0)).toBe(0);
      expect(await repo.complete(SPACE, [F1, F2])).toEqual(expect.arrayContaining([F1, F2]));
      // Everything is old: only what no note refers to goes.
      expect(await repo.prune(SPACE, new Set([F1]), future())).toBe(1);
      expect(await repo.complete(SPACE, [F1, F2])).toEqual([F1]);
      await done();
    });

    test("prune also clears old unfinished uploads", async () => {
      const { repo, done } = await make();
      await repo.putChunk(SPACE, F1, 0, 3, bytes(4), QUOTA);
      expect(await repo.prune(SPACE, new Set([F1]), future())).toBe(1);
      expect(await repo.getChunk(SPACE, F1, 0)).toBeNull();
      await done();
    });
  });
}

contract("memory attachment repository", async () => ({
  repo: createMemoryAttachmentRepository(),
  done: async () => {},
}));

contract("file attachment repository", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "attachments-"));
  return { repo: createFileAttachmentRepository(dir), done: () => rm(dir, { recursive: true, force: true }) };
});

contract("Postgres attachment repository", async () => {
  const db = new PGlite();
  return { repo: createPostgresAttachmentRepository(db), done: () => db.close() };
});
