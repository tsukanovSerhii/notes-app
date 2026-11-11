"use client";

import { useMemo } from "react";
import Icon from "@/shared/ui/Icon";
import type { SaveStatus } from "@/features/notes/state/store";
import { getTextStats } from "@/shared/lib/text";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

export default function StatusBar({
  content,
  saveStatus,
}: {
  content: string;
  saveStatus: SaveStatus;
}) {
  const { t, count } = useI18n();
  const { words, chars, readingMinutes } = useMemo(
    () => getTextStats(content),
    [content]
  );

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-1.5 text-[11px] text-text-muted sm:px-6">
      <span className="truncate">
        {count(words, t.plural.words)} · {t.status.chars(chars)}
        {readingMinutes > 0 && ` · ${t.status.minRead(readingMinutes)}`}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1",
          saveStatus === "error" && "text-red-400"
        )}
      >
        {saveStatus === "saved" && <Icon name="check" size={12} />}
        {saveStatus === "error" && <Icon name="alert" size={12} />}
        {t.status[saveStatus]}
      </span>
    </div>
  );
}
