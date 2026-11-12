import type { AttachmentRepository } from "@/features/sync/server/attachmentHandler";
import type { SqlClient } from "@/features/sync/server/postgresRepository";

const TABLE = "notevoid_attachment_chunks";

export const ATTACHMENT_SCHEMA = `
  create table if not exists ${TABLE} (
    space text not null,
    id text not null,
    idx integer not null,
    parts integer not null,
    data bytea not null,
    created_at timestamptz not null default now(),
    primary key (space, id, idx)
  )`;

/** `bytea` comes back as a Buffer from `pg` and a Uint8Array from PGlite. */
const toBytes = (value: unknown): Uint8Array =>
  value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(Buffer.from(value as string));

/** Sealed attachment chunks in Postgres, one row per chunk. */
export function createPostgresAttachmentRepository(client: SqlClient): AttachmentRepository {
  let ready: Promise<unknown> | null = null;
  const schema = () =>
    (ready ??= client.query(ATTACHMENT_SCHEMA).catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    async putChunk(space, rid, index, parts, bytes, quota) {
      await schema();
      const { rows } = await client.query<{ used: string | number | null }>(
        `select coalesce(sum(octet_length(data)), 0) as used from ${TABLE}
         where space = $1 and not (id = $2 and idx = $3)`,
        [space, rid, index]
      );
      if (Number(rows[0]?.used ?? 0) + bytes.byteLength > quota) return "quota";
      await client.query(
        `insert into ${TABLE} (space, id, idx, parts, data) values ($1, $2, $3, $4, $5)
         on conflict (space, id, idx) do update set parts = excluded.parts, data = excluded.data, created_at = now()`,
        [space, rid, index, parts, bytes]
      );
      return "ok";
    },

    async getChunk(space, rid, index) {
      await schema();
      const { rows } = await client.query<{ data: unknown; parts: number }>(
        `select data, parts from ${TABLE} where space = $1 and id = $2 and idx = $3`,
        [space, rid, index]
      );
      return rows.length ? { bytes: toBytes(rows[0].data), parts: rows[0].parts } : null;
    },

    async complete(space, rids) {
      if (rids.length === 0) return [];
      await schema();
      const { rows } = await client.query<{ id: string }>(
        `select id from ${TABLE} where space = $1 and id = any($2::text[])
         group by id having count(*) = max(parts)`,
        [space, rids]
      );
      return rows.map((r) => r.id);
    },

    async prune(space, keep, cutoff) {
      await schema();
      const { rows } = await client.query<{ id: string }>(
        `delete from ${TABLE}
         where space = $1 and created_at < to_timestamp($3::double precision / 1000.0)
           and (not (id = any($2::text[]))
                or id in (select id from ${TABLE} where space = $1 group by id having count(*) < max(parts)))
         returning id`,
        [space, [...keep], cutoff]
      );
      return new Set(rows.map((r) => r.id)).size;
    },
  };
}
