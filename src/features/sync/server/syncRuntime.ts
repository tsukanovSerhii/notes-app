import path from "node:path";
import pg from "pg";
import { createFileRepository } from "@/features/sync/server/fileRepository";
import { createPostgresRepository } from "@/features/sync/server/postgresRepository";

/**
 * The sync store the routes share. Postgres when DATABASE_URL is set (any
 * number of instances), else JSON files.
 */
export const syncRepo = process.env.DATABASE_URL
  ? createPostgresRepository(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }))
  : createFileRepository(process.env.SYNC_DATA_DIR ?? path.join(process.cwd(), ".data", "sync"));
