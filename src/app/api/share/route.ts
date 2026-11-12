import { createShare } from "@/features/sharing/server/shareHandler";
import { shareResponse, shareRuntime as rt } from "@/features/sharing/server/shareRuntime";
import { MAX_SHARE_BYTES } from "@/features/sharing/shared/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stores a sealed snapshot of a note and returns when it expires. */
export async function POST(request: Request) {
  if (process.env.SHARE_DISABLED === "true") {
    return Response.json({ error: "Sharing is disabled on this server." }, { status: 503 });
  }
  const limit = MAX_SHARE_BYTES * 2;
  if (Number(request.headers.get("content-length") ?? 0) > limit) {
    return Response.json({ error: "This note is too large to share." }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > limit) return Response.json({ error: "This note is too large to share." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    return shareResponse(await createShare(rt.deps, rt.caller(request), body));
  } catch {
    return Response.json({ error: "Share storage failed." }, { status: 500 });
  }
}
