import type { SealedNote } from "@/features/sync/shared/wire";

/** A sealed note as the server sees it; the text is opaque. */
export const sealedNote = (id: string, overrides: Partial<SealedNote> = {}): SealedNote => ({
  id,
  pinned: false,
  folderId: null,
  createdAt: 0,
  updatedAt: 0,
  editedAt: 0,
  editedBy: null,
  trashedAt: null,
  textHash: `hash-${id}-0`,
  sealed: `sealed${id.replace(/[^A-Za-z0-9_-]/g, "")}`,
  conflictOf: null,
  ...overrides,
});
