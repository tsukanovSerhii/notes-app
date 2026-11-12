import type { Folder, Note } from "@/features/notes/model/types";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import { todayLocalISO } from "@/shared/lib/text";

/** Notes in a top-level folder with this name are the user's own templates. */
export const TEMPLATES_FOLDER = "Templates";

export function templatesFolder(folders: readonly Folder[]): Folder | null {
  return (
    folders.find((f) => f.parentId === null && f.name.trim().toLowerCase() === TEMPLATES_FOLDER.toLowerCase()) ?? null
  );
}

/** `{{date}}` becomes today's date (YYYY-MM-DD) and `{{time}}` the current time (HH:MM). */
export function fillTemplate(text: string, now: Date = new Date()): string {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return text.replace(/\{\{\s*date\s*\}\}/gi, todayLocalISO(now)).replace(/\{\{\s*time\s*\}\}/gi, time);
}

/** The live notes in the Templates folder, as templates, by title. */
export function userTemplates(notes: readonly Note[], folders: readonly Folder[]): NoteTemplate[] {
  const folder = templatesFolder(folders);
  if (!folder) return [];
  return notes
    .filter((n) => n.folderId === folder.id && n.trashedAt === null)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => ({
      id: `note:${n.id}`,
      label: n.title.trim() || "Untitled",
      title: n.title.trim(),
      body: () => fillTemplate(n.content),
      custom: true as const,
    }));
}
