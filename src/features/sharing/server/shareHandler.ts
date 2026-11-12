import type { RateLimiter } from "@/features/sync/server/rateLimit";
import {
  DAY_MS,
  MAX_SHARE_BYTES,
  SHARE_DELETE_TOKEN,
  SHARE_ID,
  SHARE_TTL_DAYS,
  type ShareResponse,
  type ShareTtl,
} from "@/features/sharing/shared/share";

export interface StoredShare {
  id: string;
  blob: string;
  /** SHA-256 (hex) of the delete token. */
  deleteHash: string;
  createdAt: number;
  expiresAt: number;
}

export interface ShareRepository {
  /** Stores a share; false when the id is taken. */
  create(share: StoredShare): Promise<boolean>;
  /** The share, or null if it does not exist or has expired (an expired one is removed). */
  get(id: string, now: number): Promise<StoredShare | null>;
  delete(id: string): Promise<void>;
}

export interface ShareResult {
  status: number;
  json: Record<string, unknown>;
  retryAfterSec?: number;
}

const fail = (status: number, error: string): ShareResult => ({ status, json: { error } });

export interface ShareDeps {
  repo: ShareRepository;
  /** SHA-256 as hex. */
  sha256: (text: string) => string;
  now?: () => number;
  /** Optional limits, keyed by caller. */
  limitCreate?: RateLimiter;
  limitRead?: RateLimiter;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Stores a sealed snapshot under an id the client chose. */
export async function createShare(deps: ShareDeps, caller: string, body: unknown): Promise<ShareResult> {
  const decision = deps.limitCreate?.take(caller);
  if (decision && !decision.ok) {
    return { ...fail(429, "Too many share links created. Try again shortly."), retryAfterSec: decision.retryAfterSec };
  }
  if (typeof body !== "object" || body === null) return fail(400, "Expected a JSON object.");
  const { id, blob, deleteHash, ttlDays } = body as Record<string, unknown>;
  if (typeof id !== "string" || !SHARE_ID.test(id)) return fail(400, "Invalid share id.");
  if (typeof blob !== "string" || blob.length === 0 || !BASE64URL.test(blob)) return fail(400, "Invalid snapshot.");
  if (blob.length > Math.ceil((MAX_SHARE_BYTES * 4) / 3)) return fail(413, "This note is too large to share.");
  if (typeof deleteHash !== "string" || !/^[a-f0-9]{64}$/.test(deleteHash)) return fail(400, "Invalid delete token.");
  if (!SHARE_TTL_DAYS.includes(ttlDays as ShareTtl)) return fail(400, "Invalid lifetime.");

  const now = (deps.now ?? Date.now)();
  const expiresAt = now + (ttlDays as number) * DAY_MS;
  const stored = await deps.repo.create({ id, blob, deleteHash, createdAt: now, expiresAt });
  if (!stored) return fail(409, "That share id is already in use.");
  return { status: 201, json: { id, expiresAt } };
}

export async function readShare(deps: ShareDeps, caller: string, id: string): Promise<ShareResult> {
  const decision = deps.limitRead?.take(caller);
  if (decision && !decision.ok) {
    return { ...fail(429, "Too many requests. Try again shortly."), retryAfterSec: decision.retryAfterSec };
  }
  if (!SHARE_ID.test(id)) return fail(404, "This link does not exist or has expired.");
  const share = await deps.repo.get(id, (deps.now ?? Date.now)());
  if (!share) return fail(404, "This link does not exist or has expired.");
  const body: ShareResponse = { blob: share.blob, expiresAt: share.expiresAt };
  return { status: 200, json: { ...body } };
}

/** Revokes a link. The bearer token is the delete token the owner kept. */
export async function deleteShare(deps: ShareDeps, id: string, authorization: string | null): Promise<ShareResult> {
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "";
  if (!SHARE_ID.test(id) || !SHARE_DELETE_TOKEN.test(token)) return fail(404, "Not found.");
  const share = await deps.repo.get(id, (deps.now ?? Date.now)());
  // The same answer whether the link is missing or the token is wrong.
  if (!share || share.deleteHash !== deps.sha256(token)) return fail(404, "Not found.");
  await deps.repo.delete(id);
  return { status: 200, json: { ok: true } };
}
