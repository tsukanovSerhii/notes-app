import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import pg from "pg";

/**
 * Everything the sync server stored since `since` (a ms timestamp), as text,
 * from wherever the app under test keeps it: Postgres when DATABASE_URL is
 * set (read the same way `next start` reads it), else the JSON files.
 */
export async function storedSyncData(since: number): Promise<string> {
  loadEnvConfig(process.cwd());
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await pool.query<{ space: unknown }>(
        "select space from notevoid_sync_spaces where updated_at >= to_timestamp($1 / 1000.0)",
        [since]
      );
      return rows.map((r) => JSON.stringify(r.space)).join(" ");
    } finally {
      await pool.end();
    }
  }
  // Only files written during the test: earlier builds may have left plaintext ones.
  const dir = path.join(process.cwd(), ".data", "sync");
  return readdirSync(dir)
    .filter((f) => statSync(path.join(dir, f)).mtimeMs >= since)
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join(" ");
}
