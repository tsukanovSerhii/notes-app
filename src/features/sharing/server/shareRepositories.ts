import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShareRepository, StoredShare } from "@/features/sharing/server/shareHandler";

function valid(value: unknown): value is StoredShare {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.blob === "string" &&
    typeof v.deleteHash === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.expiresAt === "number"
  );
}

/** Shares in memory, for tests. */
export function createMemoryShareRepository(): ShareRepository & { shares: Map<string, StoredShare> } {
  const shares = new Map<string, StoredShare>();
  return {
    shares,
    async create(share) {
      if (shares.has(share.id)) return false;
      shares.set(share.id, { ...share });
      return true;
    },
    async get(id, now) {
      const share = shares.get(id);
      if (!share) return null;
      if (share.expiresAt <= now) {
        shares.delete(id);
        return null;
      }
      return { ...share };
    },
    async delete(id) {
      shares.delete(id);
    },
  };
}

/** One JSON file per share. */
export function createFileShareRepository(dir: string): ShareRepository {
  const fileFor = (id: string) => {
    if (!/^[A-Za-z0-9_-]{22}$/.test(id)) throw new Error("Invalid share id");
    return path.join(dir, `${id}.json`);
  };
  const read = async (id: string): Promise<StoredShare | null> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(fileFor(id), "utf8"));
      return valid(parsed) ? parsed : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    async create(share) {
      await mkdir(dir, { recursive: true });
      const file = fileFor(share.id);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFile(tmp, JSON.stringify(share), "utf8");
        // A hard link fails if the target exists, so an id cannot be taken over.
        await link(tmp, file);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      } finally {
        await rm(tmp, { force: true });
      }
    },
    async get(id, now) {
      const share = await read(id);
      if (!share) return null;
      if (share.expiresAt <= now) {
        await rm(fileFor(id), { force: true });
        return null;
      }
      return share;
    },
    async delete(id) {
      await rm(fileFor(id), { force: true });
    },
  };
}
