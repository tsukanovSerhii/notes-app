import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSpace } from "@/app/lib/sync/space";
import type { SyncRepository } from "@/app/lib/sync/server";

/**
 * Stores each sync space as a JSON file. Writes go to a temp file first and
 * are renamed into place, so a crash never leaves a half-written file. The
 * version check is only safe within one process; use the Postgres repository
 * when several server instances share the data.
 */
export function createFileRepository(dir: string): SyncRepository {
  const fileFor = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid space id");
    return path.join(dir, `${id}.json`);
  };

  const read = async (id: string) => {
    try {
      return parseSpace(JSON.parse(await readFile(fileFor(id), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  return {
    get: read,
    async put(id, space, expected) {
      const current = await read(id);
      if ((current?.version ?? null) !== expected) return false;
      await mkdir(dir, { recursive: true });
      const file = fileFor(id);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(space), "utf8");
      await rename(tmp, file);
      return true;
    },
    async delete(id) {
      await rm(fileFor(id), { force: true });
    },
  };
}
