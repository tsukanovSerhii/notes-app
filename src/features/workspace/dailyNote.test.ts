import { expect, test } from "@playwright/test";
import { findDailyNote } from "@/features/workspace/dailyNote";
import { note } from "@/features/notes/testing";

test("the note for a date is found by its title, skipping the trash", () => {
  const notes = [
    note("old", { title: "2025-03-04", createdAt: 5 }),
    note("trashed", { title: "2025-03-05", trashedAt: 9 }),
    note("padded", { title: " 2025-03-05 ", createdAt: 2 }),
    note("later", { title: "2025-03-05", createdAt: 8 }),
  ];
  expect(findDailyNote(notes, "2025-03-05")?.id).toBe("padded");
  expect(findDailyNote(notes, "2025-03-06")).toBeNull();
});
