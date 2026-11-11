import { expect, test } from "@playwright/test";
import { syncLabel } from "@/app/components/sync/SyncButton";
import type { SyncSnapshot } from "@/app/lib/sync/client";
import { MESSAGES } from "@/app/lib/i18n/messages";

const en = MESSAGES.en;

const snap = (s: Partial<SyncSnapshot>): SyncSnapshot => ({
  state: "idle",
  key: "k",
  lastSyncedAt: null,
  error: null,
  lastConflict: null,
  retryAt: null,
  ...s,
});

test("syncLabel explains a rate limit with the time left", () => {
  expect(syncLabel(snap({ state: "error", retryAt: 12_400 }), en, 1_000)).toBe(
    "Sync paused: too many requests, retrying in 12 s"
  );
  expect(syncLabel(snap({ state: "error", error: "boom" }), en)).toBe("Sync failed");
  expect(syncLabel(snap({ state: "idle" }), en)).toBe("Synced");
  expect(syncLabel(snap({ state: "idle" }), MESSAGES.uk)).toBe("Синхронізовано");
});
