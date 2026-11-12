"use client";

import {
  createIndexedDbAttachmentStore,
  createMemoryAttachmentStore,
  type AttachmentStore,
} from "@/features/attachments/attachmentStore";

/**
 * This device's attachment files. Without IndexedDB (a locked-down browser)
 * they live in memory and are gone after a reload; the note text still keeps
 * its links, so they come back once the file is added or synced again.
 */
export const attachmentStore: AttachmentStore =
  typeof window !== "undefined" && "indexedDB" in window && window.indexedDB
    ? createIndexedDbAttachmentStore(window.indexedDB)
    : createMemoryAttachmentStore();
