"use client";

import { useRef, useState } from "react";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { useDismiss } from "@/app/hooks/useDismiss";
import { cn } from "@/app/lib/cn";

interface AppMenuProps {
  onImportMarkdown: (files: File[]) => void;
  onImportBackup: (file: File) => void;
  onDownloadBackup: () => void;
  onOpenSync: () => void;
}

export default function AppMenu({
  onImportMarkdown,
  onImportBackup,
  onDownloadBackup,
  onOpenSync,
}: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mdInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  useDismiss(ref, open, close);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border border-border transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          open ? "bg-accent-glow text-accent" : "text-text-muted hover:text-text-primary"
        )}
      >
        <Icon name="more" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-border bg-bg-elevated p-1 shadow-xl"
        >
          <MenuItem icon="upload" label="Import Markdown files…" onSelect={() => mdInput.current?.click()} close={close} />
          <MenuItem icon="database" label="Restore from backup…" onSelect={() => backupInput.current?.click()} close={close} />
          <MenuItem icon="download" label="Download backup (.json)" onSelect={onDownloadBackup} close={close} />
          <div className="my-1 h-px bg-border" />
          <MenuItem icon="cloud" label="Sync settings…" onSelect={onOpenSync} close={close} />
        </div>
      )}

      <input
        ref={mdInput}
        type="file"
        accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
        multiple
        hidden
        data-testid="import-markdown"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onImportMarkdown(files);
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-backup"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onImportBackup(file);
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onSelect,
  close,
}: {
  icon: IconName;
  label: string;
  onSelect: () => void;
  close: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        close();
        onSelect();
      }}
      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
