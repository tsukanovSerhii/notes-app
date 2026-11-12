import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { hashBytes } from "@/features/attachments/attachments";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import { openShare, parseShareHash, sealShare, shareUrl } from "@/features/sharing/client/shareCrypto";
import {
  ShareError,
  buildSnapshot,
  createShareLink,
  createShareRecords,
  revokeShareLink,
} from "@/features/sharing/client/shareClient";
import { createShare, deleteShare, readShare } from "@/features/sharing/server/shareHandler";
import { createMemoryShareRepository } from "@/features/sharing/server/shareRepositories";
import { MAX_SHARE_BYTES, type SharedNote } from "@/features/sharing/shared/share";

const snapshot = (over: Partial<SharedNote> = {}): SharedNote => ({
  v: 1,
  title: "Plan",
  content: "# Plan\n\nsecret text",
  tags: ["work"],
  sharedAt: 5,
  attachments: [],
  ...over,
});

const memoryStorage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

/** A fetch wired to the real share handlers. */
function server() {
  const repo = createMemoryShareRepository();
  const deps = { repo, sha256: (t: string) => createHash("sha256").update(t).digest("hex") };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://x");
    const method = init?.method ?? "GET";
    const id = url.pathname.split("/")[3];
    const out =
      method === "POST"
        ? await createShare(deps, "ip", JSON.parse(String(init?.body)))
        : method === "DELETE"
          ? await deleteShare(deps, id, new Headers(init?.headers).get("authorization"))
          : await readShare(deps, "ip", id);
    return new Response(JSON.stringify(out.json), { status: out.status });
  };
  return { repo, fetchFn };
}

test("a sealed note opens with the right link and no other", async () => {
  const sealed = await sealShare(snapshot());
  expect(sealed.blob).not.toContain("secret");
  expect(sealed.key).toHaveLength(43);
  expect((await openShare(sealed.id, sealed.key, sealed.blob)).content).toBe("# Plan\n\nsecret text");

  const other = await sealShare(snapshot());
  await expect(openShare(sealed.id, other.key, sealed.blob)).rejects.toBeTruthy();
  // The ciphertext belongs to its id: it will not open under another link.
  await expect(openShare(other.id, sealed.key, sealed.blob)).rejects.toBeTruthy();
  const flipped = sealed.blob.slice(0, 20) + (sealed.blob[20] === "A" ? "B" : "A") + sealed.blob.slice(21);
  await expect(openShare(sealed.id, sealed.key, flipped)).rejects.toBeTruthy();
  await expect(openShare("bad", sealed.key, sealed.blob)).rejects.toThrow("Invalid link");
});

test("every link gets its own id, key and delete token", async () => {
  const a = await sealShare(snapshot());
  const b = await sealShare(snapshot());
  expect(new Set([a.id, b.id, a.key, b.key, a.deleteToken, b.deleteToken]).size).toBe(6);
  expect(a.deleteHash).toMatch(/^[a-f0-9]{64}$/);
  expect(a.deleteHash).not.toContain(a.deleteToken);
});

test("a link keeps both its id and key after the #, and parses back", () => {
  const id = "a".repeat(22);
  const key = "k".repeat(43);
  const url = shareUrl("https://notes.example", id, key);
  expect(url).toBe(`https://notes.example/share#${id}.${key}`);
  expect(parseShareHash(new URL(url).hash)).toEqual({ id, key });
  expect(parseShareHash("#nope")).toBeNull();
  expect(parseShareHash("")).toBeNull();
});

test("pictures go into the snapshot until the size limit, then are left out", async () => {
  const store = createMemoryAttachmentStore();
  const put = async (bytes: Uint8Array, name: string) => {
    const id = await hashBytes(bytes.slice().buffer as ArrayBuffer);
    await store.put({ id, blob: new Blob([bytes as BlobPart]), type: "image/png", name, size: bytes.length, createdAt: 1 });
    return id;
  };
  const small = await put(new Uint8Array(1000).fill(1), "small.png");
  const big = await put(new Uint8Array(MAX_SHARE_BYTES).fill(2), "big.png");
  const missing = "e".repeat(64);
  const { snapshot: snap, omitted } = await buildSnapshot(
    { title: "T", tags: [], content: `![a](attachment:${small}) ![b](attachment:${big}) ![c](attachment:${missing})` },
    store,
    9
  );
  expect(snap.attachments.map((a) => a.name)).toEqual(["small.png"]);
  expect(omitted).toBe(1);
});

test("creating a link stores only ciphertext and the link opens the note", async () => {
  const { repo, fetchFn } = server();
  const records = createShareRecords(memoryStorage());
  const { record } = await createShareLink({
    note: { id: "n1", title: "Plan", content: "top secret", tags: [] },
    store: createMemoryAttachmentStore(),
    ttlDays: 7,
    origin: "https://notes.example",
    fetch: fetchFn,
    records,
    now: 1000,
  });
  const stored = JSON.stringify([...repo.shares.values()]);
  expect(stored).not.toContain("top secret");
  expect(stored).not.toContain(record.deleteToken);
  const key = record.url.split("#")[1].split(".")[1];
  expect(stored).not.toContain(key);

  const got = await fetchFn(`/api/share/${record.id}`);
  const { blob } = (await got.json()) as { blob: string };
  expect((await openShare(record.id, key, blob)).content).toBe("top secret");
  expect(records.list(2000).map((r) => r.id)).toEqual([record.id]);
});

test("revoking removes the link from the server and from the list; an already gone link is fine", async () => {
  const { repo, fetchFn } = server();
  const records = createShareRecords(memoryStorage());
  const { record } = await createShareLink({
    note: { id: "n1", title: "T", content: "x", tags: [] },
    store: createMemoryAttachmentStore(),
    ttlDays: 1,
    origin: "https://x",
    fetch: fetchFn,
    records,
    now: 1,
  });
  await revokeShareLink(record, fetchFn, records);
  expect(repo.shares.size).toBe(0);
  expect(records.list(2)).toEqual([]);
  await revokeShareLink(record, fetchFn, records);
});

test("server refusals become typed errors", async () => {
  const refuse = (status: number): typeof fetch => async () => new Response("{}", { status });
  const args = {
    note: { id: "n", title: "T", content: "x", tags: [] },
    store: createMemoryAttachmentStore(),
    ttlDays: 7 as const,
    origin: "https://x",
    records: createShareRecords(null),
  };
  const code = async (status: number) =>
    createShareLink({ ...args, fetch: refuse(status) }).catch((e: ShareError) => e.code);
  expect(await code(413)).toBe("tooLarge");
  expect(await code(429)).toBe("busy");
  expect(await code(503)).toBe("disabled");
  expect(await code(500)).toBe("failed");
});

test("expired links drop out of the list", () => {
  const records = createShareRecords(memoryStorage());
  const base = { deleteToken: "t", noteId: "n", title: "T", createdAt: 1, url: "u" };
  records.add({ ...base, id: "old", expiresAt: 100 });
  records.add({ ...base, id: "new", expiresAt: 900 });
  expect(records.list(500).map((r) => r.id)).toEqual(["new"]);
  expect(createShareRecords(null).list(0)).toEqual([]);
});
