import { parseSpace } from "@/app/lib/sync/space";
import type { SyncRepository } from "@/app/lib/sync/server";

/**
 * The part of a Postgres client the repository needs. `pg`'s Pool and
 * PGlite both fit, so production uses a real server and tests an in-process
 * Postgres.
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const TABLE = "notevoid_sync_spaces";

export const SCHEMA = `
  create table if not exists ${TABLE} (
    id text primary key,
    version integer not null,
    space jsonb not null,
    updated_at timestamptz not null default now()
  )`;

/**
 * Sync spaces in Postgres, one row per space. Writes are conditional on the
 * version that was read (optimistic concurrency), so any number of server
 * instances can share the table without losing each other's merges.
 */
export function createPostgresRepository(client: SqlClient): SyncRepository {
  let ready: Promise<unknown> | null = null;
  const schema = () => (ready ??= client.query(SCHEMA).catch((e) => {
    ready = null;
    throw e;
  }));

  return {
    async get(id) {
      await schema();
      const { rows } = await client.query<{ space: unknown }>(
        `select space from ${TABLE} where id = $1`,
        [id]
      );
      if (rows.length === 0) return null;
      const raw = rows[0].space;
      return parseSpace(typeof raw === "string" ? JSON.parse(raw) : raw);
    },

    async put(id, space, expected) {
      await schema();
      const json = JSON.stringify(space);
      const { rows } =
        expected === null
          ? await client.query(
              `insert into ${TABLE} (id, version, space) values ($1, $2, $3::jsonb)
               on conflict (id) do nothing returning id`,
              [id, space.version, json]
            )
          : await client.query(
              `update ${TABLE} set version = $2, space = $3::jsonb, updated_at = now()
               where id = $1 and version = $4 returning id`,
              [id, space.version, json, expected]
            );
      return rows.length === 1;
    },
  };
}
