"use client";

import { useMemo, useState } from "react";
import { attachmentStore } from "@/features/attachments/localAttachments";
import {
  ShareError,
  createShareLink,
  createShareRecords,
  revokeShareLink,
  type ShareRecord,
} from "@/features/sharing/client/shareClient";
import { SHARE_TTL_DAYS, type ShareTtl } from "@/features/sharing/shared/share";
import type { Note } from "@/features/notes/model/types";
import Modal from "@/shared/ui/Modal";
import Button from "@/shared/ui/Button";
import { useI18n } from "@/shared/i18n";

interface ShareDialogProps {
  /** The note to share; null while the dialog is closed. */
  note: Note | null;
  onClose: () => void;
}

/** Makes read-only links to a note, lists the ones made on this device and revokes them. */
export default function ShareDialog({ note, onClose }: ShareDialogProps) {
  return (
    <ShareDialogBody key={note?.id ?? "none"} note={note} onClose={onClose} />
  );
}

function ShareDialogBody({ note, onClose }: ShareDialogProps) {
  const { t, locale } = useI18n();
  const records = useMemo(() => createShareRecords(typeof window === "undefined" ? null : window.localStorage), []);
  const [ttl, setTtl] = useState<ShareTtl>(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  // `version` changes when links are added or removed, to read the list again.
  const links: ShareRecord[] = note ? records.list(Date.now()).filter((r) => r.noteId === note.id) : [];
  void version;

  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });
  const explain = (error: unknown) =>
    error instanceof ShareError ? t.share.errors[error.code] : t.share.errors.failed;

  const create = async () => {
    if (!note) return;
    setBusy(true);
    setMessage(null);
    try {
      const { record, omitted } = await createShareLink({
        note,
        store: attachmentStore,
        ttlDays: ttl,
        origin: window.location.origin,
        fetch: (...args) => fetch(...args),
        records,
      });
      let copied = true;
      try {
        await navigator.clipboard.writeText(record.url);
      } catch {
        copied = false;
      }
      setMessage({
        text: [copied ? t.share.created : t.share.links, omitted > 0 ? t.share.omitted(omitted) : ""].filter(Boolean).join(" "),
        error: false,
      });
      setVersion((v) => v + 1);
    } catch (error) {
      setMessage({ text: explain(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (record: ShareRecord) => {
    setBusy(true);
    setMessage(null);
    try {
      await revokeShareLink(record, (...args) => fetch(...args), records);
      setMessage({ text: t.share.revoked, error: false });
      setVersion((v) => v + 1);
    } catch (error) {
      setMessage({ text: explain(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={note !== null} onClose={onClose} title={t.share.title}>
      <p className="mb-4 text-sm text-text-secondary">{t.share.intro}</p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t.share.lifetime}
          <select
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value) as ShareTtl)}
            className="rounded-md border border-border bg-bg-base/60 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          >
            {SHARE_TTL_DAYS.map((d) => (
              <option key={d} value={d} className="bg-bg-elevated">
                {t.share.days(d)}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="primary" onClick={() => void create()} disabled={busy || !note}>
          {busy ? t.share.creating : t.share.create}
        </Button>
      </div>

      {message && (
        <p role="status" className={message.error ? "mb-3 text-xs text-red-400" : "mb-3 text-xs text-text-muted"}>
          {message.text}
        </p>
      )}

      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">{t.share.links}</h3>
      {links.length === 0 ? (
        <p className="text-sm text-text-muted">{t.share.none}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((r) => (
            <li key={r.id} className="rounded-md border border-border p-2">
              <input
                readOnly
                value={r.url}
                aria-label={t.share.linkLabel}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded border border-border bg-bg-base/60 px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-accent"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <span className="mr-auto text-xs text-text-muted">{t.share.expires(date(r.expiresAt))}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(r.url).then(
                      () => setMessage({ text: t.share.copied, error: false }),
                      () => undefined
                    );
                  }}
                >
                  {t.share.copy}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t.share.revokeLabel(date(r.expiresAt))}
                  disabled={busy}
                  onClick={() => void revoke(r)}
                >
                  {t.share.revoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
