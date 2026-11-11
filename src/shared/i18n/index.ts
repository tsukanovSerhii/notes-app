"use client";

import { useSyncExternalStore } from "react";
import { MESSAGES, type Locale, type Messages } from "@/shared/i18n/messages";

export type { Locale, Messages };

const STORAGE_KEY = "notevoid-locale";
export const LOCALES: Locale[] = ["en", "uk"];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", uk: "Українська" };

const isLocale = (v: unknown): v is Locale => v === "en" || v === "uk";

/** The browser's preferred locale, if we have it. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

let current: Locale | null = null;
const listeners = new Set<() => void>();

function read(): Locale {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: fall back to the browser language.
  }
  current = isLocale(stored) ? stored : detectLocale(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = current;
  return current;
}

/** The locale outside React (client only). */
export const currentLocale = (): Locale => read();

export function setLocale(locale: Locale) {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Counts with the right plural form: "1 note", "3 нотатки", "5 нотаток". */
export function formatCount(
  locale: Locale,
  n: number,
  forms: { one: string; few?: string; many?: string; other: string }
): string {
  const rule = new Intl.PluralRules(locale).select(n) as keyof typeof forms;
  return `${n} ${forms[rule] ?? forms.other}`;
}

export interface I18n {
  locale: Locale;
  t: Messages;
  count: (n: number, forms: Messages["plural"][keyof Messages["plural"]]) => string;
}

/**
 * The current locale and its messages. The server renders English; the
 * client switches after hydration if the user prefers Ukrainian.
 */
export function useI18n(): I18n {
  const locale = useSyncExternalStore(subscribe, read, () => "en" as Locale);
  return forLocale(locale);
}

const cache = new Map<Locale, I18n>();

/** One stable object per locale, so it can sit in hook dependency lists. */
export function forLocale(locale: Locale): I18n {
  let i18n = cache.get(locale);
  if (!i18n) {
    i18n = { locale, t: MESSAGES[locale], count: (n, forms) => formatCount(locale, n, forms) };
    cache.set(locale, i18n);
  }
  return i18n;
}
