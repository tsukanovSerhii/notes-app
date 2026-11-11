"use client";

import Icon, { type IconName } from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

export type ViewMode = "edit" | "split" | "preview";

/** edit → split → preview → edit; split is skipped on narrow screens. */
export function nextViewMode(mode: ViewMode, allowSplit: boolean): ViewMode {
  if (mode === "edit") return allowSplit ? "split" : "preview";
  return mode === "split" ? "preview" : "edit";
}

const MODES: { mode: ViewMode; icon: IconName }[] = [
  { mode: "edit", icon: "pencil" },
  { mode: "split", icon: "columns" },
  { mode: "preview", icon: "eye" },
];

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  allowSplit: boolean;
}

export default function ViewModeToggle({
  value,
  onChange,
  allowSplit,
}: ViewModeToggleProps) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t.view.label}
      className="flex rounded-lg border border-border bg-bg-base/60 p-0.5"
    >
      {MODES.filter((m) => allowSplit || m.mode !== "split").map(
        ({ mode, icon }) => {
          const label = t.view[mode];
          return (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            title={label}
            onClick={() => onChange(mode)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
              value === mode
                ? "bg-bg-elevated text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <Icon name={icon} size={14} />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </button>
          );
        }
      )}
    </div>
  );
}
