import {
  MAX_CHUNK_BYTES,
  MAX_IDS_PER_REQUEST,
  MAX_PARTS,
  PRUNE_GRACE_MS,
  RID_PATTERN,
} from "@/features/sync/shared/attachments";
import { SYNC_KEY_PATTERN } from "@/features/sync/shared/protocol";
import type { RateLimiter } from "@/features/sync/server/rateLimit";

/** Where the sealed chunks of attachments live. */
export interface AttachmentRepository {
  /** Stores a chunk (replacing one with the same index) unless it would exceed `quotaBytes`. */
  putChunk(
    space: string,
    rid: string,
    index: number,
    parts: number,
    bytes: Uint8Array,
    quotaBytes: number
  ): Promise<"ok" | "quota">;
  getChunk(space: string, rid: string, index: number): Promise<{ bytes: Uint8Array; parts: number } | null>;
  /** Which of `rids` have every part stored. */
  complete(space: string, rids: string[]): Promise<string[]>;
  /**
   * Deletes files stored before `cutoff` (ms) that are not in `keep`, and
   * unfinished uploads stored before it. Returns how many files went.
   */
  prune(space: string, keep: ReadonlySet<string>, cutoff: number): Promise<number>;
  /** Deletes every file of the space. */
  purge(space: string): Promise<void>;
}

export interface AttachmentResult {
  status: number;
  /** A JSON reply... */
  json?: Record<string, unknown>;
  /** ...or raw bytes, for a chunk. */
  bytes?: Uint8Array;
  headers?: Record<string, string>;
  retryAfterSec?: number;
}

const fail = (status: number, error: string): AttachmentResult => ({ status, json: { error } });

interface Deps {
  repo: AttachmentRepository;
  hashKey: (token: string) => string;
  quotaBytes: number;
  now?: () => number;
  limitSpace?: RateLimiter;
  /** Whether the space was retired by a key rotation; its files are then gone for good. */
  isRevoked?: (space: string) => Promise<boolean>;
}

/** The space the request's bearer token names, or an error result. */
function spaceOf(authorization: string | null, { hashKey, limitSpace }: Deps): string | AttachmentResult {
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? null;
  return resolveSpace(token, hashKey, limitSpace);
}

function resolveSpace(
  token: string | null,
  hashKey: Deps["hashKey"],
  limitSpace: RateLimiter | undefined
): string | AttachmentResult {
  if (!token || !SYNC_KEY_PATTERN.test(token)) return fail(401, "Missing or invalid space token.");
  const space = hashKey(token);
  const decision = limitSpace?.take(space);
  if (decision && !decision.ok) {
    return { ...fail(429, "Too many requests. Try again shortly."), retryAfterSec: decision.retryAfterSec };
  }
  return space;
}

const asInt = (value: unknown) => (typeof value === "string" && /^\d{1,3}$/.test(value) ? Number(value) : NaN);

/** PUT one sealed chunk of a file. */
export async function putAttachmentChunk(
  deps: Deps,
  authorization: string | null,
  rid: string,
  index: string,
  parts: string | null,
  body: Uint8Array
): Promise<AttachmentResult> {
  const space = spaceOf(authorization, deps);
  if (typeof space !== "string") return space;
  if (await deps.isRevoked?.(space)) return fail(410, "This sync key was replaced on another device.");
  const i = asInt(index);
  const n = asInt(parts);
  if (!RID_PATTERN.test(rid) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > MAX_PARTS || i >= n) {
    return fail(400, "Invalid attachment chunk.");
  }
  if (body.byteLength === 0 || body.byteLength > MAX_CHUNK_BYTES) return fail(413, "Chunk too large.");
  const stored = await deps.repo.putChunk(space, rid, i, n, body, deps.quotaBytes);
  if (stored === "quota") {
    return fail(413, "This sync space has used up its attachment storage.");
  }
  return { status: 200, json: { ok: true } };
}

/** GET one sealed chunk. The reply says how many parts the file has. */
export async function getAttachmentChunk(
  deps: Deps,
  authorization: string | null,
  rid: string,
  index: string
): Promise<AttachmentResult> {
  const space = spaceOf(authorization, deps);
  if (typeof space !== "string") return space;
  if (await deps.isRevoked?.(space)) return fail(410, "This sync key was replaced on another device.");
  const i = asInt(index);
  if (!RID_PATTERN.test(rid) || !Number.isInteger(i)) return fail(400, "Invalid attachment chunk.");
  const chunk = await deps.repo.getChunk(space, rid, i);
  if (!chunk) return fail(404, "Not found.");
  return {
    status: 200,
    bytes: chunk.bytes,
    headers: { "X-Parts": String(chunk.parts), "Content-Type": "application/octet-stream" },
  };
}

/**
 * Bulk questions about a space's attachments:
 * - `have`: which of `ids` are stored completely;
 * - `prune`: delete files not in `keep` that are older than the grace period;
 * - `purge`: delete every file (after the space's key was replaced).
 */
export async function manageAttachments(deps: Deps, body: unknown): Promise<AttachmentResult> {
  if (typeof body !== "object" || body === null) return fail(400, "Expected a JSON object.");
  const { key, op, ids, keep } = body as { key?: unknown; op?: unknown; ids?: unknown; keep?: unknown };
  const space = resolveSpace(typeof key === "string" ? key : null, deps.hashKey, deps.limitSpace);
  if (typeof space !== "string") return space;

  const list = (value: unknown): string[] | null =>
    Array.isArray(value) && value.length <= MAX_IDS_PER_REQUEST * 50 && value.every((v) => typeof v === "string" && RID_PATTERN.test(v))
      ? (value as string[])
      : null;

  if (op === "purge") {
    // Allowed on a retired space too: that is when its files are removed.
    await deps.repo.purge(space);
    return { status: 200, json: { ok: true } };
  }
  if (await deps.isRevoked?.(space)) return fail(410, "This sync key was replaced on another device.");
  if (op === "have") {
    const wanted = list(ids);
    if (!wanted || wanted.length > MAX_IDS_PER_REQUEST) return fail(400, "Invalid id list.");
    return { status: 200, json: { have: await deps.repo.complete(space, wanted) } };
  }
  if (op === "prune") {
    const kept = list(keep);
    if (!kept) return fail(400, "Invalid id list.");
    const cutoff = (deps.now ?? Date.now)() - PRUNE_GRACE_MS;
    return { status: 200, json: { removed: await deps.repo.prune(space, new Set(kept), cutoff) } };
  }
  return fail(400, "Unknown operation.");
}
