import { expect, test } from "@playwright/test";
import {
  attachmentIdFromUrl,
  attachmentRefs,
  attachmentUri,
  cleanName,
  hashBytes,
  isInlineImage,
  markdownFor,
} from "@/features/attachments/attachments";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import { AttachmentTooLarge, addAttachment, collectUnused } from "@/features/attachments/ingest";

const ID = "a".repeat(64);
const OTHER = "b".repeat(64);

test("ids come from the file's bytes, so equal files share one", async () => {
  const bytes = new TextEncoder().encode("hello").buffer as ArrayBuffer;
  expect(await hashBytes(bytes)).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("attachment links are recognised and anything else is not", () => {
  expect(attachmentIdFromUrl(attachmentUri(ID))).toBe(ID);
  expect(attachmentIdFromUrl("attachment:short")).toBeNull();
  expect(attachmentIdFromUrl(`attachment:${ID}x`)).toBeNull();
  expect(attachmentIdFromUrl("https://example.com/a.png")).toBeNull();
  expect(attachmentIdFromUrl(undefined)).toBeNull();
});

test("every referenced file is found once, in links and images alike", () => {
  const text = `![a](attachment:${ID}) and [f](attachment:${OTHER}) again ![a](attachment:${ID}) attachment:${ID}0`;
  expect(attachmentRefs(text).sort()).toEqual([ID, OTHER]);
  expect(attachmentRefs("nothing here")).toEqual([]);
});

test("images are shown and other files linked", () => {
  expect(isInlineImage("image/png")).toBe(true);
  expect(isInlineImage("application/pdf")).toBe(false);
  expect(markdownFor({ id: ID, name: "cat.png", type: "image/png" })).toBe(`![cat](attachment:${ID})`);
  expect(markdownFor({ id: ID, name: "report.pdf", type: "application/pdf" })).toBe(`[report.pdf](attachment:${ID})`);
});

test("file names cannot break out of the link text", () => {
  expect(cleanName("a]b[c\\d<e>\nf.png")).toBe("a b c d e f.png");
  expect(cleanName("   ")).toBe("file");
});

test("adding the same file twice stores one copy under the first name", async () => {
  const store = createMemoryAttachmentStore();
  const first = await addAttachment(store, new File(["same bytes"], "one.txt", { type: "text/plain" }), () => 10);
  const second = await addAttachment(store, new File(["same bytes"], "two.txt", { type: "text/plain" }), () => 20);
  expect(second.id).toBe(first.id);
  expect(store.files.size).toBe(1);
  expect(second.name).toBe("one.txt");
  expect(first.size).toBe(10);
});

test("a file over the limit is refused", async () => {
  const store = createMemoryAttachmentStore();
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.bin");
  await expect(addAttachment(store, big)).rejects.toBeInstanceOf(AttachmentTooLarge);
  expect(store.files.size).toBe(0);
});

test("unused files are removed only after the grace period", async () => {
  const store = createMemoryAttachmentStore();
  const put = (id: string, createdAt: number) =>
    store.put({ id, blob: new Blob(["x"]), type: "text/plain", name: id.slice(0, 3), size: 1, createdAt });
  await put(ID, 0);
  await put(OTHER, 0);
  await put("c".repeat(64), 900);

  const removed = await collectUnused(store, new Set([ID]), 1000, 500);
  expect(removed).toBe(1);
  expect([...store.files.keys()].sort()).toEqual([ID, "c".repeat(64)]);
});

test("listeners hear about added and removed files", async () => {
  const store = createMemoryAttachmentStore();
  let calls = 0;
  const off = store.subscribe(() => calls++);
  await addAttachment(store, new File(["x"], "x.txt", { type: "text/plain" }));
  await store.delete([...store.files.keys()][0]);
  off();
  await addAttachment(store, new File(["y"], "y.txt", { type: "text/plain" }));
  expect(calls).toBe(2);
});
