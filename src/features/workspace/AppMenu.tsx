"use client";

import { useRef, useState } from "react";
import Icon, { type IconName } from "@/shared/ui/Icon";
import { useDismiss } from "@/shared/hooks/useDismiss";
import { cn } from "@/shared/lib/cn";
import { LOCALES, LOCALE_NAMES, setLocale, useI18n } from "@/shared/i18n";
import { useTheme } from "@/features/theme/ThemeController";

interface AppMenuProps {
  onImportMarkdown: (files: File[]) => void;
  onImportFolder: (files: File[]) => void;
  onImportBackup: (file: File) => void;
  onDownloadBackup: () => void;
  onOpenSync: () => void;
}

export default function AppMenu({
  onImportMarkdown,
  onImportFolder,
  onImportBackup,
  onDownloadBackup,
  onOpenSync,
}: AppMenuProps) {
  const { t, locale } = useI18n();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mdInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  useDismiss(ref, open, close);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.header.moreActions}
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
          <MenuItem icon="upload" label={t.menu.importMarkdown} onSelect={() => mdInput.current?.click()} close={close} />
          <MenuItem icon="folder" label={t.menu.importFolder} onSelect={() => folderInput.current?.click()} close={close} />
          <MenuItem icon="database" label={t.menu.restoreBackup} onSelect={() => backupInput.current?.click()} close={close} />
          <MenuItem icon="download" label={t.menu.downloadBackup} onSelect={onDownloadBackup} close={close} />
          <div className="my-1 h-px bg-border" />
          <MenuItem icon="cloud" label={t.menu.syncSettings} onSelect={onOpenSync} close={close} />
          <div className="my-1 border-t border-border" role="separator" />
          <div role="group" aria-label={t.menu.theme} className="flex gap-1 px-1.5 py-1">
            {(["system", "light", "dark"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={theme === c}
                onClick={() => setTheme(c)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
                  theme === c ? "bg-accent-glow text-accent" : "text-text-muted hover:text-text-primary"
                )}
              >
                {t.menu[c === "system" ? "themeSystem" : c === "light" ? "themeLight" : "themeDark"]}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t.menu.language} className="flex gap-1 px-1.5 py-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={locale === l}
                lang={l}
                onClick={() => setLocale(l)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
                  locale === l ? "bg-accent-glow text-accent" : "text-text-muted hover:text-text-primary"
                )}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
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
        ref={folderInput}
        type="file"
        // Not in React's typings, but how browsers expose "pick a folder".
        {...{ webkitdirectory: "", directory: "" }}
        multiple
        hidden
        data-testid="import-folder"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onImportFolder(files);
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
