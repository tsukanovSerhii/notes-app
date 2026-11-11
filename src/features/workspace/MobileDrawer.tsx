"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** The sidebar on phones: a panel that slides in over the note. */
export default function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-40 transition-[visibility] duration-200", open ? "visible" : "invisible")}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative h-full w-fit bg-bg-surface shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {children}
      </div>
    </div>
  );
}
