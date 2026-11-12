import type { RateLimiter } from "@/features/sync/server/rateLimit";
import { MAX_RECOVERY_BLOB_LENGTH, RECOVERY_ID } from "@/features/recovery/shared/recovery";

export interface RecoveryRepository {
  put(id: string, blob: string, now: number): Promise<void>;
  get(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;
}

export interface RecoveryResult {
  status: number;
  json: Record<string, unknown>;
  retryAfterSec?: number;
}

const fail = (status: number, error: string): RecoveryResult => ({ status, json: { error } });

export interface RecoveryDeps {
  repo: RecoveryRepository;
  now?: () => number;
  limitWrite?: RateLimiter;
  limitRead?: RateLimiter;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function limited(limiter: RateLimiter | undefined, caller: string): RecoveryResult | null {
  const decision = limiter?.take(caller);
  return decision && !decision.ok
    ? { ...fail(429, "Too many requests. Try again shortly."), retryAfterSec: decision.retryAfterSec }
    : null;
}

/**
 * Stores or replaces the sealed sync key under a lookup id. The id comes from
 * a secret only the user has, so knowing it is what authorises the write.
 */
export async function putRecovery(deps: RecoveryDeps, caller: string, id: string, body: unknown): Promise<RecoveryResult> {
  const slow = limited(deps.limitWrite, caller);
  if (slow) return slow;
  if (!RECOVERY_ID.test(id)) return fail(400, "Invalid id.");
  const blob = typeof body === "object" && body !== null ? (body as { blob?: unknown }).blob : undefined;
  if (typeof blob !== "string" || !BASE64URL.test(blob) || blob.length > MAX_RECOVERY_BLOB_LENGTH) {
    return fail(400, "Invalid payload.");
  }
  await deps.repo.put(id, blob, (deps.now ?? Date.now)());
  return { status: 200, json: { ok: true } };
}

export async function getRecovery(deps: RecoveryDeps, caller: string, id: string): Promise<RecoveryResult> {
  const slow = limited(deps.limitRead, caller);
  if (slow) return slow;
  const blob = RECOVERY_ID.test(id) ? await deps.repo.get(id) : null;
  // The same answer for an id that was never stored and one that is malformed.
  return blob === null ? fail(404, "Not found.") : { status: 200, json: { blob } };
}

export async function deleteRecovery(deps: RecoveryDeps, caller: string, id: string): Promise<RecoveryResult> {
  const slow = limited(deps.limitWrite, caller);
  if (slow) return slow;
  if (!RECOVERY_ID.test(id)) return fail(400, "Invalid id.");
  await deps.repo.delete(id);
  return { status: 200, json: { ok: true } };
}
