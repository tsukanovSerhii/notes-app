import type { Note, NotePatch } from "@/app/types/note";

export interface NotesState {
  notes: Note[];
  activeId: string | null;
  /** The most recently deleted note, kept so the deletion can be undone. */
  lastDeleted: Note | null;
}

export type NotesAction =
  | { type: "replace"; notes: Note[]; activeId: string | null }
  | { type: "create"; note: Note }
  | { type: "update"; id: string; patch: NotePatch; now: number }
  | { type: "delete"; id: string }
  | { type: "undoDelete" }
  | { type: "togglePin"; id: string }
  | { type: "select"; id: string | null };

export const initialNotesState: NotesState = {
  notes: [],
  activeId: null,
  lastDeleted: null,
};

/** Pinned notes first, then most recently edited. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
  );
}

export function filterNotes(notes: readonly Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...notes];
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
}

export function notesReducer(
  state: NotesState,
  action: NotesAction
): NotesState {
  switch (action.type) {
    case "replace": {
      const activeId = action.notes.some((n) => n.id === action.activeId)
        ? action.activeId
        : (sortNotes(action.notes)[0]?.id ?? null);
      return { ...state, notes: action.notes, activeId };
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
        const next = { ...n, ...action.patch };
        if (next.title === n.title && next.content === n.content) return n;
        changed = true;
        return { ...next, updatedAt: action.now };
      });
      return changed ? { ...state, notes } : state;
    }

    case "delete": {
      const target = state.notes.find((n) => n.id === action.id);
      if (!target) return state;
      const notes = state.notes.filter((n) => n.id !== action.id);
      const activeId =
        state.activeId === action.id
          ? (sortNotes(notes)[0]?.id ?? null)
          : state.activeId;
      return { notes, activeId, lastDeleted: target };
    }

    case "undoDelete": {
      const note = state.lastDeleted;
      if (!note || state.notes.some((n) => n.id === note.id)) {
        return { ...state, lastDeleted: null };
      }
      return {
        notes: [...state.notes, note],
        activeId: note.id,
        lastDeleted: null,
      };
    }

    case "togglePin":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, pinned: !n.pinned } : n
        ),
      };

    case "select":
      if (action.id === state.activeId) return state;
      if (action.id !== null && !state.notes.some((n) => n.id === action.id)) {
        return state;
      }
      return { ...state, activeId: action.id };
  }
}
