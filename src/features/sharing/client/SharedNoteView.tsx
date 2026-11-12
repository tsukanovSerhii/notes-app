"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AttachmentStoreContext } from "@/features/attachments/AttachmentView";
import { createMemoryAttachmentStore } from "@/features/attachments/attachmentStore";
import Markdown from "@/features/markdown/Markdown";
import { PROSE_CLASS } from "@/features/markdown/Preview";
import { openShare, parseShareHash } from "@/features/sharing/client/shareCrypto";
import type { SharedNote } from "@/features/sharing/shared/share";
import { fromB64url } from "@/shared/lib/base64url";
import { useI18n } from "@/shared/i18n";

type State =
  | { status: "loading" }
  | { status: "error"; reason: "invalid" | "gone" | "failed" }
  | { status: "ready"; note: SharedNote; expiresAt: number };

/** Reads the link in the address bar, fetches the sealed note and opens it with the key after the #. */
async function load(hash: string): Promise<State> {
  const link = parseShareHash(hash);
  if (!link) return { status: "error", reason: "invalid" };
  const res = await fetch(`/api/share/${link.id}`, { cache: "no-store" });
  if (res.status === 404) return { status: "error", reason: "gone" };
  if (!res.ok) return { status: "error", reason: "failed" };
  const { blob, expiresAt } = (await res.json()) as { blob: string; expiresAt: number };
  try {
    return { status: "ready", note: await openShare(link.id, link.key, blob), expiresAt };
  } catch {
    // The key did not fit: a damaged or altered link.
    return { status: "error", reason: "invalid" };
  }
}

/** The page a share link opens: a read-only view of one note, with nothing else of the app. */
export default function SharedNoteView() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const open = () => {
      setState({ status: "loading" });
      load(window.location.hash)
        .catch((): State => ({ status: "error", reason: "failed" }))
        .then((next) => {
          if (!cancelled) setState(next);
        });
    };
    open();
    // Pasting another link into the same tab only changes the fragment.
    window.addEventListener("hashchange", open);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", open);
    };
  }, []);

  // The pictures that came inside the link, readable by the note's Markdown.
  const pictures = useMemo(() => {
    const store = createMemoryAttachmentStore();
    if (state.status === "ready") {
      for (const a of state.note.attachments) {
        try {
          const bytes = fromB64url(a.data);
          void store.put({
            id: a.id,
            blob: new Blob([bytes as BlobPart], { type: a.type }),
            type: a.type,
            name: a.name,
            size: bytes.length,
            createdAt: 0,
          });
        } catch {
          // A damaged picture is skipped; the note still reads.
        }
      }
    }
    return store;
  }, [state]);

  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });

  return (
    <main className="relative z-2 mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between text-sm text-text-muted">
        <span className="font-semibold text-text-primary">NoteVoid</span>
        <Link href="/" className="rounded text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none">
          {t.share.view.open}
        </Link>
      </header>

      {state.status === "loading" && (
        <p role="status" className="text-text-muted">
          {t.share.view.loading}
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="rounded-lg border border-border bg-bg-elevated p-4 text-text-primary">
          {t.share.view[state.reason]}
        </p>
      )}

      {state.status === "ready" && (
        <article aria-label={t.share.view.label} className="rounded-xl border border-border bg-bg-surface/60 p-5 sm:p-8">
          <h1 className="mb-2 text-2xl font-semibold text-text-primary">{state.note.title || t.common.untitled}</h1>
          <p className="mb-6 text-xs text-text-muted">
            {t.share.view.sharedOn(date(state.note.sharedAt))} · {t.share.view.expiresOn(date(state.expiresAt))}
            {state.note.tags.length > 0 && ` · ${state.note.tags.map((tag) => `#${tag}`).join(" ")}`}
          </p>
          <div id="shared-content" className={PROSE_CLASS}>
            <AttachmentStoreContext.Provider value={pictures}>
              <Markdown>{state.note.content}</Markdown>
            </AttachmentStoreContext.Provider>
          </div>
        </article>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-text-muted">{t.share.view.footer}</footer>
    </main>
  );
}
