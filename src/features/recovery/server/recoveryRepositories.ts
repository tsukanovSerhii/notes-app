import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SqlClient } from "@/features/sync/server/postgresRepository";
import type { RecoveryRepository } from "@/features/recovery/server/recoveryHandler";

/** Recovery blobs in memory, for tests. */
export function createMemoryRecoveryRepository(): RecoveryRepository & { blobs: Map<string, string> } {
  const blobs = new Map<string, string>();
  return {
    blobs,
    async put(id, blob) {
      blobs.set(id, blob);
    },
    async get(id) {
      return blobs.get(id) ?? null;
    },
    async delete(id) {
      blobs.delete(id);
    },
  };
}

/** One small file per blob. */
export function createFileRecoveryRepository(dir: string): RecoveryRepository {
  const fileFor = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid id");
    return path.join(dir, `${id}.txt`);
  };
  return {
    async put(id, blob) {
      await mkdir(dir, { recursive: true });
      const file = fileFor(id);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, blob, "utf8");
      await rename(tmp, file);
    },
    async get(id) {
      try {
        return await readFile(fileFor(id), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(id) {
      await rm(fileFor(id), { force: true });
    },
  };
}

const TABLE = "notevoid_recovery";

export const RECOVERY_SCHEMA = `
  create table if not exists ${TABLE} (
    id text primary key,
    blob text not null,
    updated_at bigint not null
  )`;

/** Recovery blobs in Postgres. */
export function createPostgresRecoveryRepository(client: SqlClient): RecoveryRepository {
  let ready: Promise<unknown> | null = null;
  const schema = () =>
    (ready ??= client.query(RECOVERY_SCHEMA).catch((e) => {
      ready = null;
      throw e;
    }));
  return {
    async put(id, blob, now) {
      await schema();
      await client.query(
        `insert into ${TABLE} (id, blob, updated_at) values ($1, $2, $3)
         on conflict (id) do update set blob = excluded.blob, updated_at = excluded.updated_at`,
        [id, blob, now]
      );
    },
    async get(id) {
      await schema();
      const { rows } = await client.query<{ blob: string }>(`select blob from ${TABLE} where id = $1`, [id]);
      return rows.length ? rows[0].blob : null;
    },
    async delete(id) {
      await schema();
      await client.query(`delete from ${TABLE} where id = $1`, [id]);
    },
  };
}
