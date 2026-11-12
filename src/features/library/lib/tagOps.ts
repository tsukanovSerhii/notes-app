import { normalizeTag, normalizeTags } from "@/features/notes/model/schema";
import type { Note } from "@/features/notes/model/types";

export interface TagPatch {
  id: string;
  tags: string[];
}

/**
 * The tag lists to write so that every note tagged `from` is tagged `to`
 * instead (or just loses `from` when `to` is null). A note that already has
 * `to` ends up with it once, which is how two tags are merged. Notes without
 * `from` are not listed. The trash is included: restoring a note must not
 * bring back a tag that was renamed or deleted.
 */
export function retag(notes: readonly Pick<Note, "id" | "tags">[], from: string, to: string | null): TagPatch[] {
  const source = normalizeTag(from);
  const target = to === null ? null : normalizeTag(to);
  const patches: TagPatch[] = [];
  for (const note of notes) {
    if (!note.tags.includes(source)) continue;
    const next = normalizeTags(
      note.tags.flatMap((tag) => (tag !== source ? [tag] : target ? [target] : []))
    );
    patches.push({ id: note.id, tags: next });
  }
  return patches;
}
