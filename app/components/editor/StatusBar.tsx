"use client";

import { useMemo } from "react";
import Icon from "@/app/components/ui/Icon";
import type { SaveStatus } from "@/app/lib/notes/store";
import { getTextStats } from "@/app/lib/text";
import { cn } from "@/app/lib/cn";

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  pending: "Saving…",
  error: "Not saved — storage is full or blocked",
};

export default function StatusBar({
  content,
  saveStatus,
}: {
  content: string;
  saveStatus: SaveStatus;
}) {
  const { words, chars, readingMinutes } = useMemo(
    () => getTextStats(content),
    [content]
  );

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1.5 text-[11px] text-text-muted sm:px-6">
      <span className="truncate">
        {words} {words === 1 ? "word" : "words"} · {chars} chars
        {readingMinutes > 0 && ` · ${readingMinutes} min read`}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1",
          saveStatus === "error" && "text-red-400"
        )}
      >
        {saveStatus === "saved" && <Icon name="check" size={12} />}
        {saveStatus === "error" && <Icon name="alert" size={12} />}
        {SAVE_LABEL[saveStatus]}
      </span>
    </div>
  );
}
