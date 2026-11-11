import { createHash } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { createFileRepository } from "@/app/lib/sync/fileRepository";
import { createPostgresRepository } from "@/app/lib/sync/postgresRepository";
import { handleSyncRequest } from "@/app/lib/sync/server";
import { MAX_SYNC_BYTES } from "@/app/lib/sync/protocol";
import { clientAddress, createRateLimiter, readPerMinute } from "@/app/lib/sync/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Postgres when DATABASE_URL is set (any number of instances), else JSON files.
const repo = process.env.DATABASE_URL
  ? createPostgresRepository(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }))
  : createFileRepository(process.env.SYNC_DATA_DIR ?? path.join(process.cwd(), ".data", "sync"));

// A device syncs about twice a minute when idle and every few seconds while
// typing, so these defaults leave plenty of room for real use.
const ipLimiter = createRateLimiter({
  perMinute: readPerMinute(process.env.SYNC_RATE_LIMIT_IP, 120),
});
const spaceLimiter = createRateLimiter({
  perMinute: readPerMinute(process.env.SYNC_RATE_LIMIT_SPACE, 240),
});

const sha256 = (key: string) => createHash("sha256").update(key).digest("hex");

const tooMany = (retryAfterSec: number, error = "Too many sync requests. Try again shortly.") =>
  Response.json(
    { error },
    { status: 429, headers: { "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" } }
  );

export async function POST(request: Request) {
  if (process.env.SYNC_DISABLED === "true") {
    return Response.json({ error: "Sync is disabled on this server." }, { status: 503 });
  }

  // Checked before the body is read, so a flood costs no parsing or disk work.
  const ipDecision = ipLimiter.take(clientAddress(request.headers));
  if (!ipDecision.ok) return tooMany(ipDecision.retryAfterSec);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_SYNC_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > MAX_SYNC_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await handleSyncRequest(repo, body, sha256, Date.now, spaceLimiter);
    if (result.status === 429) return tooMany(result.retryAfterSec ?? 1);
    return Response.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Sync storage failed." }, { status: 500 });
  }
}
