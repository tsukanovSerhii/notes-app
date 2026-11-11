export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  tags: string[];
  folderId: string | null;
  createdAt: number;
  /** Version stamp for sync: bumped by every change, including pin and moves. */
  updatedAt: number;
  /** When the title or text last changed; what the UI shows and sorts by. */
  editedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** id -> deletion time. Lets a deletion win over an older copy during sync. */
export type Tombstones = Record<string, number>;

/** Everything that is persisted and synced. */
export interface NotesData {
  notes: Note[];
  folders: Folder[];
  tombstones: Tombstones;
}

export type NotePatch = Partial<
  Pick<Note, "title" | "content" | "tags" | "folderId">
>;
