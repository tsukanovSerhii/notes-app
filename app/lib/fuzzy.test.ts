import { expect, test } from "@playwright/test";
import { fuzzyFilter, fuzzyScore } from "@/app/lib/fuzzy";

test("fuzzyScore needs every query character in order", () => {
  expect(fuzzyScore("Meeting notes", "mtg")).not.toBeNull();
  expect(fuzzyScore("Meeting notes", "gtm")).toBeNull();
  expect(fuzzyScore("anything", "")).toBe(0);
});

test("fuzzyFilter ranks direct and word-start matches first", () => {
  const items = ["Export as PDF", "Open the trash", "Use the dark theme", "Pdf notes"];
  expect(fuzzyFilter(items, "pdf", (s) => s)).toEqual(["Pdf notes", "Export as PDF"]);
  expect(fuzzyFilter(items, "trsh", (s) => s)).toEqual(["Open the trash"]);
  expect(fuzzyFilter(items, "zzz", (s) => s)).toEqual([]);
});
