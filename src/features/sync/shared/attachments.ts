/**
 * Attachment sync. Files are sealed on the device and uploaded in chunks;
 * the server stores opaque bytes under ids it cannot link to the file.
 *
 * - `rid` (remote id): HMAC of the file's content id under the space's key,
 *   so the server cannot tell which known file it is holding, while one
 *   space still stores a file only once.
 * - A file is `parts` chunks of at most CHUNK_BYTES of plaintext each. It
 *   exists for readers once every part is stored.
 */

export const RID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Plaintext per chunk. */
export const CHUNK_BYTES = 1024 * 1024;
/** Per-chunk overhead: a 12-byte IV and a 16-byte GCM tag. */
export const CHUNK_OVERHEAD = 28;
export const MAX_CHUNK_BYTES = CHUNK_BYTES + CHUNK_OVERHEAD;
/** 10 MiB of file plus a small header fits in 11 chunks; a few spare. */
export const MAX_PARTS = 16;
/** Default storage a space may use for attachments. */
export const DEFAULT_QUOTA_BYTES = 256 * 1024 * 1024;
/** Unreferenced files younger than this are never pruned. */
export const PRUNE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
/** A request lists at most this many ids. */
export const MAX_IDS_PER_REQUEST = 200;
