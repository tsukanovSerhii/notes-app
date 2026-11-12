import type { ShareRepository } from "@/features/sharing/server/shareHandler";
import type { SqlClient } from "@/features/sync/server/postgresRepository";

const TABLE = "notevoid_shares";

export const SHARE_SCHEMA = `
  create table if not exists ${TABLE} (
    id text primary key,
    blob text not null,
    delete_hash text not null,
    created_at bigint not null,
    expires_at bigint not null
  )`;

/** Share links in Postgres, one row each. */
export function createPostgresShareRepository(client: SqlClient): ShareRepository {
  let ready: Promise<unknown> | null = null;
  const schema = () =>
    (ready ??= client.query(SHARE_SCHEMA).catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    async create(share) {
      await schema();
      // Expired links are cleared as new ones come in, so the table does not grow forever.
      await client.query(`delete from ${TABLE} where expires_at <= $1`, [share.createdAt]);
      const { rows } = await client.query(
        `insert into ${TABLE} (id, blob, delete_hash, created_at, expires_at) values ($1, $2, $3, $4, $5)
         on conflict (id) do nothing returning id`,
        [share.id, share.blob, share.deleteHash, share.createdAt, share.expiresAt]
      );
      return rows.length === 1;
    },

    async get(id, now) {
      await schema();
      const { rows } = await client.query<{
        id: string;
        blob: string;
        delete_hash: string;
        created_at: string | number;
        expires_at: string | number;
      }>(`select id, blob, delete_hash, created_at, expires_at from ${TABLE} where id = $1`, [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      if (Number(r.expires_at) <= now) {
        await client.query(`delete from ${TABLE} where id = $1`, [id]);
        return null;
      }
      return {
        id: r.id,
        blob: r.blob,
        deleteHash: r.delete_hash,
        createdAt: Number(r.created_at),
        expiresAt: Number(r.expires_at),
      };
    },

    async delete(id) {
      await schema();
      await client.query(`delete from ${TABLE} where id = $1`, [id]);
    },
  };
}
