import { expect, test } from "@playwright/test";
import { createMemoryRepository, handleSyncRequest } from "@/features/sync/server/handler";
import { createSyncClient, SYNC_KEY_STORAGE } from "@/features/sync/client/syncClient";
import { generateSyncKey, PROTOCOL_VERSION, SYNC_KEY_PATTERN } from "@/features/sync/shared/protocol";
import { deriveSyncKeys, sealData } from "@/features/sync/client/crypto";
import { createRateLimiter } from "@/features/sync/server/rateLimit";
import { createNotesStore } from "@/features/notes/state/store";
import { createMemoryPersistence } from "@/features/notes/persistence/persistence";
import { FakeTimers, note, sealedNote, settle } from "@/features/notes/testing";
import type { SealedData } from "@/features/sync/shared/wire";
import type { NotesData } from "@/features/notes/model/types";

const KEY = "k".repeat(32);
const hash = (key: string) => `space-${key.length}`;
const data = (d: Partial<NotesData>): NotesData => ({ notes: [], folders: [], tombstones: {}, ...d });
const sealed = (d: Partial<SealedData>): SealedData => ({ notes: [], folders: [], tombstones: {}, ...d });
const v = PROTOCOL_VERSION;
/** The space the client-side tests' key lands in: hash() of its 43-char token. */
const CLIENT_SPACE = "space-43";

