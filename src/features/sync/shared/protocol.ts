import type { SealedData } from "@/features/sync/shared/wire";

/** A sync key is a random bearer secret shared by the user's devices. */
export const SYNC_KEY_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
export const MAX_SYNC_BYTES = 5 * 1024 * 1024;
/** 2: end-to-end encrypted. Requests without it come from earlier builds. */
export const PROTOCOL_VERSION = 2;

export interface SyncRequest {
  v: typeof PROTOCOL_VERSION;
  /** The space token derived from the sync key; the key itself is never sent. */
  key: string;
  data: SealedData;
  /** When the device took the last snapshot the server merged; null before the first sync. */
  since?: number | null;
  /** Lets the server tell this device's edits from other devices'. */
  deviceId?: string;
  /**
   * The space version this device last received. With a cursor, `data` may
   * hold only what changed locally and the reply only what changed remotely.
   */
  cursor?: number | null;
  /** Id of a plaintext space left by an earlier build, to erase. */
  forgetLegacy?: string;
  /**
   * Retire this space for good (its key was replaced by a new one): its data
   * is erased and every later request to it is answered with 410.
   */
  revoke?: boolean;
}

export interface SyncResponse {
  data: SealedData;
  syncedAt: number;
  /** Ids of notes whose overwritten text was kept as a conflict copy. */
  conflicts?: string[];
  /** The space version this reply brings the device up to. */
  cursor?: number;
  /** Set on the reply to a revoke request. */
  revoked?: boolean;
}

export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateSyncKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
