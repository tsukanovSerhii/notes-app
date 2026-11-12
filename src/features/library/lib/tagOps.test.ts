import { expect, test } from "@playwright/test";
import { retag } from "@/features/library/lib/tagOps";

const notes = [
  { id: "a", tags: ["work", "idea"] },
  { id: "b", tags: ["idea"] },
  { id: "c", tags: ["home"] },
  { id: "d", tags: ["work", "idea", "home"] },
];

test("renaming changes the tag in every note that has it", () => {
  expect(retag(notes, "idea", "plan")).toEqual([
    { id: "a", tags: ["work", "plan"] },
    { id: "b", tags: ["plan"] },
    { id: "d", tags: ["work", "plan", "home"] },
  ]);
});

test("renaming to an existing tag merges them without duplicates", () => {
  expect(retag(notes, "idea", "work")).toEqual([
    { id: "a", tags: ["work"] },
    { id: "b", tags: ["work"] },
    { id: "d", tags: ["work", "home"] },
  ]);
});

test("deleting removes the tag and leaves the others", () => {
  expect(retag(notes, "work", null)).toEqual([
    { id: "a", tags: ["idea"] },
    { id: "d", tags: ["idea", "home"] },
  ]);
});

test("names are normalised like tags typed by hand", () => {
  expect(retag(notes, "#Home", "  My Home ")).toEqual([
    { id: "c", tags: ["my-home"] },
    { id: "d", tags: ["work", "idea", "my-home"] },
  ]);
});

test("a rename to nothing usable just removes the tag", () => {
  expect(retag(notes, "home", "#")).toEqual([
    { id: "c", tags: [] },
    { id: "d", tags: ["work", "idea"] },
  ]);
});
