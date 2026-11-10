import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseData } from "@/app/lib/notes/storage";
import type { SyncRepository } from "@/app/lib/sync/server";

/**
 * Stores each sync space as a JSON file. Writes go to a temp file first and
 * are renamed into place, so a crash never leaves a half-written file.
 */
export function createFileRepository(dir: string): SyncRepository {
  const fileFor = (id: string) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid space id");
    return path.join(dir, `${id}.json`);
  };

  return {
    async get(id) {
      try {
        return parseData(JSON.parse(await readFile(fileFor(id), "utf8")));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(id, data) {
      await mkdir(dir, { recursive: true });
      const file = fileFor(id);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(data), "utf8");
      await rename(tmp, file);
    },
  };
}
