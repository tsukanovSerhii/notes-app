import type { NotesData } from "@/app/types/note";

/** A sync key is a random bearer secret shared by the user's devices. */
export const SYNC_KEY_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
export const MAX_SYNC_BYTES = 5 * 1024 * 1024;

export interface SyncRequest {
  key: string;
  data: NotesData;
}

export interface SyncResponse {
  data: NotesData;
  syncedAt: number;
}

export function generateSyncKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
