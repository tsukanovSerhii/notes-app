import { expect, test } from "@playwright/test";
import { hashBytes, type Attachment } from "@/features/attachments/attachments";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import { openAttachment, remoteId, sealAttachment } from "@/features/sync/client/attachmentCrypto";
import { createAttachmentSync } from "@/features/sync/client/attachmentSync";
import { deriveSyncKeys } from "@/features/sync/client/crypto";
import {
  getAttachmentChunk,
  manageAttachments,
  putAttachmentChunk,
} from "@/features/sync/server/attachmentHandler";
import { createMemoryAttachmentRepository } from "@/features/sync/server/attachmentRepositories";
import { CHUNK_BYTES } from "@/features/sync/shared/attachments";

const KEY = "sync-key-0123456789abcdef";
const OTHER_KEY = "another-key-0123456789abcd";
const hashKey = (token: string) => `${token}`.padEnd(64, "0").slice(0, 64);

async function file(text: string | Uint8Array, name = "f.bin", type = "application/octet-stream"): Promise<Attachment> {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return {
    id: await hashBytes(bytes.slice().buffer as ArrayBuffer),
    blob: new Blob([bytes as BlobPart], { type }),
    type,
    name,
    size: bytes.length,
    createdAt: 1,
  };
}

/** A fetch that talks to the real handlers over a shared repository. */
function server(quotaBytes = 50 * 1024 * 1024) {
  const repo = createMemoryAttachmentRepository();
  const deps = { repo, hashKey, quotaBytes };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://x");
    const auth = new Headers(init?.headers).get("authorization");
    const method = init?.method ?? "GET";
    const parts = url.pathname.replace(/^\/api\/sync\/attachments\/?/, "").split("/").filter(Boolean);
    const out =
      parts.length === 0
        ? await manageAttachments(deps, JSON.parse(String(init?.body)))
        : method === "PUT"
          ? await putAttachmentChunk(deps, auth, parts[0], parts[1], url.searchParams.get("parts"), init?.body as Uint8Array)
          : await getAttachmentChunk(deps, auth, parts[0], parts[1]);
    return new Response((out.bytes as BodyInit) ?? JSON.stringify(out.json), { status: out.status, headers: out.headers });
  };
  return { repo, fetchFn };
}

async function device(fetchFn: typeof fetch, refs: Set<string>, key = KEY) {
  const store = createMemoryAttachmentStore();
  const keys = await deriveSyncKeys(key);
  const sync = createAttachmentSync({ store, referenced: () => refs, fetch: fetchFn });
  return { store, keys, sync };
}

test("a file survives sealing, and only the right key and id open it", async () => {
  const keys = await deriveSyncKeys(KEY);
  const a = await file("secret picture", "cat.png", "image/png");
  const chunks = await sealAttachment(keys, a);
  expect(new TextDecoder().decode(chunks[0])).not.toContain("secret");

  const opened = await openAttachment(keys, a.id, chunks, 5);
  expect(opened.name).toBe("cat.png");
  expect(opened.type).toBe("image/png");
  expect(await opened.blob.text()).toBe("secret picture");

  await expect(openAttachment(await deriveSyncKeys(OTHER_KEY), a.id, chunks, 5)).rejects.toBeTruthy();
  await expect(openAttachment(keys, "0".repeat(64), chunks, 5)).rejects.toBeTruthy();
  const flipped = chunks.map((c) => c.slice());
  flipped[0][20] ^= 1;
  await expect(openAttachment(keys, a.id, flipped, 5)).rejects.toBeTruthy();
});

test("the remote id does not reveal the content id and differs per key", async () => {
  const a = await deriveSyncKeys(KEY);
  const b = await deriveSyncKeys(OTHER_KEY);
  const id = "ab".repeat(32);
  const rid = await remoteId(a, id);
  expect(rid).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(rid).not.toContain(id.slice(0, 8));
  expect(await remoteId(b, id)).not.toBe(rid);
});

test("a large file is chunked, bound to its position, and chunks cannot be swapped", async () => {
  const keys = await deriveSyncKeys(KEY);
  const big = new Uint8Array(CHUNK_BYTES * 2 + 500).map((_, i) => i % 251);
  const a = await file(big);
  const chunks = await sealAttachment(keys, a);
  expect(chunks).toHaveLength(3);
  expect(chunks[0].length).toBe(CHUNK_BYTES + 28);
  expect(new Uint8Array(await (await openAttachment(keys, a.id, chunks, 1)).blob.arrayBuffer())).toEqual(big);
  await expect(openAttachment(keys, a.id, [chunks[1], chunks[0], chunks[2]], 1)).rejects.toBeTruthy();
  await expect(openAttachment(keys, a.id, chunks.slice(0, 2), 1)).rejects.toBeTruthy();
});

