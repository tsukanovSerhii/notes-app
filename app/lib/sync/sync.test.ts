import { expect, test } from "@playwright/test";
import { createMemoryRepository, handleSyncRequest } from "@/app/lib/sync/server";
import { createSyncClient, SYNC_KEY_STORAGE } from "@/app/lib/sync/client";
import { generateSyncKey, SYNC_KEY_PATTERN } from "@/app/lib/sync/protocol";
import { createRateLimiter } from "@/app/lib/sync/rateLimit";
import { createNotesStore } from "@/app/lib/notes/store";
import { createMemoryPersistence } from "@/app/lib/notes/persistence";
import { FakeTimers, note, settle } from "@/app/lib/notes/testUtils";
import type { NotesData } from "@/app/types/note";

const KEY = "k".repeat(32);
const hash = (key: string) => `space-${key.length}`;
const data = (d: Partial<NotesData>): NotesData => ({ notes: [], folders: [], tombstones: {}, ...d });

test.describe("sync server", () => {
  test("rejects malformed requests", async () => {
    const repo = createMemoryRepository();
    expect((await handleSyncRequest(repo, null, hash)).status).toBe(400);
    expect((await handleSyncRequest(repo, { key: "short", data: {} }, hash)).status).toBe(400);
  });

  test("merges every device's replica and files it under the key hash", async () => {
    const repo = createMemoryRepository();
    await handleSyncRequest(repo, { key: KEY, data: data({ notes: [note("a")] }) }, hash);
    const second = await handleSyncRequest(
      repo,
      { key: KEY, data: data({ notes: [note("b")] }) },
      hash,
      () => 42
    );
    expect(second.status).toBe(200);
    if (!("data" in second.body)) throw new Error("expected data");
    expect(second.body.data.notes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(second.body.syncedAt).toBe(42);
    expect([...repo.spaces.keys()]).toEqual(["space-32"]);
  });

  test("concurrent requests for one space do not lose writes", async () => {
    const repo = createMemoryRepository();
    await Promise.all(
      ["a", "b", "c", "d"].map((id) =>
        handleSyncRequest(repo, { key: KEY, data: data({ notes: [note(id)] }) }, hash)
      )
    );
    expect(repo.spaces.get("space-32")?.notes).toHaveLength(4);
  });

  test("a rate-limited space is refused before any storage work", async () => {
    const repo = createMemoryRepository();
    const limiter = createRateLimiter({ perMinute: 1, now: () => 0 });
    const body = { key: KEY, data: data({ notes: [note("a")] }) };
    expect((await handleSyncRequest(repo, body, hash, () => 0, limiter)).status).toBe(200);
    repo.spaces.clear();
    const refused = await handleSyncRequest(repo, body, hash, () => 0, limiter);
    expect(refused).toMatchObject({ status: 429, retryAfterSec: 60 });
    expect(repo.spaces.size).toBe(0);
  });
});

test("generateSyncKey produces valid, unique keys", () => {
  const a = generateSyncKey();
  expect(a).toMatch(SYNC_KEY_PATTERN);
  expect(generateSyncKey()).not.toBe(a);
});

test.describe("sync client", () => {
  async function device(repo = createMemoryRepository()) {
    const store = createNotesStore({
      getPersistence: () => createMemoryPersistence({ data: data({}), activeId: null }),
      timers: new FakeTimers(),
    });
    await store.start();
    const storage = new Map<string, string>();
    const timers = new FakeTimers();
    let requests = 0;
    const client = createSyncClient({
      store,
      timers,
      isOnline: () => true,
      keyStorage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => void storage.set(k, v),
        removeItem: (k) => void storage.delete(k),
      },
      fetch: (async (_url: string, init: RequestInit) => {
        requests++;
        const result = await handleSyncRequest(repo, JSON.parse(String(init.body)), hash);
        return new Response(JSON.stringify(result.body), { status: result.status });
      }) as typeof fetch,
    });
    return { store, client, storage, timers, repo, requests: () => requests };
  }

  test("two devices converge through the server", async () => {
    const phone = await device();
    const laptop = await device(phone.repo);

    phone.store.create({ title: "From phone" });
    expect(await phone.client.enable(KEY)).toBe(true);
    expect(phone.storage.get(SYNC_KEY_STORAGE)).toBe(KEY);

    laptop.store.create({ title: "From laptop" });
    await laptop.client.enable(KEY);
    await phone.client.syncNow();

    const titles = (s: typeof phone.store) => s.getSnapshot().notes.map((n) => n.title).sort();
    expect(titles(phone.store)).toEqual(["From laptop", "From phone"]);
    expect(titles(laptop.store)).toEqual(["From laptop", "From phone"]);
    expect(laptop.client.getSnapshot()).toMatchObject({ state: "idle", key: KEY });
  });

  test("a local edit schedules a debounced sync", async () => {
    const d = await device();
    await d.client.enable(KEY);
    const before = d.requests();
    d.store.create();
    d.store.create();
    expect(d.requests()).toBe(before);
    d.timers.advance(1500);
    await settle();
    expect(d.requests()).toBe(before + 1);
  });

  test("rejects malformed keys and can be turned off", async () => {
    const d = await device();
    expect(await d.client.enable("bad key")).toBe(false);
    expect(d.client.getSnapshot().state).toBe("off");
    await d.client.enable(KEY);
    d.client.disable();
    expect(d.client.getSnapshot()).toMatchObject({ state: "off", key: null });
    expect(d.storage.has(SYNC_KEY_STORAGE)).toBe(false);
  });

  test("server errors surface as an error state", async () => {
    const d = await device();
    const client = createSyncClient({
      store: d.store,
      keyStorage: null,
      isOnline: () => true,
      fetch: (async () =>
        new Response(JSON.stringify({ error: "Sync storage failed." }), { status: 500 })) as typeof fetch,
    });
    await client.enable(KEY);
    expect(client.getSnapshot()).toMatchObject({ state: "error", error: "Sync storage failed." });
  });

  test("reports the server time with the round trip's local times", async () => {
    const d = await device();
    const seen: number[][] = [];
    let local = 100;
    const client = createSyncClient({
      store: d.store,
      keyStorage: null,
      isOnline: () => true,
      rawNow: () => (local += 50),
      onServerTime: (...args) => void seen.push(args),
      fetch: (async () =>
        new Response(JSON.stringify({ data: data({}), syncedAt: 9_999 }), { status: 200 })) as typeof fetch,
    });
    await client.enable(KEY);
    expect(seen).toEqual([[9_999, 150, 200]]);
  });

  test("a 429 retries after the server's Retry-After", async () => {
    const d = await device();
    const timers = new FakeTimers();
    let calls = 0;
    const client = createSyncClient({
      store: d.store,
      keyStorage: null,
      isOnline: () => true,
      timers,
      fetch: (async () => {
        calls++;
        return calls === 1
          ? new Response(JSON.stringify({ error: "Too many sync requests." }), {
              status: 429,
              headers: { "Retry-After": "7" },
            })
          : new Response(JSON.stringify({ data: data({}), syncedAt: 1 }), { status: 200 });
      }) as typeof fetch,
    });
    await client.enable(KEY);
    expect(client.getSnapshot().state).toBe("error");

    timers.advance(6999);
    await settle();
    expect(calls).toBe(1);
    timers.advance(1);
    await settle();
    expect(calls).toBe(2);
    expect(client.getSnapshot().state).toBe("idle");
  });
});
