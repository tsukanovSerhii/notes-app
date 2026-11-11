"use client";

import { useCallback, useMemo, useState } from "react";
import type { ToastMessage } from "@/shared/ui/Toast";

/** The single toast slot, plus the success/error callbacks features report through. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const showError = useCallback((text: string) => showToast({ text, tone: "error" }), [showToast]);
  const feedback = useMemo(
    () => ({ success: (text: string) => showToast({ text }), error: showError }),
    [showToast, showError]
  );
  return { toast, showToast, dismissToast, showError, feedback };
}

export type ShowToast = ReturnType<typeof useToast>["showToast"];
