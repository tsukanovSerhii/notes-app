import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createFileRepository } from "@/app/lib/sync/fileRepository";
import { createPostgresRepository } from "@/app/lib/sync/postgresRepository";
import { createMemoryRepository, handleSyncRequest, type SyncRepository } from "@/app/lib/sync/server";
import { emptySpace, type StoredSpace } from "@/app/lib/sync/space";
import { note } from "@/app/lib/notes/testUtils";

const ID = "a".repeat(64);
const KEY = "k".repeat(32);
const at = (version: number, title = `v${version}`): StoredSpace => ({
  ...emptySpace(),
  version,
  data: { notes: [note("n", { title })], folders: [], tombstones: {} },
});

/** The contract every repository must keep. */
function contract(name: string, make: () => Promise<{ repo: SyncRepository; done: () => Promise<void> }>) {
  test.describe(name, () => {
    test("stores and reads a space", async () => {
      const { repo, done } = await make();
      expect(await repo.get(ID)).toBeNull();
      expect(await repo.put(ID, at(1), null)).toBe(true);
      expect(await repo.get(ID)).toEqual(at(1));
      await done();
    });

    test("only writes over the version that was read", async () => {
      const { repo, done } = await make();
      await repo.put(ID, at(1), null);
      // Two instances read version 1 and both try to write.
      expect(await repo.put(ID, at(2, "first"), 1)).toBe(true);
      expect(await repo.put(ID, at(2, "second"), 1)).toBe(false);
      expect(await repo.put(ID, at(1), null)).toBe(false);
      expect((await repo.get(ID))?.data.notes[0].title).toBe("first");
      await done();
    });
  });
}

contract("memory repository", async () => ({ repo: createMemoryRepository(), done: async () => {} }));

contract("file repository", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "notevoid-"));
  return { repo: createFileRepository(dir), done: () => rm(dir, { recursive: true, force: true }) };
});

contract("postgres repository (PGlite)", async () => {
  const db = new PGlite();
  return { repo: createPostgresRepository(db), done: () => db.close() };
});

test("the file repository reads spaces stored by earlier builds", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "notevoid-"));
  const legacy = { notes: [note("old")], folders: [], tombstones: {} };
  await writeFile(path.join(dir, `${ID}.json`), JSON.stringify(legacy));
  const repo = createFileRepository(dir);
  expect(await repo.get(ID)).toMatchObject({ version: 0, data: legacy });
  // ...and upgrades them on the next write.
  expect(await repo.put(ID, at(1), 0)).toBe(true);
  await rm(dir, { recursive: true, force: true });
});

test("the handler retries when another instance wrote in between", async () => {
  const inner = createMemoryRepository();
  let interfere = true;
  const repo: SyncRepository = {
    get: (id) => inner.get(id),
    async put(id, space, expected) {
      if (interfere) {
        interfere = false;
        // Another server instance commits first.
        await inner.put(id, { ...emptySpace(), version: 1, data: { notes: [note("theirs")], folders: [], tombstones: {} } }, null);
      }
      return inner.put(id, space, expected);
    },
  };
  const res = await handleSyncRequest(repo, { key: KEY, data: { notes: [note("mine")] } }, () => ID);
  expect(res.status).toBe(200);
  const stored = await inner.get(ID);
  expect(stored?.data.notes.map((n) => n.id).sort()).toEqual(["mine", "theirs"]);
  expect(stored?.version).toBe(2);
});

test("the handler gives up with 503 when the space never settles", async () => {
  const repo: SyncRepository = { get: async () => null, put: async () => false };
  const res = await handleSyncRequest(repo, { key: KEY, data: {} }, () => ID);
  expect(res.status).toBe(503);
});

test("a full sync through Postgres converges two devices", async () => {
  const db = new PGlite();
  const repo = createPostgresRepository(db);
  await handleSyncRequest(repo, { key: KEY, data: { notes: [note("a")] } }, () => ID);
  const res = await handleSyncRequest(repo, { key: KEY, data: { notes: [note("b")] } }, () => ID);
  if (!("data" in res.body)) throw new Error(res.body.error);
  expect(res.body.data.notes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  expect(res.body.cursor).toBe(2);
  await db.close();
});
