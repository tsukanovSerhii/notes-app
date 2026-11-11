import type { Folder, Note, NotePatch, NotesData, Tombstones } from "@/app/types/note";
import { mergeData, reviveImported } from "@/app/lib/notes/merge";
import { normalizeTags } from "@/app/lib/notes/storage";

export interface NotesState {
  notes: Note[];
  folders: Folder[];
  tombstones: Tombstones;
  activeId: string | null;
  /** The most recently deleted note, kept so the deletion can be undone. */
  lastDeleted: Note | null;
}

export type NotesAction =
  | { type: "replace"; data: NotesData; activeId: string | null }
  | { type: "merge"; data: NotesData; mode: "sync" | "import"; now: number }
  | { type: "create"; note: Note }
  | { type: "update"; id: string; patch: NotePatch; now: number }
  | { type: "delete"; id: string; now: number }
  | { type: "undoDelete"; now: number }
  | { type: "togglePin"; id: string; now: number }
  | { type: "select"; id: string | null }
  | { type: "createFolder"; folder: Folder }
  | { type: "renameFolder"; id: string; name: string; now: number }
  | { type: "deleteFolder"; id: string; now: number };

export const initialNotesState: NotesState = {
  notes: [],
  folders: [],
  tombstones: {},
  activeId: null,
  lastDeleted: null,
};

export interface NoteFilter {
  query?: string;
  folderId?: string | null;
  tag?: string | null;
}

/** Pinned notes first, then most recently edited. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
  );
}

export function filterNotes(
  notes: readonly Note[],
  filter: NoteFilter | string = {}
): Note[] {
  const { query = "", folderId = null, tag = null } =
    typeof filter === "string" ? { query: filter } : filter;
  const q = query.trim().toLowerCase().replace(/^#/, "");
  return notes.filter(
    (n) =>
      (!folderId || n.folderId === folderId) &&
      (!tag || n.tags.includes(tag)) &&
      (!q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q)))
  );
}

/** Every tag in use, with the number of notes that carry it. */
export function collectTags(notes: readonly Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function toData(state: NotesState): NotesData {
  return { notes: state.notes, folders: state.folders, tombstones: state.tombstones };
}

function pickActive(notes: readonly Note[], preferred: string | null): string | null {
  return notes.some((n) => n.id === preferred)
    ? preferred
    : (sortNotes(notes)[0]?.id ?? null);
}

function withoutKey(record: Tombstones, key: string): Tombstones {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * The timestamp for a change to an entity last stamped `previous`. Always
 * later than `previous`, so an edit beats the version it was made on even if
 * that version came from a device whose clock ran ahead.
 */
export function stamp(previous: number, now: number): number {
  return Math.max(now, previous + 1);
}

function sameTags(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

export function notesReducer(state: NotesState, action: NotesAction): NotesState {
  switch (action.type) {
    case "replace":
      return {
        ...state,
        ...action.data,
        activeId: pickActive(action.data.notes, action.activeId),
      };

    case "merge": {
      const local = toData(state);
      const merged =
        action.mode === "import"
          ? reviveImported(local, action.data, action.now)
          : mergeData(local, action.data);
      // Keep object identity for unchanged notes so memoised rows don't re-render.
      const prev = new Map(state.notes.map((n) => [n.id, n]));
      const notes = merged.notes.map((n) => {
        const old = prev.get(n.id);
        return old && old.updatedAt === n.updatedAt ? old : n;
      });
      return {
        ...state,
        notes,
        folders: merged.folders,
        tombstones: merged.tombstones,
        activeId: pickActive(notes, state.activeId),
      };
    }

    case "create":
      return {
        ...state,
        notes: [action.note, ...state.notes],
        activeId: action.note.id,
      };

    case "update": {
      let changed = false;
      const notes = state.notes.map((n) => {
        if (n.id !== action.id) return n;
        const patch = { ...action.patch };
        if (patch.tags) patch.tags = normalizeTags(patch.tags);
        const next = { ...n, ...patch };
        if (
          next.title === n.title &&
          next.content === n.content &&
          next.folderId === n.folderId &&
          sameTags(next.tags, n.tags)
        ) {
          return n;
        }
        changed = true;
        return { ...next, updatedAt: stamp(n.updatedAt, action.now) };
      });
      return changed ? { ...state, notes } : state;
    }

    case "delete": {
      const target = state.notes.find((n) => n.id === action.id);
      if (!target) return state;
      const notes = state.notes.filter((n) => n.id !== action.id);
      return {
        ...state,
        notes,
        tombstones: { ...state.tombstones, [action.id]: stamp(target.updatedAt, action.now) },
        activeId:
          state.activeId === action.id ? pickActive(notes, null) : state.activeId,
        lastDeleted: target,
      };
    }

    case "undoDelete": {
      const note = state.lastDeleted;
      if (!note || state.notes.some((n) => n.id === note.id)) {
        return { ...state, lastDeleted: null };
      }
      const folderExists =
        !note.folderId || state.folders.some((f) => f.id === note.folderId);
      // A fresh updatedAt makes the restore win over the tombstone on other devices.
      const restored = {
        ...note,
        folderId: folderExists ? note.folderId : null,
        updatedAt: stamp(note.updatedAt, action.now),
      };
      return {
        ...state,
        notes: [...state.notes, restored],
        tombstones: withoutKey(state.tombstones, note.id),
        activeId: note.id,
        lastDeleted: null,
      };
    }

    case "togglePin":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, pinned: !n.pinned, updatedAt: stamp(n.updatedAt, action.now) } : n
        ),
      };

    case "select":
      if (action.id === state.activeId) return state;
      if (action.id !== null && !state.notes.some((n) => n.id === action.id)) {
        return state;
      }
      return { ...state, activeId: action.id };

    case "createFolder":
      return { ...state, folders: [...state.folders, action.folder] };

    case "renameFolder": {
      const name = action.name.trim().slice(0, 60);
      if (!name) return state;
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.id && f.name !== name
            ? { ...f, name, updatedAt: stamp(f.updatedAt, action.now) }
            : f
        ),
      };
    }

    case "deleteFolder": {
      const folder = state.folders.find((f) => f.id === action.id);
      if (!folder) return state;
      // Deleting a folder never deletes notes; they move out of it.
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        notes: state.notes.map((n) =>
          n.folderId === action.id
            ? { ...n, folderId: null, updatedAt: stamp(n.updatedAt, action.now) }
            : n
        ),
        tombstones: { ...state.tombstones, [action.id]: stamp(folder.updatedAt, action.now) },
      };
    }
  }
}
