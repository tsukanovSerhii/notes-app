"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Icon from "@/app/components/ui/Icon";
import { useI18n } from "@/app/lib/i18n";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** A wider dialog, for side-by-side content. */
  wide?: boolean;
}

/**
 * Built on the native <dialog>: showModal() gives focus trapping, Escape to
 * close, an inert background and the top layer without extra code.
 */
export default function Modal({ open, title, onClose, children, wide = false }: ModalProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto ${wide ? "w-[min(46rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} rounded-xl border border-border bg-bg-elevated p-0 text-text-primary shadow-2xl backdrop:bg-black/60`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="rounded p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
            >
              <Icon name="x" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
