"use client";

import type { PaletteCommand } from "@/features/palette/CommandPalette";
import type { ThemeChoice } from "@/features/theme/theme";
import { setLocale, useI18n } from "@/shared/i18n";

/** Everything the command palette can run. Note-specific commands only appear while a note is open. */
export function useCommands({
  hasOpenNote,
  newNote,
  focusSearch,
  cycleViewMode,
  showHistory,
  openGraph,
  openShortcuts,
  manageTags,
  exportPdf,
  exportMarkdown,
  downloadBackup,
  exportZip,
  openSync,
  openTrash,
  setTheme,
}: {
  hasOpenNote: boolean;
  newNote: () => void;
  focusSearch: () => void;
  cycleViewMode: () => void;
  showHistory: () => void;
  openGraph: () => void;
  openShortcuts: () => void;
  manageTags: () => void;
  exportPdf: () => void;
  exportMarkdown: () => void;
  downloadBackup: () => void;
  exportZip: () => void;
  openSync: () => void;
  openTrash: () => void;
  setTheme: (theme: ThemeChoice) => void;
}): PaletteCommand[] {
  const { t, locale } = useI18n();
  const forNote: PaletteCommand[] = [
    { id: "view", label: t.palette.toggleView, icon: "columns", run: cycleViewMode },
    { id: "history", label: t.palette.history, icon: "history", run: showHistory },
    { id: "pdf", label: t.palette.exportPdf, icon: "download", run: exportPdf },
    { id: "md", label: t.palette.exportMarkdown, icon: "fileText", run: exportMarkdown },
  ];
  return [
    { id: "new", label: t.palette.newNote, icon: "plus", run: newNote },
    { id: "search", label: t.palette.search, icon: "search", run: focusSearch },
    ...(hasOpenNote ? forNote : []),
    { id: "graph", label: t.palette.graph, icon: "link", run: openGraph },
    { id: "tags", label: t.palette.manageTags, icon: "tag", run: manageTags },
    { id: "shortcuts", label: t.palette.shortcuts, icon: "keyboard", run: openShortcuts },
    { id: "backup", label: t.palette.backup, icon: "database", run: downloadBackup },
    { id: "zip", label: t.palette.exportZip, icon: "fileText", run: exportZip },
    { id: "sync", label: t.palette.sync, icon: "cloud", run: openSync },
    { id: "trash", label: t.palette.trash, icon: "trash", run: openTrash },
    { id: "light", label: t.palette.themeLight, icon: "eye", run: () => setTheme("light") },
    { id: "dark", label: t.palette.themeDark, icon: "eye", run: () => setTheme("dark") },
    { id: "system", label: t.palette.themeSystem, icon: "eye", run: () => setTheme("system") },
    { id: "language", label: t.palette.language, icon: "more", run: () => setLocale(locale === "uk" ? "en" : "uk") },
  ];
}
