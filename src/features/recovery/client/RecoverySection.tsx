"use client";

import { useMemo, useState } from "react";
import Button from "@/shared/ui/Button";
import {
  RecoveryError,
  createRecoveryState,
  newRecoveryCode,
  recoverSyncKey,
  removeRecovery,
  secretFromCode,
  storeRecovery,
} from "@/features/recovery/client/recoveryClient";
import {
  PasskeyError,
  browserPasskeys,
  createPasskeySecret,
  getPasskeySecret,
  passkeysAvailable,
} from "@/features/recovery/client/passkey";
import { useI18n } from "@/shared/i18n";

const useRecoveryState = () =>
  useMemo(() => createRecoveryState(typeof window === "undefined" ? null : window.localStorage), []);

function useErrorText() {
  const { t } = useI18n();
  return (error: unknown): string =>
    error instanceof RecoveryError || error instanceof PasskeyError
      ? t.recovery.errors[error.code]
      : t.recovery.errors.failed;
}

/** Shown while sync is on: set up a recovery code and a passkey that can bring the key back. */
export function RecoverySetup({ syncKey }: { syncKey: string }) {
  const { t, locale } = useI18n();
  const state = useRecoveryState();
  const explain = useErrorText();
  const [current, setCurrent] = useState(state.get());
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });

  const save = (next: typeof current) => {
    state.set(next);
    setCurrent(next);
  };
  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      // Dismissing the passkey prompt is not worth an error message.
      if (!(e instanceof PasskeyError && e.code === "cancelled")) setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const createCode = () =>
    guard(async () => {
      const { code, secret } = newRecoveryCode();
      const lookupId = await storeRecovery(secret, syncKey, (...a) => fetch(...a));
      // A replaced code stops working.
      if (current.code && current.code.lookupId !== lookupId) {
        await removeRecovery(current.code.lookupId, (...a) => fetch(...a)).catch(() => undefined);
      }
      save({ ...current, code: { lookupId, createdAt: Date.now() } });
      setShownCode(code);
    });

  const removeCode = () =>
    guard(async () => {
      if (current.code) await removeRecovery(current.code.lookupId, (...a) => fetch(...a));
      save({ ...current, code: null });
      setShownCode(null);
    });

  const addPasskey = () =>
    guard(async () => {
      const { credentials, rpId } = browserPasskeys();
      const { secret, credentialId } = await createPasskeySecret(credentials, rpId);
      const lookupId = await storeRecovery(secret, syncKey, (...a) => fetch(...a));
      save({ ...current, passkey: { lookupId, credentialId, createdAt: Date.now() } });
    });

  const removePasskey = () =>
    guard(async () => {
      // Removes the stored key; the passkey itself stays in the user's password manager.
      if (current.passkey) await removeRecovery(current.passkey.lookupId, (...a) => fetch(...a));
      save({ ...current, passkey: null });
    });

  return (
    <section aria-labelledby="recovery-heading" className="space-y-3 border-t border-border pt-4">
      <h3 id="recovery-heading" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {t.recovery.heading}
      </h3>
      <p className="text-xs text-text-muted">{t.recovery.intro}</p>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-text-primary">{t.recovery.codeHeading}</p>
        <p className="text-xs text-text-muted">
          {current.code ? t.recovery.codeSet(date(current.code.createdAt)) : t.recovery.codeNone}
        </p>
        {shownCode && (
          <div className="rounded-lg border border-accent/50 bg-bg-base/60 p-3">
            <p className="mb-1 text-xs font-semibold text-text-primary">{t.recovery.codeShown}</p>
            <code data-testid="recovery-code" className="block select-all break-all font-mono text-sm text-accent">
              {shownCode}
            </code>
            <p className="mt-2 text-xs text-text-muted">{t.recovery.codeWarning}</p>
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setShownCode(null)}>
                {t.recovery.codeSaved}
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void createCode()}>
            {current.code ? t.recovery.codeReplace : t.recovery.codeCreate}
          </Button>
          {current.code && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void removeCode()}>
              {t.recovery.codeRemove}
            </Button>
          )}
        </div>
      </div>

      {passkeysAvailable() && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-text-primary">{t.recovery.passkeyHeading}</p>
          <p className="text-xs text-text-muted">
            {current.passkey ? t.recovery.passkeySet(date(current.passkey.createdAt)) : t.recovery.passkeyNone}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void addPasskey()}>
              {t.recovery.passkeyAdd}
            </Button>
            {current.passkey && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void removePasskey()}>
                {t.recovery.passkeyRemove}
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

/** Shown while sync is off: get the key back with a recovery code or a passkey, then join. */
export function RecoveryJoin({ onKey }: { onKey: (syncKey: string) => Promise<unknown> }) {
  const { t } = useI18n();
  const explain = useErrorText();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      await onKey(await work());
    } catch (e) {
      if (!(e instanceof PasskeyError && e.code === "cancelled")) setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const recoverWithCode = () =>
    guard(async () => {
      const secret = secretFromCode(code);
      if (!secret) throw new RecoveryError("badCode", "Not a whole recovery code.");
      return recoverSyncKey(secret, (...a) => fetch(...a));
    });

  const recoverWithPasskey = () =>
    guard(async () => {
      const { credentials, rpId } = browserPasskeys();
      const { secret } = await getPasskeySecret(credentials, rpId);
      return recoverSyncKey(secret, (...a) => fetch(...a));
    });

  return (
    <section aria-labelledby="recover-heading" className="space-y-2">
      <h3 id="recover-heading" className="text-xs font-semibold text-text-muted">
        {t.recovery.joinHeading}
      </h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void recoverWithCode();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label={t.recovery.joinCode}
          placeholder={t.recovery.joinCodePlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg-base/60 px-3 py-2 font-mono text-xs text-text-primary outline-none placeholder:font-sans placeholder:text-text-muted focus:border-accent"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {t.recovery.joinRecover}
        </Button>
      </form>
      {passkeysAvailable() && (
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => void recoverWithPasskey()}>
          {t.recovery.joinPasskey}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
