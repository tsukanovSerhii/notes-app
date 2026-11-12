"use client";

import { useEffect } from "react";
import { referencedIds } from "@/features/attachments/attachments";
import { collectUnused } from "@/features/attachments/ingest";
import { attachmentStore } from "@/features/attachments/localAttachments";
import { noteHistory } from "@/features/history/noteHistory";
import type { Note } from "@/features/notes/model/types";

/**
 * Once the notes have loaded, removes stored files that no note (live or in
 * the trash) and no saved version shows any more, if they are over a week old.
 */
export function useAttachmentCleanup(hydrated: boolean, getNotes: () => readonly Note[]) {
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const referenced = referencedIds([...getNotes().map((n) => n.content), ...(await noteHistory.contents())]);
      if (!cancelled) await collectUnused(attachmentStore, referenced, Date.now());
    })().catch(() => {
      // Cleanup is housekeeping; it runs again on the next start.
    });
    return () => {
      cancelled = true;
    };
    // Once per start: the notes at that moment are what decides what is kept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
}
