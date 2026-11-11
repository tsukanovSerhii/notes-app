"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";

/** Asks for a second click before deleting every trashed note for good. */
export default function EmptyTrashButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal transition-colors",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
        armed ? "bg-red-500/20 text-red-300" : "text-text-muted hover:text-red-300"
      )}
    >
      {armed ? t.sidebar.emptyTrashConfirm : t.sidebar.emptyTrash}
    </button>
  );
}
