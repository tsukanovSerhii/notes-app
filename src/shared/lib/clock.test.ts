import { expect, test } from "@playwright/test";
import { CLOCK_OFFSET_KEY, createSkewClock } from "@/shared/lib/clock";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test.describe("createSkewClock", () => {
  test("estimates the offset from the middle of the round trip", () => {
    let t = 1_000_000;
    const clock = createSkewClock({ base: () => t });
    // Device is an hour fast: sends at local 1_000_000, server replies at
    // 1_000_000 - 1h + 100, received at local 1_000_200.
    clock.observe(1_000_000 - 3_600_000 + 100, 1_000_000, 1_000_200);
    expect(clock.offset()).toBe(-3_600_000);
    t = 2_000_000;
    expect(clock.now()).toBe(2_000_000 - 3_600_000);
  });

  test("ignores jitter and slow round trips", () => {
    const clock = createSkewClock({ base: () => 0 });
    clock.observe(500, 0, 200);
    expect(clock.offset()).toBe(0);
    clock.observe(60_000, 0, 30_000); // 30 s round trip: too vague
    expect(clock.offset()).toBe(0);
  });

  test("never runs backwards when the offset shrinks", () => {
    const t = 10_000;
    const clock = createSkewClock({ base: () => t });
    clock.observe(t + 5_000, t, t);
    const ahead = clock.now();
    clock.observe(t, t, t);
    expect(clock.offset()).toBe(0);
    expect(clock.now()).toBe(ahead);
  });

  test("persists the offset and restores it on the next load", () => {
    const storage = memoryStorage();
    createSkewClock({ base: () => 0, storage }).observe(10_000, 0, 0);
    expect(storage.map.get(CLOCK_OFFSET_KEY)).toBe("10000");
    expect(createSkewClock({ base: () => 0, storage }).now()).toBe(10_000);
  });

  test("rejects a corrupt stored offset", () => {
    const storage = memoryStorage({ [CLOCK_OFFSET_KEY]: "banana" });
    expect(createSkewClock({ base: () => 5, storage }).now()).toBe(5);
  });
});
