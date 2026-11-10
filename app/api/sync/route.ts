import { createHash } from "node:crypto";
import path from "node:path";
import { createFileRepository } from "@/app/lib/sync/fileRepository";
import { handleSyncRequest } from "@/app/lib/sync/server";
import { MAX_SYNC_BYTES } from "@/app/lib/sync/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repo = createFileRepository(
  process.env.SYNC_DATA_DIR ?? path.join(process.cwd(), ".data", "sync")
);

const sha256 = (key: string) => createHash("sha256").update(key).digest("hex");

export async function POST(request: Request) {
  if (process.env.SYNC_DISABLED === "true") {
    return Response.json({ error: "Sync is disabled on this server." }, { status: 503 });
  }

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
    const result = await handleSyncRequest(repo, body, sha256);
    return Response.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Sync storage failed." }, { status: 500 });
  }
}
