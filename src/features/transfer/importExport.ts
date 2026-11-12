import type { Note, NotesData } from "@/features/notes/model/types";
import { parseData } from "@/features/notes/model/schema";
import { todayLocalISO } from "@/shared/lib/text";
import type { BackupAttachment } from "@/features/transfer/backupAttachments";

export const BACKUP_APP = "notevoid";
/** 3 added the optional `attachments` list. */
export const BACKUP_VERSION = 3;
/** Files larger than this are rejected instead of freezing the tab. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  notes: NotesData["notes"];
  folders: NotesData["folders"];
  /** Pictures and files the notes refer to; absent when there are none. */
  attachments?: BackupAttachment[];
}

export function createBackup(
  data: NotesData,
  now: Date = new Date(),
  attachments: BackupAttachment[] = []
): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: data.notes,
    folders: data.folders,
    ...(attachments.length > 0 && { attachments }),
  };
}

export function backupFileName(now: Date = new Date()): string {
  return `notevoid-backup-${todayLocalISO(now)}.json`;
}

export function archiveFileName(now: Date = new Date()): string {
  return `notevoid-notes-${todayLocalISO(now)}.zip`;
}

export class ImportError extends Error {}

/** Validates a backup file. Throws ImportError with a user-facing message. */
export function parseBackup(text: string): NotesData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("This file is not valid JSON.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { app?: unknown }).app !== BACKUP_APP
  ) {
    throw new ImportError("This is not a NoteVoid backup.");
  }
  const data = parseData(parsed);
  // Tombstones are device state; a backup only adds or restores notes.
  return { ...data, tombstones: {} };
}

/** Builds a note from a Markdown file: the first heading or the file name is the title. */
export function noteFromMarkdown(
  fileName: string,
  text: string,
  id: string,
  now: number
): Note {
  const content = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(content.split("\n").slice(0, 20).join("\n"));
  const fromName = fileName.replace(/\.(md|markdown|mdown|txt)$/i, "").trim();
  return {
    id,
    title: (heading?.[1] ?? fromName).slice(0, 200) || "Untitled",
    content,
    pinned: false,
    tags: [],
    folderId: null,
    createdAt: now,
    updatedAt: now,
    editedAt: now,
    editedBy: null,
    trashedAt: null,
    conflictOf: null,
  };
}

export const MARKDOWN_EXTENSIONS = /\.(md|markdown|mdown|txt)$/i;

export function isMarkdownFile(file: { name: string; type: string }): boolean {
  return MARKDOWN_EXTENSIONS.test(file.name) || file.type === "text/markdown";
}
