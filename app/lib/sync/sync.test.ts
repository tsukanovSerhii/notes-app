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
    expect(repo.spaces.get("space-32")?.data.notes).toHaveLength(4);
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
      s.getSnapshot().notes.map((n) => `${n.title}: ${n.content}`).sort();

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

    const expected = ["Plan (conflict copy): phone edit", "Plan: laptop edit"];
    expect(contents(laptop.store)).toEqual(expected);
    expect(contents(phone.store)).toEqual(expected);
    expect(laptop.client.getSnapshot().lastConflict?.titles).toEqual(["Plan"]);
    // Ordinary syncs afterwards do not invent more copies.
    t = 4_000;
    await phone.client.syncNow();
    await laptop.client.syncNow();
    expect(contents(phone.store)).toEqual(expected);
  });

  test("after the first full exchange only changes travel, both ways", async () => {
    let t = 1_000;
    const clock = () => t;
    const repo = createMemoryRepository();
    const bodies: { cursor: unknown; notes: string[] }[] = [];
    const replies: string[][] = [];
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
        bodies.push({ cursor: body.cursor, notes: body.data.notes.map((n: { title: string }) => n.title) });
        const result = await handleSyncRequest(repo, body, hash, clock);
        if ("data" in result.body) replies.push(result.body.data.notes.map((n) => n.title));
        return new Response(JSON.stringify(result.body), { status: result.status });
      }) as typeof fetch,
    });

    store.create({ title: "old 1" });
    store.create({ title: "old 2" });
    t = 2_000;
    await client.enable(KEY); // full: no cursor yet
    // Another device adds a note directly on the server.
    await handleSyncRequest(repo, { key: KEY, data: data({ notes: [note("x", { title: "remote" })] }) }, hash, clock);

    t = 3_000;
    store.create({ title: "new" });
    await client.syncNow();

    expect(bodies[0]).toEqual({ cursor: null, notes: expect.arrayContaining(["old 1", "old 2"]) });
    expect(bodies[1]).toEqual({ cursor: 1, notes: ["new"] });
    // The reply carries what changed after cursor 1: the remote note and our own new one.
    expect(replies[1].sort()).toEqual(["new", "remote"]);
    expect(store.getSnapshot().notes.map((n) => n.title).sort()).toEqual(["new", "old 1", "old 2", "remote"]);
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
    await settle();
    expect(calls).toBe(2);
    expect(client.getSnapshot()).toMatchObject({ state: "idle", retryAt: null });
  });
});