test.describe("sync server", () => {
  test("rejects malformed requests", async () => {
    const repo = createMemoryRepository();
    expect((await handleSyncRequest(repo, null, hash)).status).toBe(400);
    expect((await handleSyncRequest(repo, { v, key: "short", data: {} }, hash)).status).toBe(400);
  });

  test("turns away earlier, unencrypted clients instead of mixing their data in", async () => {
    const repo = createMemoryRepository();
    const res = await handleSyncRequest(repo, { key: KEY, data: data({ notes: [note("a")] }) }, hash);
    expect(res.status).toBe(426);
    expect(repo.spaces.size).toBe(0);
  });

  test("erases the plaintext space an upgrading device names", async () => {
    const repo = createMemoryRepository();
    const legacy = "f".repeat(64);
    await repo.put(legacy, { version: 1, data: sealed({}), changes: {}, horizon: 0 }, null);
    await handleSyncRequest(repo, { v, key: KEY, data: sealed({}), forgetLegacy: legacy }, hash);
    expect(repo.spaces.has(legacy)).toBe(false);
    expect(repo.spaces.has("space-32")).toBe(true);
  });

  test("merges every device's replica and files it under the key hash", async () => {
    const repo = createMemoryRepository();
    await handleSyncRequest(repo, { v, key: KEY, data: sealed({ notes: [sealedNote("a")] }) }, hash);
    const second = await handleSyncRequest(
      repo,
      { v, key: KEY, data: sealed({ notes: [sealedNote("b")] }) },
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
        handleSyncRequest(repo, { v, key: KEY, data: sealed({ notes: [sealedNote(id)] }) }, hash)
      )
    );
    expect(repo.spaces.get("space-32")?.data.notes).toHaveLength(4);
  });

  test("a rate-limited space is refused before any storage work", async () => {
    const repo = createMemoryRepository();
    const limiter = createRateLimiter({ perMinute: 1, now: () => 0 });
    const body = { v, key: KEY, data: sealed({ notes: [sealedNote("a")] }) };
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

  test("the server only ever holds ciphertext, and never the key", async () => {
    const d = await device();
    d.store.create({ title: "Secret title", content: "secret text", tags: ["private"] });
    d.store.createFolder("Hidden folder");
    await d.client.enable(KEY);
    const stored = JSON.stringify([...d.repo.spaces.values()]);
    for (const secret of ["Secret title", "secret text", "private", "Hidden folder", KEY]) {
      expect(stored).not.toContain(secret);
    }
    expect([...d.repo.spaces.keys()]).toEqual([CLIENT_SPACE]);
  });

  test("entities sealed with another key are skipped and reported", async () => {
    const owner = await device();
    owner.store.create({ title: "Mine" });
    await owner.client.enable(KEY);
    // Data under the same space token but sealed with a different key.
    const wrong = await deriveSyncKeys("w".repeat(32));
    const right = await deriveSyncKeys(KEY);
    const forged = await sealData(wrong, data({ notes: [note("x", { title: "Forged" })] }));
    await handleSyncRequest(owner.repo, { v, key: right.spaceToken, data: forged }, hash);
    await owner.client.syncNow();
    expect(owner.store.getSnapshot().notes.map((n) => n.title)).toEqual(["Mine"]);
    expect(owner.client.getSnapshot()).toMatchObject({
      state: "error",
      error: expect.stringContaining("could not be decrypted"),
    });
  });

  test("asks once to erase the plaintext space of earlier builds", async () => {
    const forgets: unknown[] = [];
    const d = await device();
    const client = createSyncClient({
      store: d.store,
      keyStorage: {
        getItem: (k) => d.storage.get(k) ?? null,
        setItem: (k, val) => void d.storage.set(k, val),
        removeItem: (k) => void d.storage.delete(k),
      },
      isOnline: () => true,
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        forgets.push(body.forgetLegacy);
        const result = await handleSyncRequest(d.repo, body, hash);
        return new Response(JSON.stringify(result.body), { status: result.status });
      }) as typeof fetch,
    });
    await client.enable(KEY); // joining with an existing key
    await client.syncNow();
    expect(forgets[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(forgets[1]).toBeUndefined();
  });

  test("a local edit schedules a debounced sync", async () => {
    const d = await device();
    await d.client.enable(KEY);
    const before = d.requests();
    d.store.create();
    d.store.create();
    expect(d.requests()).toBe(before);
    d.timers.advance(1500);
    await expect.poll(() => d.requests()).toBe(before + 1);
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

  test("concurrent edits on two devices keep both texts", async () => {
    let t = 1_000;
    const clock = () => t;
    const repo = createMemoryRepository();
    const make = async (deviceId: string) => {
      const store = createNotesStore({
        getPersistence: () => createMemoryPersistence({ data: data({}), activeId: null }),
        timers: new FakeTimers(),
        now: clock,
        deviceId,
      });
      await store.start();
      const client = createSyncClient({
        store,
        keyStorage: null,
        isOnline: () => true,
        timers: new FakeTimers(),
        now: clock,
        deviceId,
        fetch: (async (_url: string, init: RequestInit) => {
          const result = await handleSyncRequest(repo, JSON.parse(String(init.body)), hash, clock);
          return new Response(JSON.stringify(result.body), { status: result.status });
        }) as typeof fetch,
      });
      return { store, client };
    };
    const contents = (s: Awaited<ReturnType<typeof make>>["store"]) =>
      s.getSnapshot().notes.map((n) => `${n.title}${n.conflictOf ? " [copy]" : ""}: ${n.content}`).sort();

    const phone = await make("phone-device");
    const laptop = await make("laptop-device");
    const plan = phone.store.create({ title: "Plan", content: "draft" });
    await phone.client.enable(KEY);
    t = 1_100;
    await laptop.client.enable(KEY);

    // Both edit the same note before either syncs.
    t = 2_000;
    phone.store.update(plan.id, { content: "phone edit" });
    t = 2_100;
    laptop.store.update(plan.id, { content: "laptop edit" });

    t = 3_000;
    await phone.client.syncNow(); // server: phone edit
    t = 3_100;
    await laptop.client.syncNow(); // laptop edit wins; phone text kept as a copy
    t = 3_200;
    await phone.client.syncNow();
    t = 3_300;
    await laptop.client.syncNow();

    const expected = ["Plan [copy]: phone edit", "Plan: laptop edit"];
    expect(contents(laptop.store)).toEqual(expected);
    expect(contents(phone.store)).toEqual(expected);
    expect(laptop.client.getSnapshot().lastConflict?.titles).toEqual(["Plan"]);
    // Ordinary syncs afterwards (deltas that send the copy back) do not invent more copies.
    for (const at of [4_000, 4_100, 4_200, 4_300]) {
      t = at;
      phone.store.create({ title: `filler ${at}` });
      await phone.client.syncNow();
      await laptop.client.syncNow();
    }
    const copies = (s: typeof phone.store) => s.getSnapshot().notes.filter((n) => n.conflictOf).length;
    expect(copies(phone.store)).toBe(1);
    expect(copies(laptop.store)).toBe(1);
  });

  test("after the first full exchange only changes travel, both ways", async () => {
    let t = 1_000;
    const clock = () => t;
    const repo = createMemoryRepository();
    const bodies: { cursor: unknown; notes: string[] }[] = [];
    const replies: string[][] = [];
    const titleOf = (id: string) => store.getSnapshot().notes.find((n) => n.id === id)?.title ?? id;
    const store = createNotesStore({
      getPersistence: () => createMemoryPersistence({ data: data({}), activeId: null }),
      timers: new FakeTimers(),
      now: clock,
    });
    await store.start();
    const client = createSyncClient({
      store,
      keyStorage: null,
      isOnline: () => true,
      timers: new FakeTimers(),
      now: clock,
      fetch: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push({ cursor: body.cursor, notes: body.data.notes.map((n: { id: string }) => n.id) });
        const result = await handleSyncRequest(repo, body, hash, clock);
        if ("data" in result.body) replies.push(result.body.data.notes.map((n) => n.id));
        return new Response(JSON.stringify(result.body), { status: result.status });
      }) as typeof fetch,
    });

    store.create({ title: "old 1" });
    store.create({ title: "old 2" });
    t = 2_000;
    await client.enable(KEY); // full: no cursor yet
    // Another device adds a note directly on the server.
    const keys = await deriveSyncKeys(KEY);
    const remote = await sealData(keys, data({ notes: [note("x", { title: "remote" })] }));
    await handleSyncRequest(repo, { v, key: keys.spaceToken, data: remote }, hash, clock);

    t = 3_000;
    store.create({ title: "new" });
    await client.syncNow();

    expect(bodies[0].cursor).toBeNull();
    expect(bodies[0].notes.map(titleOf).sort()).toEqual(["old 1", "old 2"]);
    expect(bodies[1].cursor).toBe(1);
    expect(bodies[1].notes.map(titleOf)).toEqual(["new"]);
    // The reply carries what changed after cursor 1: the remote note and our own new one.
    expect(replies[1].map(titleOf).sort()).toEqual(["new", "remote"]);
    expect(store.getSnapshot().notes.map((n) => n.title).sort()).toEqual(["new", "old 1", "old 2", "remote"]);
  });

  test("moving a note into an existing folder survives a delta sync", async () => {
    let t = 1_000;
    const clock = () => t;
    const repo = createMemoryRepository();
    const make = async () => {
      const store = createNotesStore({
        getPersistence: () => createMemoryPersistence({ data: data({}), activeId: null }),
        timers: new FakeTimers(),
        now: clock,
      });
      await store.start();
      const client = createSyncClient({
        store,
        keyStorage: null,
        isOnline: () => true,
        timers: new FakeTimers(),
        now: clock,
        fetch: (async (_url: string, init: RequestInit) => {
          const result = await handleSyncRequest(repo, JSON.parse(String(init.body)), hash, clock);
          return new Response(JSON.stringify(result.body), { status: result.status });
        }) as typeof fetch,
      });
      return { store, client };
    };
    const a = await make();
    const b = await make();
    const work = a.store.createFolder("Work")!;
    const n = a.store.create({ title: "Report" });
    await a.client.enable(KEY);
    t = 1_100;
    await b.client.enable(KEY);

    // Only the note changes; the folder is not part of either delta.
    t = 2_000;
    a.store.update(n.id, { folderId: work.id });
    await a.client.syncNow();
    t = 2_100;
    await b.client.syncNow();

    const folderOf = (s: typeof a.store) => s.getSnapshot().notes.find((x) => x.id === n.id)?.folderId;
    expect(repo.spaces.get(CLIENT_SPACE)?.data.notes.find((x) => x.id === n.id)?.folderId).toBe(work.id);
    expect(folderOf(a.store)).toBe(work.id);
    expect(folderOf(b.store)).toBe(work.id);
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
    expect(client.getSnapshot().retryAt).toBeGreaterThan(Date.now() + 6000);

    timers.advance(6999);
    await settle();
    expect(calls).toBe(1);
    timers.advance(1);
    await expect.poll(() => calls).toBe(2);
    await expect.poll(() => client.getSnapshot().state).toBe("idle");
    expect(client.getSnapshot().retryAt).toBeNull();
  });
});
