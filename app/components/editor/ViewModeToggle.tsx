"use client";

import Icon, { type IconName } from "@/app/components/ui/Icon";
import { cn } from "@/app/lib/cn";

export type ViewMode = "edit" | "split" | "preview";

const MODES: { mode: ViewMode; label: string; icon: IconName }[] = [
  { mode: "edit", label: "Edit", icon: "pencil" },
  { mode: "split", label: "Split", icon: "columns" },
  { mode: "preview", label: "Preview", icon: "eye" },
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
  return (
    <div
      role="group"
      aria-label="View mode"
      className="flex rounded-lg border border-border bg-bg-base/60 p-0.5"
    >
      {MODES.filter((m) => allowSplit || m.mode !== "split").map(
        ({ mode, label, icon }) => (
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
        )
      )}
    </div>
  );
}
