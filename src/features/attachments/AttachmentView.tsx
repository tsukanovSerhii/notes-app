"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isInlineImage, type Attachment } from "@/features/attachments/attachments";
import { attachmentStore } from "@/features/attachments/localAttachments";
import { useI18n } from "@/shared/i18n";

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; url: string; attachment: Attachment };

/** Object URLs shared between every place that shows the same file. */
const urls = new Map<string, { url: string; users: number }>();

function acquireUrl(a: Attachment): string {
  const held = urls.get(a.id);
  if (held) {
    held.users++;
    return held.url;
  }
  const url = URL.createObjectURL(a.blob);
  urls.set(a.id, { url, users: 1 });
  return url;
}

function releaseUrl(id: string) {
  const held = urls.get(id);
  if (!held) return;
  if (--held.users > 0) return;
  urls.delete(id);
  // Revoked later: React may be about to show the same file again.
  setTimeout(() => {
    if (!urls.has(id)) URL.revokeObjectURL(held.url);
  }, 1000);
}

/**
 * A stored file as something a page can show. While the file is not on this
 * device (a note synced before its attachment arrived) the state is
 * `missing`, and it turns `ready` by itself when the file is added.
 */
export function useAttachment(id: string): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let held = false;
    const load = async () => {
      if (held) return;
      const attachment = await attachmentStore.get(id).catch(() => null);
      if (cancelled) return;
      if (!attachment) {
        setState({ status: "missing" });
        return;
      }
      held = true;
      setState({ status: "ready", url: acquireUrl(attachment), attachment });
    };
    void load();
    const off = attachmentStore.subscribe(() => void load());
    return () => {
      cancelled = true;
      off();
      if (held) releaseUrl(id);
    };
  }, [id]);

  return state;
}

/** `![alt](attachment:id)`: the picture, or a note that it has not arrived. */
export function AttachmentImage({ id, alt, eager = false }: { id: string; alt?: string; eager?: boolean }) {
  const { t } = useI18n();
  const file = useAttachment(id);
  if (file.status === "ready" && isInlineImage(file.attachment.type)) {
    // A blob URL cannot be optimized by next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={file.url} alt={alt ?? ""} loading={eager ? "eager" : "lazy"} data-attachment={id} />;
  }
  if (file.status === "ready") return <AttachmentLink id={id}>{alt || file.attachment.name}</AttachmentLink>;
  return (
    <span
      data-attachment-missing={file.status === "missing" ? id : undefined}
      data-attachment-loading={file.status === "loading" ? id : undefined}
      className="inline-block rounded border border-dashed border-border px-2 py-1 text-xs text-text-muted"
    >
      {file.status === "loading" ? t.attachments.loading : alt ? `${alt}: ${t.attachments.unavailable}` : t.attachments.unavailable}
    </span>
  );
}

/** `[name](attachment:id)`: a download of the stored file. */
export function AttachmentLink({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useI18n();
  const file = useAttachment(id);
  if (file.status !== "ready") {
    return (
      <span title={t.attachments.fileUnavailable} className="text-text-muted underline decoration-dashed">
        {children}
      </span>
    );
  }
  return (
    <a href={file.url} download={file.attachment.name} data-attachment={id}>
      {children}
    </a>
  );
}
