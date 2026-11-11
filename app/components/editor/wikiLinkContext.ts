import { createContext } from "react";

export interface WikiLinkTarget {
  /** Whether a note with this title exists. */
  exists(title: string): boolean;
  /** Opens the note with this title, creating it if there is none. */
  open(title: string): void;
}

/** Provided around the live preview; without it (PDF export) links render as text. */
export const WikiLinkContext = createContext<WikiLinkTarget | null>(null);
