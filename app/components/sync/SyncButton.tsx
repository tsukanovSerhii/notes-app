"use client";

import Icon from "@/app/components/ui/Icon";
import type { SyncSnapshot } from "@/app/lib/sync/client";
import { cn } from "@/app/lib/cn";

const LABEL: Record<SyncSnapshot["state"], string> = {
  off: "Sync is off",
  idle: "Synced",
  syncing: "Syncing…",
  offline: "Offline — will sync later",
  error: "Sync failed",
};

/** "Sync is paused: too many requests, retrying in 12 s" while rate limited. */
export function syncLabel(sync: SyncSnapshot, now = Date.now()): string {
  if (sync.state === "error" && sync.retryAt !== null) {
    const seconds = Math.max(1, Math.ceil((sync.retryAt - now) / 1000));
    return `Sync paused: too many requests, retrying in ${seconds} s`;
  }
  return LABEL[sync.state];
}

export default function SyncButton({
  sync,
  onClick,
}: {
  sync: SyncSnapshot;
  onClick: () => void;
}) {
  const label = syncLabel(sync);
  const limited = sync.state === "error" && sync.retryAt !== null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sync settings: ${label}`}
      title={label}
      data-sync-state={limited ? "limited" : sync.state}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-md border border-border transition-colors",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
        sync.state === "off" && "text-text-muted hover:text-text-primary",
        sync.state === "idle" && "text-accent",
        sync.state === "syncing" && "text-accent",
        sync.state === "offline" && "text-amber-300",
        sync.state === "error" && (limited ? "text-amber-300" : "text-red-400")
      )}
    >
      {sync.state === "syncing" ? (
        <Icon name="refresh" className="animate-spin" />
      ) : (
        <Icon name={sync.state === "off" || sync.state === "offline" ? "cloudOff" : "cloud"} />
      )}
      {sync.state === "error" && (
        <span
          className={cn(
            "absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
            limited ? "bg-amber-300" : "bg-red-400"
          )}
        />
      )}
    </button>
  );
}
