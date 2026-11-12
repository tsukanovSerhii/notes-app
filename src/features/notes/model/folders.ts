import type { Folder } from "@/features/notes/model/types";

/**
 * Folders form a tree through `parentId`. The data is replicated and merged
 * per folder, so two devices can leave it inconsistent: a folder whose parent
 * was deleted elsewhere, or two folders moved into each other. Nothing is
 * rewritten to repair that; every reader goes through these functions, which
 * treat a folder with a missing parent, or one caught in a cycle, as top level.
 */

export interface FolderRow {
  folder: Folder;
  depth: number;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const byName = (a: Folder, b: Folder) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id);

/** The parent that counts: it must exist and the chain above it must not loop back. */
function effectiveParents(folders: readonly Folder[]): Map<string, string | null> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parents = new Map<string, string | null>();
  for (const f of folders) {
    let parent = f.parentId && byId.has(f.parentId) && f.parentId !== f.id ? f.parentId : null;
    // Walk up; if we meet ourselves the chain is a cycle, so this folder becomes a root.
    for (let p = parent, steps = 0; p && steps <= folders.length; steps++) {
      if (p === f.id) {
        parent = null;
        break;
      }
      const next = byId.get(p)?.parentId;
      p = next && byId.has(next) ? next : null;
    }
    parents.set(f.id, parent);
  }
  return parents;
}

/** Folders depth-first, siblings by name, for drawing the tree. */
export function folderRows(folders: readonly Folder[]): FolderRow[] {
  const parents = effectiveParents(folders);
  const children = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = parents.get(f.id) ?? null;
    children.set(key, [...(children.get(key) ?? []), f]);
  }
  const out: FolderRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of (children.get(parent) ?? []).sort(byName)) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The folder and every folder below it, as ids. */
export function folderWithDescendants(folders: readonly Folder[], id: string): Set<string> {
  const parents = effectiveParents(folders);
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      const parent = parents.get(f.id);
      if (parent && out.has(parent) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** "Work / Projects / Web": where a folder sits, for pickers. */
export function folderPath(folders: readonly Folder[], id: string): string {
  const parents = effectiveParents(folders);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  for (let cur: string | null = id; cur; cur = parents.get(cur) ?? null) {
    const f = byId.get(cur);
    if (!f) break;
    names.unshift(f.name);
  }
  return names.join(" / ");
}

/** Whether `id` may be moved under `parentId`: not into itself or its own subtree. */
export function canMoveFolder(folders: readonly Folder[], id: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  if (!folders.some((f) => f.id === parentId) || !folders.some((f) => f.id === id)) return false;
  return !folderWithDescendants(folders, id).has(parentId);
}
