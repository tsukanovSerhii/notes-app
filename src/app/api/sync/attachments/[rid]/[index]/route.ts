import { getAttachmentChunk, putAttachmentChunk } from "@/features/sync/server/attachmentHandler";
import { attachmentRuntime as rt } from "@/features/sync/server/attachmentRuntime";
import { respond } from "@/features/sync/server/attachmentResponse";
import { MAX_CHUNK_BYTES } from "@/features/sync/shared/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps = { repo: rt.repo, hashKey: rt.hashKey, quotaBytes: rt.quotaBytes, limitSpace: rt.spaceLimiter };

type Params = { params: Promise<{ rid: string; index: string }> };

/** Stores one sealed chunk of a file: `PUT /api/sync/attachments/<rid>/<index>?parts=<n>`. */
export async function PUT(request: Request, { params }: Params) {
  const limited = respond.limit(request);
  if (limited) return limited;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CHUNK_BYTES) {
    return Response.json({ error: "Chunk too large." }, { status: 413 });
  }
  const { rid, index } = await params;
  const body = new Uint8Array(await request.arrayBuffer());
  return respond.result(
    await putAttachmentChunk(
      deps,
      request.headers.get("authorization"),
      rid,
      index,
      new URL(request.url).searchParams.get("parts"),
      body
    )
  );
}

/** Reads one sealed chunk; the `X-Parts` header says how many the file has. */
export async function GET(request: Request, { params }: Params) {
  const limited = respond.limit(request);
  if (limited) return limited;
  const { rid, index } = await params;
  return respond.result(await getAttachmentChunk(deps, request.headers.get("authorization"), rid, index));
}