test("a picture added on one device arrives on another through the server", async () => {
  const { fetchFn, repo } = server();
  const a = await file(new Uint8Array(CHUNK_BYTES + 10).fill(9), "wide.png", "image/png");
  const refs = new Set([a.id]);
  const one = await device(fetchFn, refs);
  const two = await device(fetchFn, refs);
  await one.store.put(a);

  expect(await one.sync.run(one.keys)).toEqual({ pending: 0, error: null });
  expect([...repo.spaces.values()][0].size).toBe(2); // two chunks

  expect(await two.sync.run(two.keys)).toEqual({ pending: 0, error: null });
  const got = await two.store.get(a.id);
  expect(got?.name).toBe("wide.png");
  expect(got?.type).toBe("image/png");
  expect(got?.size).toBe(CHUNK_BYTES + 10);
});

test("files already on the server are not uploaded again", async () => {
  const { fetchFn } = server();
  let puts = 0;
  const counting: typeof fetch = (input, init) => {
    if (init?.method === "PUT") puts++;
    return fetchFn(input, init);
  };
  const a = await file("same");
  const refs = new Set([a.id]);
  const one = await device(counting, refs);
  const two = await device(counting, refs);
  await one.store.put(a);
  await two.store.put(a);
  await one.sync.run(one.keys);
  await two.sync.run(two.keys);
  expect(puts).toBe(1);
  // A second pass on the same device asks the server nothing more.
  await one.sync.run(one.keys);
  expect(puts).toBe(1);
});

test("a file the server does not have yet stays pending, and is fetched once it appears", async () => {
  const { fetchFn } = server();
  const a = await file("late");
  let t = 0;
  const refs = new Set([a.id]);
  const keys = await deriveSyncKeys(KEY);
  const store = createMemoryAttachmentStore();
  const sync = createAttachmentSync({ store, referenced: () => refs, fetch: fetchFn, now: () => t });

  expect(await sync.run(keys)).toEqual({ pending: 1, error: null });
  const uploader = await device(fetchFn, refs);
  await uploader.store.put(a);
  await uploader.sync.run(uploader.keys);

  // Asked again only after the retry delay.
  expect((await sync.run(keys)).pending).toBe(1);
  t += 11_000;
  expect(await sync.run(keys)).toEqual({ pending: 0, error: null });
  expect(await store.get(a.id)).not.toBeNull();
});

test("a tampered file is rejected and never stored", async () => {
  const { fetchFn, repo } = server();
  const a = await file("original");
  const refs = new Set([a.id]);
  const one = await device(fetchFn, refs);
  await one.store.put(a);
  await one.sync.run(one.keys);

  const chunks = [...repo.spaces.values()][0];
  for (const c of chunks.values()) c.bytes[c.bytes.length - 1] ^= 1;

  const two = await device(fetchFn, refs);
  const result = await two.sync.run(two.keys);
  expect(result.error).toMatch(/could not be opened/);
  expect(await two.store.get(a.id)).toBeNull();
});

test("a full space reports it and keeps the file locally", async () => {
  const { fetchFn } = server(100);
  const a = await file(new Uint8Array(500).fill(1));
  const one = await device(fetchFn, new Set([a.id]));
  await one.store.put(a);
  const result = await one.sync.run(one.keys);
  expect(result.error).toMatch(/storage .* is full/);
  expect(result.pending).toBe(1);
  expect(await one.store.get(a.id)).not.toBeNull();
});

test("a server outage is reported without throwing", async () => {
  const a = await file("x");
  const down: typeof fetch = async () => {
    throw new TypeError("offline");
  };
  const one = await device(down, new Set([a.id]));
  await one.store.put(a);
  const result = await one.sync.run(one.keys);
  expect(result.error).toBe("offline");
  expect(result.pending).toBe(1);
});

test("pruning runs at most once a day and asks the server to keep what is referenced or saved", async () => {
  const { fetchFn } = server();
  const bodies: Record<string, unknown>[] = [];
  const spy: typeof fetch = (input, init) => {
    if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
    return fetchFn(input, init);
  };
  const store = createMemoryAttachmentStore();
  const keys = await deriveSyncKeys(KEY);
  const saved = "5".repeat(64);
  let t = 1_000_000;
  const memory = new Map<string, string>();
  const sync = createAttachmentSync({
    store,
    referenced: () => new Set(),
    keepOnServer: async () => new Set([saved]),
    fetch: spy,
    now: () => t,
    storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) },
  });
  await sync.run(keys);
  const prunes = () => bodies.filter((b) => b.op === "prune");
  expect(prunes()).toHaveLength(1);
  expect(prunes()[0].keep).toEqual([await remoteId(keys, saved)]);
  await sync.run(keys);
  expect(prunes()).toHaveLength(1);
  t += 25 * 60 * 60 * 1000;
  await sync.run(keys);
  expect(prunes()).toHaveLength(2);
});
