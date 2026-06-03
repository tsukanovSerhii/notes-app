"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold " +
  "transition-all focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-bg-base shadow-sm hover:brightness-110 active:brightness-95 " +
    "disabled:hover:brightness-100",
  secondary:
    "border border-border bg-bg-elevated text-text-primary " +
    "hover:border-accent hover:text-text-primary",
  ghost: "text-text-muted hover:bg-bg-elevated hover:text-text-primary",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
