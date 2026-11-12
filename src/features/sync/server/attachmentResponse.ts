import type { AttachmentResult } from "@/features/sync/server/attachmentHandler";
import { attachmentRuntime as rt } from "@/features/sync/server/attachmentRuntime";

/** Turns handler results into HTTP responses; shared by the attachment routes. */
export const respond = {
  /** A 429 when the caller's address is over its limit, else null. */
  limit(request: Request): Response | null {
    if (process.env.SYNC_DISABLED === "true") {
      return Response.json({ error: "Sync is disabled on this server." }, { status: 503 });
    }
    const decision = rt.ipLimiter.take(rt.clientAddress(request.headers));
    if (decision.ok) return null;
    return Response.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec), "Cache-Control": "no-store" } }
    );
  },

  result(r: AttachmentResult): Response {
    const headers: Record<string, string> = { "Cache-Control": "no-store", ...r.headers };
    if (r.retryAfterSec !== undefined) headers["Retry-After"] = String(r.retryAfterSec);
    if (r.bytes) return new Response(r.bytes as BodyInit, { status: r.status, headers });
    return Response.json(r.json ?? {}, { status: r.status, headers });
  },
};
