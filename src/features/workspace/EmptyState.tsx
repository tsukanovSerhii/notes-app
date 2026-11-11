"use client";

import Button from "@/shared/ui/Button";
import Icon from "@/shared/ui/Icon";
import { useI18n } from "@/shared/i18n";

/** Shown when no note is open. */
export function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 items-center justify-center bg-bg-surface/35 p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-bg-elevated text-accent">
          <Icon name="fileText" size={22} />
        </div>
        <h2 className="text-base text-text-primary">{t.empty.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.empty.text}</p>
        <Button variant="primary" onClick={onCreate} className="mt-5">
          <Icon name="plus" strokeWidth={2.4} />
          {t.sidebar.newNote}
        </Button>
        <p className="mt-3 text-xs text-text-muted">
          {t.empty.orPress} <kbd className="rounded border border-border px-1.5 font-mono">Alt + N</kbd>
        </p>
      </div>
    </section>
  );
}

/** Shown until the notes have loaded from storage. */
export function WorkspaceSkeleton() {
  const { t } = useI18n();
  return (
    <section aria-label={t.editor.loading} aria-busy className="flex-1 animate-pulse space-y-3 bg-bg-surface/35 p-6">
      <div className="h-6 w-1/3 rounded bg-bg-elevated" />
      <div className="h-4 w-2/3 rounded bg-bg-elevated" />
      <div className="h-4 w-1/2 rounded bg-bg-elevated" />
    </section>
  );
}
