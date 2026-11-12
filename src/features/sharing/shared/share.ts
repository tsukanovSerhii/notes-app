/**
 * Share links: a read-only snapshot of one note, sealed on the device with a
 * random key that lives only in the part of the link after `#` (which
 * browsers never send to a server). The server stores ciphertext it cannot
 * read, and deletes it when the link expires or its owner revokes it.
 */

/** Chosen by the device: 16 random bytes, base64url. */
export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
/** The secret that lets the owner revoke a link: 24 random bytes, base64url. */
export const SHARE_DELETE_TOKEN = /^[A-Za-z0-9_-]{32}$/;
/** The key in the link: 32 random bytes, base64url. */
export const SHARE_KEY = /^[A-Za-z0-9_-]{43}$/;
/** Largest sealed snapshot, pictures included. */
export const MAX_SHARE_BYTES = 3 * 1024 * 1024;
/** How long a link can live, in days. */
export const SHARE_TTL_DAYS = [1, 7, 30, 90] as const;
export type ShareTtl = (typeof SHARE_TTL_DAYS)[number];
export const DAY_MS = 24 * 60 * 60 * 1000;

/** What is sealed inside a share link. */
export interface SharedNote {
  v: 1;
  title: string;
  content: string;
  tags: string[];
  /** When the snapshot was taken. */
  sharedAt: number;
  /** Pictures and files the note shows (base64), when they fitted. */
  attachments: { id: string; type: string; name: string; data: string }[];
}

export interface CreateShareRequest {
  id: string;
  /** The sealed snapshot, base64url. */
  blob: string;
  /** SHA-256 (hex) of the delete token. */
  deleteHash: string;
  ttlDays: ShareTtl;
}

export interface ShareResponse {
  blob: string;
  expiresAt: number;
}
