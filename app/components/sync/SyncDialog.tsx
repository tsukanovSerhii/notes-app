"use client";

import { useState } from "react";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import { CopyButton } from "@/app/components/editor/CodeBlock";
import type { SyncClient, SyncSnapshot } from "@/app/lib/sync/client";
import { syncLabel } from "@/app/components/sync/SyncButton";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  sync: SyncSnapshot & { client: SyncClient };
}

export default function SyncDialog({ open, onClose, sync }: SyncDialogProps) {
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
    <Modal open={open} onClose={onClose} title="Sync between devices">
      {sync.key ? (
        <div className="space-y-4 text-sm">
          <p className="text-text-secondary">
            Sync is on. To connect another device, open NoteVoid there, choose
            <strong className="text-text-primary"> Use an existing key</strong> and paste:
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
            Anyone with this key can read and change these notes. Keep it private.
          </p>
          <SyncStatusLine sync={sync} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => sync.client.disable()}>
              Turn off sync
            </Button>
            <Button
              variant="primary"
              disabled={busy || sync.state === "syncing"}
              onClick={() => run(() => sync.client.syncNow())}
            >
              <Icon name="refresh" size={14} />
              Sync now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-text-secondary">
            Notes stay on this device until you turn sync on. Sync merges changes
            from every device; the most recent edit of a note wins.
          </p>
          <Button
            variant="primary"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => sync.client.enable())}
          >
            <Icon name="cloud" size={16} />
            Turn on sync
          </Button>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => sync.client.enable(joinKey));
            }}
          >
            <label htmlFor="sync-join" className="block text-xs font-semibold text-text-muted">
              Use an existing key
            </label>
            <div className="flex gap-2">
              <input
                id="sync-join"
                value={joinKey}
                onChange={(e) => setJoinKey(e.target.value)}
                placeholder="Paste the key from your other device"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg-base/60 px-3 py-2 font-mono text-xs text-text-primary outline-none placeholder:font-sans placeholder:text-text-muted focus:border-accent"
              />
              <Button type="submit" disabled={busy || !joinKey.trim()}>
                Connect
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
  const text =
    sync.state === "syncing"
      ? "Syncing…"
      : sync.state === "offline"
        ? "Offline — changes will sync when you reconnect."
        : sync.state === "error" && sync.retryAt !== null
          ? `${syncLabel(sync)}.`
          : sync.state === "error"
            ? `Sync failed: ${sync.error ?? "unknown error"}`
          : sync.lastSyncedAt
            ? `Last synced at ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
            : "Waiting for the first sync…";
  return (
    <p
      role="status"
      className={sync.state === "error" ? "text-xs text-red-400" : "text-xs text-text-muted"}
    >
      {text}
    </p>
  );
}
