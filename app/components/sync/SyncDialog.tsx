"use client";

import { useState } from "react";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import { CopyButton } from "@/app/components/editor/CodeBlock";
import type { SyncClient, SyncSnapshot } from "@/app/lib/sync/client";
import { syncLabel } from "@/app/components/sync/SyncButton";
import { useI18n } from "@/app/lib/i18n";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  sync: SyncSnapshot & { client: SyncClient };
}

export default function SyncDialog({ open, onClose, sync }: SyncDialogProps) {
  const { t } = useI18n();
  const [joinKey, setJoinKey] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t.sync.title}>
      {sync.key ? (
        <div className="space-y-4 text-sm">
          <p className="text-text-secondary">
            {t.sync.keyIntro}
            <strong className="text-text-primary"> {t.sync.useExisting}</strong> {t.sync.keyIntroEnd}
          </p>
          <div className="group flex items-center gap-2 rounded-lg border border-border bg-bg-base/60 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-accent" data-testid="sync-key">
              {sync.key}
            </code>
            <span className="[&_button]:opacity-100">
              <CopyButton text={sync.key} />
            </span>
          </div>
          <p className="text-xs text-text-muted">
            {t.sync.keyWarning}
          </p>
          <SyncStatusLine sync={sync} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => sync.client.disable()}>
              {t.sync.turnOff}
            </Button>
            <Button
              variant="primary"
              disabled={busy || sync.state === "syncing"}
              onClick={() => run(() => sync.client.syncNow())}
            >
              <Icon name="refresh" size={14} />
              {t.sync.syncNow}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-text-secondary">
            {t.sync.intro}
          </p>
          <Button
            variant="primary"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => sync.client.enable())}
          >
            <Icon name="cloud" size={16} />
            {t.sync.turnOn}
          </Button>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => sync.client.enable(joinKey));
            }}
          >
            <label htmlFor="sync-join" className="block text-xs font-semibold text-text-muted">
              {t.sync.useExisting}
            </label>
            <div className="flex gap-2">
              <input
                id="sync-join"
                value={joinKey}
                onChange={(e) => setJoinKey(e.target.value)}
                placeholder={t.sync.pasteKey}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg-base/60 px-3 py-2 font-mono text-xs text-text-primary outline-none placeholder:font-sans placeholder:text-text-muted focus:border-accent"
              />
              <Button type="submit" disabled={busy || !joinKey.trim()}>
                {t.sync.connect}
              </Button>
            </div>
          </form>
          {sync.error && <p className="text-xs text-red-400">{sync.error}</p>}
        </div>
      )}
    </Modal>
  );
}

function SyncStatusLine({ sync }: { sync: SyncSnapshot }) {
  const { t, locale } = useI18n();
  const text =
    sync.state === "syncing"
      ? t.sync.syncing
      : sync.state === "offline"
        ? t.sync.statusOffline
        : sync.state === "error" && sync.retryAt !== null
          ? `${syncLabel(sync, t)}.`
          : sync.state === "error"
            ? t.sync.statusFailed(sync.error ?? t.sync.unknownError)
          : sync.lastSyncedAt
            ? t.sync.lastSynced(new Date(sync.lastSyncedAt).toLocaleTimeString(locale))
            : t.sync.waiting;
  return (
    <p
      role="status"
      className={sync.state === "error" ? "text-xs text-red-400" : "text-xs text-text-muted"}
    >
      {text}
    </p>
  );
}
