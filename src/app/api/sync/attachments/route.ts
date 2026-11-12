import { manageAttachments } from "@/features/sync/server/attachmentHandler";
import { attachmentRuntime as rt } from "@/features/sync/server/attachmentRuntime";
import { respond } from "@/features/sync/server/attachmentResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bulk operations: which files are stored, and pruning unused ones. */
export async function POST(request: Request) {
  const limited = respond.limit(request);
  if (limited) return limited;
  const text = await request.text();
  if (text.length > 1024 * 1024) return Response.json({ error: "Payload too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  return respond.result(
    await manageAttachments(
      { repo: rt.repo, hashKey: rt.hashKey, quotaBytes: rt.quotaBytes, limitSpace: rt.spaceLimiter, isRevoked: rt.isRevoked },
      body
    )
  );
}
