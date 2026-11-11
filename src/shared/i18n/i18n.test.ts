import { expect, test } from "@playwright/test";
import { detectLocale, formatCount } from "@/shared/i18n";
import { MESSAGES } from "@/shared/i18n/messages";

test("detectLocale picks the first supported browser language", () => {
  expect(detectLocale(["uk-UA", "en-US"])).toBe("uk");
  expect(detectLocale(["de-DE", "en-GB"])).toBe("en");
  expect(detectLocale(["fr"])).toBe("en");
  expect(detectLocale([])).toBe("en");
});

test("formatCount uses each language's plural rules", () => {
  const { en, uk } = MESSAGES;
  expect(formatCount("en", 1, en.plural.notes)).toBe("1 note");
  expect(formatCount("en", 5, en.plural.notes)).toBe("5 notes");
  expect([1, 3, 5, 11, 21, 22, 25].map((n) => formatCount("uk", n, uk.plural.notes))).toEqual([
    "1 нотатка",
    "3 нотатки",
    "5 нотаток",
    "11 нотаток",
    "21 нотатка",
    "22 нотатки",
    "25 нотаток",
  ]);
});

test("every translation has the same keys as English", () => {
  const shape = (o: object): unknown =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === "object" && v ? shape(v) : typeof v])
    );
  // `few` and `many` are Ukrainian-only plural forms.
  const strip = (o: unknown): unknown =>
    JSON.parse(JSON.stringify(o, (k, v) => (k === "few" || k === "many" ? undefined : v)));
  expect(strip(shape(MESSAGES.uk))).toEqual(strip(shape(MESSAGES.en)));
});
