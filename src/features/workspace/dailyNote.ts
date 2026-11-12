import type { Note } from "@/features/notes/model/types";

/** Tag put on the notes made by the Today button. */
export const DAILY_TAG = "daily";

/** The live note titled with this date (YYYY-MM-DD), if there is one; the oldest if several. */
export function findDailyNote(notes: readonly Note[], isoDate: string): Note | null {
  return (
    notes
      .filter((n) => n.trashedAt === null && n.title.trim() === isoDate)
      .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
  );
}
