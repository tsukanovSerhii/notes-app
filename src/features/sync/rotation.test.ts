import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createMemoryRepository, handleSyncRequest } from "@/features/sync/server/handler";
import { createSyncClient, SYNC_KEY_STORAGE } from "@/features/sync/client/syncClient";
import { deriveSyncKeys, openData } from "@/features/sync/client/crypto";
import { SYNC_KEY_PATTERN } from "@/features/sync/shared/protocol";
import { createNotesStore } from "@/features/notes/state/store";
import { createMemoryPersistence } from "@/features/notes/persistence/persistence";
import { FakeTimers } from "@/features/notes/testing";

const OLD_KEY = "old-key-0123456789abcdef";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function device(repo = createMemoryRepository(), options: { failNewSpace?: () => boolean } = {}) {
  const store = createNotesStore({
    getPersistence: () => createMemoryPersistence({ data: { notes: [], folders: [], tombstones: {} }, activeId: null }),
    timers: new FakeTimers(),
  });
  await store.start();
  const storage = new Map<string, string>();
  const requests: Record<string, unknown>[] = [];
  const purged: string[] = [];
  const client = createSyncClient({
    store,
    timers: new FakeTimers(),
    isOnline: () => true,
    keyStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
      removeItem: (k) => void storage.delete(k),
    },
    attachments: {
      run: async () => ({ pending: 0, error: null }),
      reset: () => undefined,
      purge: async (keys) => void purged.push(keys.spaceToken),
    },
    fetch: (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      if (options.failNewSpace?.() && body.key !== undefined && body.data && body.since === null && body.cursor === null && requests.length > 1) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      const result = await handleSyncRequest(repo, body, hash);
      return new Response(JSON.stringify(result.body), { status: result.status });
    }) as typeof fetch,
  });
  return { store, client, storage, repo, requests, purged };
}

const titles = (d: { store: { getSnapshot(): { notes: { title: string }[] } } }) =>
  d.store.getSnapshot().notes.map((n) => n.title).sort();

test("rotating moves the library to a new key and retires the old space", async () => {
  const a = await device();
  a.store.create({ title: "Kept" });
  await a.client.enable(OLD_KEY);
  const oldKeys = await deriveSyncKeys(OLD_KEY);

  const newKey = await a.client.rotateKey();
  expect(newKey).toMatch(SYNC_KEY_PATTERN);
  expect(newKey).not.toBe(OLD_KEY);
  expect(a.storage.get(SYNC_KEY_STORAGE)).toBe(newKey);
  expect(a.client.getSnapshot()).toMatchObject({ key: newKey, state: "idle" });

  // The old space is empty and retired; the new one holds the notes, sealed with the new key.
  expect(a.repo.spaces.get(hash(oldKeys.spaceToken))).toMatchObject({ revokedAt: expect.any(Number) });
  expect(a.repo.spaces.get(hash(oldKeys.spaceToken))?.data.notes).toEqual([]);
  const newKeys = await deriveSyncKeys(newKey);
  const stored = a.repo.spaces.get(hash(newKeys.spaceToken))!;
  expect(stored.data.notes).toHaveLength(1);
  expect((await openData(newKeys, stored.data)).data.notes[0].title).toBe("Kept");
  // The old key cannot open what is stored now.
  expect((await openData(oldKeys, stored.data)).rejected).toBe(1);
  // The old space's files were removed.
  expect(a.purged).toEqual([oldKeys.spaceToken]);
});

test("another device is cut off, keeps its notes, and rejoins with the new key", async () => {
  const a = await device();
  const b = await device(a.repo);
  a.store.create({ title: "Shared" });
  await a.client.enable(OLD_KEY);
  await b.client.enable(OLD_KEY);
  expect(titles(b)).toEqual(["Shared"]);

  const newKey = await a.client.rotateKey();
  await b.client.syncNow();
  expect(b.client.getSnapshot().state).toBe("revoked");
  expect(titles(b)).toEqual(["Shared"]);

  // Edits on the cut-off device go nowhere: no more requests are made.
  const before = b.requests.length;
  b.store.create({ title: "Written after being cut off" });
  b.client.scheduleSync();
  await b.client.syncNow();
  expect(b.requests.length).toBe(before);

  // Given the new key it syncs again, and its newer note arrives.
  expect(await b.client.enable(newKey)).toBe(true);
  expect(b.client.getSnapshot().state).toBe("idle");
  await a.client.syncNow();
  expect(titles(a)).toEqual(["Shared", "Written after being cut off"]);
});

test("a failed upload to the new space changes nothing", async () => {
  let failing = false;
  const a = await device(createMemoryRepository(), { failNewSpace: () => failing });
  a.store.create({ title: "Safe" });
  await a.client.enable(OLD_KEY);
  failing = true;
  await expect(a.client.rotateKey()).rejects.toThrow("boom");
  failing = false;

  expect(a.storage.get(SYNC_KEY_STORAGE)).toBe(OLD_KEY);
  expect(a.client.getSnapshot().key).toBe(OLD_KEY);
  expect(a.purged).toEqual([]);
  const oldKeys = await deriveSyncKeys(OLD_KEY);
  expect(a.repo.spaces.get(hash(oldKeys.spaceToken))?.revokedAt).toBeNull();
  // The old key still works.
  await a.client.syncNow();
  expect(a.client.getSnapshot().state).toBe("idle");
});

test("rotating needs sync to be on and working", async () => {
  const a = await device();
  await expect(a.client.rotateKey()).rejects.toThrow("Sync is off");
});

test("a device that joins a retired key is told so and does not recreate it", async () => {
  const a = await device();
  a.store.create({ title: "x" });
  await a.client.enable(OLD_KEY);
  await a.client.rotateKey();

  const late = await device(a.repo);
  late.store.create({ title: "Late" });
  await late.client.enable(OLD_KEY);
  expect(late.client.getSnapshot().state).toBe("revoked");
  const oldKeys = await deriveSyncKeys(OLD_KEY);
  expect(a.repo.spaces.get(hash(oldKeys.spaceToken))?.data.notes).toEqual([]);
});
