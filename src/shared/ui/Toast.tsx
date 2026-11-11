"use client";

import { useEffect } from "react";
import Icon from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "default" | "error";
  action?: { label: string; onClick: () => void };
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Toast({
  toast,
  onDismiss,
  durationMs = 6000,
}: ToastProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {toast && (
        <div
          key={toast.id}
          className={cn(
            "animate-toast-in pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-2xl",
            toast.tone === "error"
              ? "border-red-500/40 bg-red-950/90 text-red-100"
              : "border-border bg-bg-elevated text-text-primary"
          )}
        >
          {toast.tone === "error" && <Icon name="alert" className="text-red-300" />}
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
              className="rounded px-1.5 py-0.5 font-semibold text-accent hover:bg-accent-glow focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t.common.dismiss}
            className="rounded p-0.5 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
