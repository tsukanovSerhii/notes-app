import { deleteShare, readShare } from "@/features/sharing/server/shareHandler";
import { shareResponse, shareRuntime as rt } from "@/features/sharing/server/shareRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The sealed snapshot of a shared note. */
export async function GET(request: Request, { params }: Params) {
  if (process.env.SHARE_DISABLED === "true") {
    return Response.json({ error: "Sharing is disabled on this server." }, { status: 503 });
  }
  const { id } = await params;
  try {
    return shareResponse(await readShare(rt.deps, rt.caller(request), id));
  } catch {
    return Response.json({ error: "Share storage failed." }, { status: 500 });
  }
}

/** Revokes a link; the bearer token is the one its creator kept. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    return shareResponse(await deleteShare(rt.deps, id, request.headers.get("authorization")));
  } catch {
    return Response.json({ error: "Share storage failed." }, { status: 500 });
  }
}
