"use client";

import { useState } from "react";
import Modal from "@/shared/ui/Modal";
import Button from "@/shared/ui/Button";
import Icon from "@/shared/ui/Icon";
import { CopyButton } from "@/shared/ui/CopyButton";
import type { SyncClient, SyncSnapshot } from "@/features/sync/client/syncClient";
import { RecoveryJoin, RecoverySetup } from "@/features/recovery/client/RecoverySection";
import { forgetRecovery } from "@/features/recovery/client/recoveryClient";
import { syncLabel } from "@/features/sync/client/SyncButton";
import { useI18n } from "@/shared/i18n";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  sync: SyncSnapshot & { client: SyncClient };
}

export default function SyncDialog({ open, onClose, sync }: SyncDialogProps) {
  const { t } = useI18n();
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
      {sync.key && sync.state === "revoked" ? (
        <div className="space-y-5 text-sm">
          <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/5 p-3 text-text-primary">
            {t.sync.revokedIntro}
          </p>
          <JoinSection sync={sync} busy={busy} run={run} />
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => sync.client.disable()}>
              {t.sync.turnOff}
            </Button>
          </div>
        </div>
      ) : sync.key ? (
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
          <RecoverySetup syncKey={sync.key} />
          <RotateKey sync={sync} />
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

          <JoinSection sync={sync} busy={busy} run={run} />
        </div>
      )}
    </Modal>
  );
}

/** Joining a space: paste the key, or get it back with a recovery code or a passkey. */
function JoinSection({
  sync,
  busy,
  run,
}: {
  sync: SyncSnapshot & { client: SyncClient };
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [joinKey, setJoinKey] = useState("");
  return (
    <>
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
      {sync.error && sync.state !== "revoked" && <p className="text-xs text-red-400">{sync.error}</p>}
      <RecoveryJoin onKey={(key) => run(() => sync.client.enable(key))} />
    </>
  );
}

/**
 * Replacing the key: the way to cut off a lost or stolen device, since all
 * devices share one key. Asks twice, because it disconnects every other device.
 */
function RotateKey({ sync }: { sync: SyncSnapshot & { client: SyncClient } }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const rotate = async () => {
    setBusy(true);
    setResult(null);
    try {
      await sync.client.rotateKey();
      // A recovery code or passkey set up earlier opens the old key; it is now useless.
      const cleared = await forgetRecovery((...a) => fetch(...a));
      setResult({ text: cleared ? t.sync.rotatedForgotRecovery : t.sync.rotated, error: false });
      setAsking(false);
    } catch (error) {
      setResult({ text: error instanceof Error ? error.message : t.sync.rotateFailed, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="rotate-heading" className="space-y-2 border-t border-border pt-4">
      <h3 id="rotate-heading" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {t.sync.rotateHeading}
      </h3>
      <p className="text-xs text-text-muted">{t.sync.rotateIntro}</p>
      {asking ? (
        <div className="space-y-2 rounded-lg border border-red-400/40 bg-red-400/5 p-3">
          <p className="text-xs text-text-primary">{t.sync.rotateConfirm}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
              {t.common.cancel}
            </Button>
            <Button type="button" variant="primary" disabled={busy} onClick={() => void rotate()}>
              {busy ? t.sync.rotating : t.sync.rotateDo}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={sync.state !== "idle"} onClick={() => setAsking(true)}>
          {t.sync.rotateAsk}
        </Button>
      )}
      {result && (
        <p role={result.error ? "alert" : "status"} className={result.error ? "text-xs text-red-400" : "text-xs text-text-muted"}>
          {result.text}
        </p>
      )}
    </section>
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
    <>
      <p
        role="status"
        className={sync.state === "error" ? "text-xs text-red-400" : "text-xs text-text-muted"}
      >
        {text}
      </p>
      {(sync.attachmentsError || sync.attachmentsPending > 0) && (
        <p data-testid="attachments-status" className={sync.attachmentsError ? "text-xs text-red-400" : "text-xs text-text-muted"}>
          {sync.attachmentsError
            ? t.sync.attachmentsFailed(sync.attachmentsError)
            : t.sync.attachmentsPending(sync.attachmentsPending)}
        </p>
      )}
    </>
  );
}
