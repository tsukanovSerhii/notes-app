import type { NotesData } from "@/app/types/note";

/** A sync key is a random bearer secret shared by the user's devices. */
export const SYNC_KEY_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
export const MAX_SYNC_BYTES = 5 * 1024 * 1024;

export interface SyncRequest {
  key: string;
  data: NotesData;
  /** When the device took the last snapshot the server merged; null before the first sync. */
  since?: number | null;
  /** Lets the server tell this device's edits from other devices'. */
  deviceId?: string;
}

export interface SyncResponse {
  data: NotesData;
  syncedAt: number;
  /** Titles of notes whose overwritten text was kept as a conflict copy. */
  conflicts?: string[];
}

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateSyncKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
