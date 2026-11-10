export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NotePatch = Partial<Pick<Note, "title" | "content">>;
