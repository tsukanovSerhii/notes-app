/**
 * A clock corrected towards the sync server's time.
 *
 * Merges are last-write-wins on `updatedAt`, so a device whose clock runs an
 * hour fast would win every conflict for an hour. Each sync reports the
 * server time; the clock estimates its offset from the request midpoint and
 * applies it to every timestamp it hands out. The offset is persisted so it
 * holds before the first sync after a reload. The clock never runs backwards
 * within a session, even when a new estimate lowers the offset.
 */

export interface SkewClock {
  now(): number;
  offset(): number;
  /** Feeds one round trip: server time, plus raw local send and receive times. */
  observe(serverTime: number, sentAt: number, receivedAt: number): void;
}

export interface SkewClockOptions {
  base?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Round trips slower than this give too vague an estimate and are ignored. */
  maxRoundTripMs?: number;
  /** Offsets this small are network jitter, not a wrong clock. */
  minSkewMs?: number;
}

export const CLOCK_OFFSET_KEY = "notevoid-clock-offset";
const MAX_OFFSET_MS = 365 * 24 * 60 * 60 * 1000;

export function createSkewClock({
  base = Date.now,
  storage = null,
  maxRoundTripMs = 10_000,
  minSkewMs = 1_000,
}: SkewClockOptions = {}): SkewClock {
  let offset = readOffset(storage);
  let last = -Infinity;

  return {
    now() {
      last = Math.max(last, base() + offset);
      return last;
    },
    offset: () => offset,
    observe(serverTime, sentAt, receivedAt) {
      const roundTrip = receivedAt - sentAt;
      if (!Number.isFinite(serverTime) || roundTrip < 0 || roundTrip > maxRoundTripMs) return;
      const estimate = serverTime - (sentAt + receivedAt) / 2;
      const next = Math.abs(estimate) < minSkewMs ? 0 : Math.round(estimate);
      if (next === offset || Math.abs(next) > MAX_OFFSET_MS) return;
      offset = next;
      try {
        storage?.setItem(CLOCK_OFFSET_KEY, String(offset));
      } catch {
        // The offset is re-learned on the next sync.
      }
    },
  };
}

function readOffset(storage: SkewClockOptions["storage"]): number {
  try {
    const n = Number(storage?.getItem(CLOCK_OFFSET_KEY));
    return Number.isFinite(n) && Math.abs(n) <= MAX_OFFSET_MS ? n : 0;
  } catch {
    return 0;
  }
}
