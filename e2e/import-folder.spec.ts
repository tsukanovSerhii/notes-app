import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { gotoFresh, noteRow, preview, titleInput } from "./helpers";

function vault() {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "vault-")), "My Vault");
  const put = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  put("Home.md", "---\ntags: [start]\n---\n# Home\n\nGo to [[Projects/Plan|the plan]] or [[Plan]] #welcome");
  put("Projects/Plan.md", "Back to [[Home]].");
  put(".obsidian/workspace.json", "{}");
  put("logo.png", "binary");
  return root;
}

test("a folder of Obsidian notes imports with folders, tags and working links", async ({ page }) => {
  await gotoFresh(page);
  await page.getByTestId("import-folder").setInputFiles(vault());

  await expect(page.getByRole("status").filter({ hasText: "Imported 2 notes and 1 folder" })).toBeVisible();
  await expect(noteRow(page, "Home")).toBeVisible();
  await expect(noteRow(page, "Plan")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Library" })).toContainText("Projects");
  await expect(page.getByRole("navigation", { name: "Library" })).toContainText("#start");
  await expect(page.getByRole("navigation", { name: "Library" })).toContainText("#welcome");

  await noteRow(page, "Home").click();
  // A path-qualified link and a plain one both resolve to the note by title.
  await expect(preview(page).getByRole("link", { name: "the plan" })).toHaveAttribute("data-wiki-link", "found");
  await expect(preview(page).getByRole("link", { name: "Plan", exact: true })).toHaveAttribute("data-wiki-link", "found");
  await noteRow(page, "Plan").click();
  await expect(titleInput(page)).toHaveValue("Plan");
});
