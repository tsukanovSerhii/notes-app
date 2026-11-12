import { createHash } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { createPostgresShareRepository } from "@/features/sharing/server/postgresShareRepository";
import { createFileShareRepository } from "@/features/sharing/server/shareRepositories";
import type { ShareDeps, ShareResult } from "@/features/sharing/server/shareHandler";
import { clientAddress, createRateLimiter, readPerMinute } from "@/features/sync/server/rateLimit";

/** What the share routes have in common: storage, limits and responses. */
export const shareRuntime = (() => {
  const repo = process.env.DATABASE_URL
    ? createPostgresShareRepository(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }))
    : createFileShareRepository(process.env.SHARE_DATA_DIR ?? path.join(process.cwd(), ".data", "shares"));
  const deps: ShareDeps = {
    repo,
    sha256: (text) => createHash("sha256").update(text).digest("hex"),
    limitCreate: createRateLimiter({ perMinute: readPerMinute(process.env.SHARE_RATE_LIMIT_CREATE, 20) }),
    limitRead: createRateLimiter({ perMinute: readPerMinute(process.env.SHARE_RATE_LIMIT_READ, 120) }),
  };
  return { deps, caller: (request: Request) => clientAddress(request.headers) };
})();

export function shareResponse(result: ShareResult): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.retryAfterSec !== undefined) headers["Retry-After"] = String(result.retryAfterSec);
  return Response.json(result.json, { status: result.status, headers });
}
