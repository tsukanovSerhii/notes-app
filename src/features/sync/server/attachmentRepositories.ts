import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentRepository } from "@/features/sync/server/attachmentHandler";

interface Chunk {
  parts: number;
  bytes: Uint8Array;
  at: number;
}

/** The files a space holds, with every part of each accounted for. */
function completeIds(chunks: { rid: string; index: number; parts: number }[], wanted?: string[]): string[] {
  const seen = new Map<string, { parts: number; indexes: Set<number> }>();
  for (const c of chunks) {
    const entry = seen.get(c.rid) ?? { parts: c.parts, indexes: new Set<number>() };
    entry.indexes.add(c.index);
    seen.set(c.rid, entry);
  }
  const ids = wanted ?? [...seen.keys()];
  return ids.filter((rid) => {
    const entry = seen.get(rid);
    return entry !== undefined && entry.indexes.size === entry.parts;
  });
}

/** Attachments in memory, for tests. */
export function createMemoryAttachmentRepository(now: () => number = Date.now): AttachmentRepository & {
  spaces: Map<string, Map<string, Chunk>>;
} {
  const spaces = new Map<string, Map<string, Chunk>>();
  const of = (space: string) => {
    let s = spaces.get(space);
    if (!s) spaces.set(space, (s = new Map()));
    return s;
  };
  const key = (rid: string, index: number) => `${rid}/${index}`;
  const rows = (space: string) =>
    [...of(space)].map(([k, c]) => {
      const [rid, index] = k.split("/");
      return { rid, index: Number(index), parts: c.parts, at: c.at, size: c.bytes.byteLength };
    });

  return {
    spaces,
    async putChunk(space, rid, index, parts, bytes, quota) {
      const s = of(space);
      const replaced = s.get(key(rid, index))?.bytes.byteLength ?? 0;
      const used = rows(space).reduce((sum, r) => sum + r.size, 0);
      if (used - replaced + bytes.byteLength > quota) return "quota";
      s.set(key(rid, index), { parts, bytes: new Uint8Array(bytes), at: now() });
      return "ok";
    },
    async getChunk(space, rid, index) {
      const c = of(space).get(key(rid, index));
      return c ? { bytes: c.bytes, parts: c.parts } : null;
    },
    async complete(space, rids) {
      return completeIds(rows(space), rids);
    },
    async prune(space, keep, cutoff) {
      const all = rows(space);
      const done = new Set(completeIds(all));
      const drop = new Set(
        all.filter((r) => r.at < cutoff && (!done.has(r.rid) || !keep.has(r.rid))).map((r) => r.rid)
      );
      for (const r of all) if (drop.has(r.rid)) of(space).delete(key(r.rid, r.index));
      return drop.size;
    },
    async purge(space) {
      spaces.delete(space);
    },
  };
}

/**
 * Attachments as files: `<dir>/<space>/<rid>.<index>.<parts>`. A chunk is
 * written to a temp file and renamed, so readers never see half a chunk.
 */
export function createFileAttachmentRepository(dir: string): AttachmentRepository {
  const spaceDir = (space: string) => {
    if (!/^[a-f0-9]{64}$/.test(space)) throw new Error("Invalid space id");
    return path.join(dir, space);
  };
  const NAME = /^([A-Za-z0-9_-]{43})\.(\d+)\.(\d+)$/;

  const list = async (space: string) => {
    let names: string[];
    try {
      names = await readdir(spaceDir(space));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const out: { rid: string; index: number; parts: number; name: string; size: number; at: number }[] = [];
    for (const name of names) {
      const m = NAME.exec(name);
      if (!m) continue;
      const info = await stat(path.join(spaceDir(space), name));
      out.push({ rid: m[1], index: Number(m[2]), parts: Number(m[3]), name, size: info.size, at: info.mtimeMs });
    }
    return out;
  };

  return {
    async putChunk(space, rid, index, parts, bytes, quota) {
      const existing = await list(space);
      const same = existing.find((f) => f.rid === rid && f.index === index);
      const used = existing.reduce((sum, f) => sum + f.size, 0) - (same?.size ?? 0);
      if (used + bytes.byteLength > quota) return "quota";
      const folder = spaceDir(space);
      await mkdir(folder, { recursive: true });
      // The data directory is chosen at run time; this is not a project file.
      const file = path.join(/*turbopackIgnore: true*/ folder, `${rid}.${index}.${parts}`);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, bytes);
      if (same && same.name !== path.basename(file)) await rm(path.join(folder, same.name), { force: true });
      await rename(tmp, file);
      return "ok";
    },
    async getChunk(space, rid, index) {
      const found = (await list(space)).find((f) => f.rid === rid && f.index === index);
      if (!found) return null;
      return { bytes: new Uint8Array(await readFile(path.join(spaceDir(space), found.name))), parts: found.parts };
    },
    async complete(space, rids) {
      return completeIds(await list(space), rids);
    },
    async prune(space, keep, cutoff) {
      const all = await list(space);
      const done = new Set(completeIds(all));
      const drop = new Set(
        all.filter((f) => f.at < cutoff && (!done.has(f.rid) || !keep.has(f.rid))).map((f) => f.rid)
      );
      for (const f of all) if (drop.has(f.rid)) await rm(path.join(spaceDir(space), f.name), { force: true });
      return drop.size;
    },
    async purge(space) {
      await rm(spaceDir(space), { recursive: true, force: true });
    },
  };
}
