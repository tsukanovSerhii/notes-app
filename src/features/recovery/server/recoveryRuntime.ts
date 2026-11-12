import path from "node:path";
import pg from "pg";
import {
  createFileRecoveryRepository,
  createPostgresRecoveryRepository,
} from "@/features/recovery/server/recoveryRepositories";
import type { RecoveryDeps, RecoveryResult } from "@/features/recovery/server/recoveryHandler";
import { clientAddress, createRateLimiter, readPerMinute } from "@/features/sync/server/rateLimit";

/** What the recovery routes have in common: storage, limits and responses. */
export const recoveryRuntime = (() => {
  const repo = process.env.DATABASE_URL
    ? createPostgresRecoveryRepository(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }))
    : createFileRecoveryRepository(process.env.RECOVERY_DATA_DIR ?? path.join(process.cwd(), ".data", "recovery"));
  const deps: RecoveryDeps = {
    repo,
    // Setting up is rare; signing in on a new device is a handful of requests.
    limitWrite: createRateLimiter({ perMinute: readPerMinute(process.env.RECOVERY_RATE_LIMIT_WRITE, 10) }),
    limitRead: createRateLimiter({ perMinute: readPerMinute(process.env.RECOVERY_RATE_LIMIT_READ, 30) }),
  };
  return { deps, caller: (request: Request) => clientAddress(request.headers) };
})();

export function recoveryResponse(result: RecoveryResult): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.retryAfterSec !== undefined) headers["Retry-After"] = String(result.retryAfterSec);
  return Response.json(result.json, { status: result.status, headers });
}
