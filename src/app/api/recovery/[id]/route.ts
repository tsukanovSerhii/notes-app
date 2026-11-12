import { deleteRecovery, getRecovery, putRecovery } from "@/features/recovery/server/recoveryHandler";
import { recoveryResponse, recoveryRuntime as rt } from "@/features/recovery/server/recoveryRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const disabled = () => Response.json({ error: "Recovery is disabled on this server." }, { status: 503 });

/** The sealed sync key stored under a lookup id. */
export async function GET(request: Request, { params }: Params) {
  if (process.env.SYNC_DISABLED === "true") return disabled();
  const { id } = await params;
  try {
    return recoveryResponse(await getRecovery(rt.deps, rt.caller(request), id));
  } catch {
    return Response.json({ error: "Recovery storage failed." }, { status: 500 });
  }
}

/** Stores or replaces it. */
export async function PUT(request: Request, { params }: Params) {
  if (process.env.SYNC_DISABLED === "true") return disabled();
  const { id } = await params;
  const text = await request.text();
  if (text.length > 4096) return Response.json({ error: "Payload too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    return recoveryResponse(await putRecovery(rt.deps, rt.caller(request), id, body));
  } catch {
    return Response.json({ error: "Recovery storage failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    return recoveryResponse(await deleteRecovery(rt.deps, rt.caller(request), id));
  } catch {
    return Response.json({ error: "Recovery storage failed." }, { status: 500 });
  }
}
