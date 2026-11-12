"use client";

import { Fragment, useState } from "react";
import type { Folder } from "@/features/notes/model/types";
import Icon, { type IconName } from "@/shared/ui/Icon";
import { NOTE_DRAG_TYPE } from "@/features/library/NoteItem";
import { folderRows } from "@/features/notes/model/folders";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

/** The drag type of a folder being moved in the tree. */
export const FOLDER_DRAG_TYPE = "application/x-notevoid-folder";

export interface LibraryFilter {
  folderId: string | null;
  tag: string | null;
  /** Shows the trash instead of the library; folder and tag are ignored. */
  trash: boolean;
}

interface LibraryNavProps {
  folders: Folder[];
  folderCounts: Map<string, number>;
  tags: { tag: string; count: number }[];
  totalCount: number;
  trashCount: number;
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onManageTags: () => void;
  /** A folder dropped on a folder, or on "All notes" (null) to move it to the top level. */
  onMoveFolder: (id: string, parentId: string | null) => void;
  /** A note dropped on a row: into a folder (or out of folders with null), or the trash. */
  onDropNote: (noteId: string, target: { folderId: string | null } | "trash") => void;
}

export default function LibraryNav({
  folders,
  folderCounts,
  tags,
  totalCount,
  trashCount,
  filter,
  onFilterChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onManageTags,
  onMoveFolder,
  onDropNote,
}: LibraryNavProps) {
  const { t } = useI18n();
  /** Where a new folder is being named: "top", a folder id, or nowhere. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rows = folderRows(folders);
  const creatingAt = (parent: string | null) => parent === (creatingIn === "top" ? null : creatingIn);

  return (
    <nav aria-label={t.library.label} className="space-y-3 px-2 pb-3">
      <ul className="space-y-0.5">
        <NavRow
          icon="fileText"
          label={t.sidebar.allNotes}
          count={totalCount}
          active={!filter.folderId && !filter.trash}
          onClick={() => onFilterChange({ ...filter, folderId: null, trash: false })}
          onDropNote={(id) => onDropNote(id, { folderId: null })}
          onDropFolder={(id) => onMoveFolder(id, null)}
        />
        {rows.map(({ folder, depth }) => (
          <Fragment key={folder.id}>
          {editingId === folder.id ? (
            <li style={{ paddingLeft: depth * 12 }}>
              <NameInput
                initial={folder.name}
                label={t.library.folderName}
                onSubmit={(name) => {
                  onRenameFolder(folder.id, name);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <NavRow
              key={folder.id}
              icon="folder"
              label={folder.name}
              count={folderCounts.get(folder.id) ?? 0}
              active={filter.folderId === folder.id && !filter.trash}
              onClick={() => onFilterChange({ ...filter, folderId: folder.id, trash: false })}
              depth={depth}
              dragFolderId={folder.id}
              onDropNote={(id) => onDropNote(id, { folderId: folder.id })}
              onDropFolder={(id) => onMoveFolder(id, folder.id)}
              actions={
                <>
                  <RowAction label={t.library.newSubfolder(folder.name)} icon="folderPlus" onClick={() => setCreatingIn(folder.id)} />
                  <RowAction label={t.library.rename(folder.name)} icon="pencil" onClick={() => setEditingId(folder.id)} />
                  <RowAction
                    label={t.library.deleteFolder(folder.name)}
                    icon="trash"
                    onClick={() => {
                      if (filter.folderId === folder.id) onFilterChange({ ...filter, folderId: null });
                      onDeleteFolder(folder.id);
                    }}
                  />
                </>
              }
            />
          )}
          {creatingAt(folder.id) && creatingIn === folder.id && (
            <li style={{ paddingLeft: (depth + 1) * 12 }}>
              <NameInput
                initial=""
                label={t.library.newSubfolder(folder.name)}
                onSubmit={(name) => {
                  onCreateFolder(name, folder.id);
                  setCreatingIn(null);
                }}
                onCancel={() => setCreatingIn(null)}
              />
            </li>
          )}
          </Fragment>
        ))}
        <NavRow
          icon="trash"
          label={t.sidebar.trash}
          count={trashCount}
          active={filter.trash}
          onClick={() => onFilterChange({ folderId: null, tag: null, trash: true })}
          onDropNote={(id) => onDropNote(id, "trash")}
        />
        <li>
          {creatingIn === "top" ? (
            <NameInput
              initial=""
              label={t.library.newFolderName}
              onSubmit={(name) => {
                onCreateFolder(name, null);
                setCreatingIn(null);
              }}
              onCancel={() => setCreatingIn(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreatingIn("top")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
            >
              <Icon name="folderPlus" size={14} />
              {t.library.newFolder}
            </button>
          )}
        </li>
      </ul>

      {tags.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between px-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t.library.tags}</p>
            <button
              type="button"
              onClick={onManageTags}
              aria-label={t.library.manageTags}
              title={t.library.manageTags}
              className="rounded p-0.5 text-text-muted transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
            >
              <Icon name="pencil" size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 px-1" role="group" aria-label={t.library.filterByTag}>
            {tags.map(({ tag, count }) => {
              const active = filter.tag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange({ ...filter, tag: active ? null : tag, trash: false })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
                    active
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-border text-text-secondary hover:border-accent hover:text-accent"
                  )}
                >
                  #{tag} <span className="text-text-muted">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavRow({
  icon,
  label,
  count,
  active,
  onClick,
  actions,
  onDropNote,
  onDropFolder,
  dragFolderId,
  depth = 0,
}: {
  icon: IconName;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  actions?: React.ReactNode;
  onDropNote?: (noteId: string) => void;
  onDropFolder?: (folderId: string) => void;
  /** Makes this row draggable as that folder. */
  dragFolderId?: string;
  depth?: number;
}) {
  const [over, setOver] = useState(false);
  const accepts = (e: React.DragEvent) =>
    (!!onDropNote && e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) ||
    (!!onDropFolder && e.dataTransfer.types.includes(FOLDER_DRAG_TYPE));
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        onDragOver={(e) => {
          if (!accepts(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          if (!accepts(e)) return;
          e.preventDefault();
          const folderId = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
          if (folderId) return onDropFolder?.(folderId);
          const id = e.dataTransfer.getData(NOTE_DRAG_TYPE);
          if (id) onDropNote?.(id);
        }}
        draggable={dragFolderId !== undefined}
        onDragStart={(e) => {
          if (dragFolderId === undefined) return;
          e.dataTransfer.setData(FOLDER_DRAG_TYPE, dragFolderId);
          e.dataTransfer.effectAllowed = "move";
        }}
        style={{ paddingLeft: 8 + depth * 12 }}
        data-drop-over={over || undefined}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          active ? "bg-accent-glow text-accent" : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
          over && "ring-2 ring-inset ring-accent"
        )}
      >
        <Icon name={icon} size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn("text-[11px] text-text-muted", actions && "group-focus-within:invisible group-hover:invisible")}>
          {count}
        </span>
      </button>
      {actions && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {actions}
        </div>
      )}
    </li>
  );
}

function RowAction({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-text-muted hover:bg-bg-base/60 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
    >
      <Icon name={icon} size={12} />
    </button>
  );
}

function NameInput({
  initial,
  label,
  onSubmit,
  onCancel,
}: {
  initial: string;
  label: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const submit = () => (value.trim() ? onSubmit(value) : onCancel());
  return (
    <input
      autoFocus
      value={value}
      aria-label={label}
      placeholder={t.library.folderName}
      maxLength={60}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={submit}
      className="w-full rounded-md border border-accent bg-bg-base/60 px-2 py-1.5 text-sm text-text-primary outline-none"
    />
  );
}
