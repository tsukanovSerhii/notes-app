"use client";

import type { Ref } from "react";
import Icon from "@/app/components/ui/Icon";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

export default function SearchBar({ value, onChange, ref }: SearchBarProps) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder="Search notes..."
        aria-label="Search notes"
        className="w-full rounded-md border border-border bg-bg-base/60 py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text-primary"
        >
          <Icon name="x" size={14} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[10px] text-text-muted">
          /
        </kbd>
      )}
    </div>
  );
}
