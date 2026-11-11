import { expect, test } from "@playwright/test";
import { syncLabel } from "@/app/components/sync/SyncButton";
import type { SyncSnapshot } from "@/app/lib/sync/client";

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
  expect(syncLabel(snap({ state: "error", retryAt: 12_400 }), 1_000)).toBe(
    "Sync paused: too many requests, retrying in 12 s"
  );
  expect(syncLabel(snap({ state: "error", error: "boom" }))).toBe("Sync failed");
  expect(syncLabel(snap({ state: "idle" }))).toBe("Synced");
});
