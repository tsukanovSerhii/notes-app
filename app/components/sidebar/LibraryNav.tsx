"use client";

import { useState } from "react";
import type { Folder } from "@/app/types/note";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { cn } from "@/app/lib/cn";

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
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
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
}: LibraryNavProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <nav aria-label="Library" className="space-y-3 px-2 pb-3">
      <ul className="space-y-0.5">
        <NavRow
          icon="fileText"
          label="All notes"
          count={totalCount}
          active={!filter.folderId && !filter.trash}
          onClick={() => onFilterChange({ ...filter, folderId: null, trash: false })}
        />
        {folders.map((folder) =>
          editingId === folder.id ? (
            <li key={folder.id}>
              <NameInput
                initial={folder.name}
                label="Folder name"
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
              actions={
                <>
                  <RowAction label={`Rename ${folder.name}`} icon="pencil" onClick={() => setEditingId(folder.id)} />
                  <RowAction
                    label={`Delete folder ${folder.name}`}
                    icon="trash"
                    onClick={() => {
                      if (filter.folderId === folder.id) onFilterChange({ ...filter, folderId: null });
                      onDeleteFolder(folder.id);
                    }}
                  />
                </>
              }
            />
          )
        )}
        <NavRow
          icon="trash"
          label="Trash"
          count={trashCount}
          active={filter.trash}
          onClick={() => onFilterChange({ folderId: null, tag: null, trash: true })}
        />
        <li>
          {creating ? (
            <NameInput
              initial=""
              label="New folder name"
              onSubmit={(name) => {
                onCreateFolder(name);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
            >
              <Icon name="folderPlus" size={14} />
              New folder
            </button>
          )}
        </li>
      </ul>

      {tags.length > 0 && (
        <div>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Tags
          </p>
          <div className="flex flex-wrap gap-1 px-1" role="group" aria-label="Filter by tag">
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
}: {
  icon: IconName;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          active ? "bg-accent-glow text-accent" : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
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
  const [value, setValue] = useState(initial);
  const submit = () => (value.trim() ? onSubmit(value) : onCancel());
  return (
    <input
      autoFocus
      value={value}
      aria-label={label}
      placeholder="Folder name"
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
