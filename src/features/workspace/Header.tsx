"use client";

import type { ReactNode } from "react";
import Icon from "@/shared/ui/Icon";
import { useI18n } from "@/shared/i18n";

/** The top bar: menu button on phones, the logo, and the actions on the right. */
export default function Header({ onOpenDrawer, children }: { onOpenDrawer: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-surface/45 px-3 py-2.5 sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={t.header.openList}
        className="rounded-md p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
      >
        <Icon name="menu" size={20} />
      </button>
      <h1 className="text-lg font-semibold tracking-tight text-text-primary">
        Note<span className="text-accent">Void</span>
      </h1>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">{children}</div>
    </header>
  );
}
