/**
 * UI strings, one file per language. `uk` is typed as the shape of `en`, so a
 * key missing from a translation (or one with a different signature) fails
 * the build. Counting messages take a plural-aware number formatter.
 */
import { en, type Messages } from "@/shared/i18n/en";
import { uk } from "@/shared/i18n/uk";

export type { Messages };
export type Locale = "en" | "uk";

export const MESSAGES: Record<Locale, Messages> = { en, uk };
