import type { Attachment } from "@/features/attachments/attachments";
import { ATTACHMENT_STORE, openDatabase } from "@/features/notes/persistence/indexedDb";

export interface AttachmentInfo {
  id: string;
  createdAt: number;
  size: number;
}

/** Where attachment files live on this device. */
export interface AttachmentStore {
  /** Stores the file; an id that is already there is left as it is. */
  put(a: Attachment): Promise<void>;
  get(id: string): Promise<Attachment | null>;
  /** Every stored file, without its contents. */
  list(): Promise<AttachmentInfo[]>;
  delete(id: string): Promise<void>;
  /** Runs when a file is added or removed, here or in another tab. */
  subscribe(listener: () => void): () => void;
}

export function createMemoryAttachmentStore(): AttachmentStore & { files: Map<string, Attachment> } {
  const files = new Map<string, Attachment>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    files,
    async put(a) {
      if (files.has(a.id)) return;
      files.set(a.id, a);
      emit();
    },
    async get(id) {
      return files.get(id) ?? null;
    },
    async list() {
      return [...files.values()].map(({ id, createdAt, size }) => ({ id, createdAt, size }));
    },
    async delete(id) {
      if (files.delete(id)) emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const CHANNEL = "notevoid-attachments";

export function createIndexedDbAttachmentStore(factory: IDBFactory): AttachmentStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase(factory));
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  channel?.addEventListener("message", emit);

  const request = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const done = (tx: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  const changed = () => {
    channel?.postMessage("changed");
    emit();
  };

  return {
    async put(a) {
      const tx = (await db()).transaction(ATTACHMENT_STORE, "readwrite");
      const store = tx.objectStore(ATTACHMENT_STORE);
      if ((await request(store.count(a.id))) === 0) store.put(a);
      await done(tx);
      changed();
    },
    async get(id) {
      const tx = (await db()).transaction(ATTACHMENT_STORE, "readonly");
      return ((await request(tx.objectStore(ATTACHMENT_STORE).get(id))) as Attachment | undefined) ?? null;
    },
    async list() {
      const tx = (await db()).transaction(ATTACHMENT_STORE, "readonly");
      const rows = (await request(tx.objectStore(ATTACHMENT_STORE).getAll())) as Attachment[];
      return rows.map(({ id, createdAt, size }) => ({ id, createdAt, size }));
    },
    async delete(id) {
      const tx = (await db()).transaction(ATTACHMENT_STORE, "readwrite");
      tx.objectStore(ATTACHMENT_STORE).delete(id);
      await done(tx);
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
