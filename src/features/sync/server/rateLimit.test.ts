import { expect, test } from "@playwright/test";
import { clientAddress, createRateLimiter, readPerMinute } from "@/features/sync/server/rateLimit";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

test.describe("createRateLimiter", () => {
  test("allows a burst up to the limit, then refuses with Retry-After", () => {
    const c = clock();
    const limiter = createRateLimiter({ perMinute: 3, now: c.now });
    expect([1, 2, 3].map(() => limiter.take("ip").ok)).toEqual([true, true, true]);
    expect(limiter.take("ip")).toEqual({ ok: false, retryAfterSec: 20 });
  });

  test("refills continuously over time", () => {
    const c = clock();
    const limiter = createRateLimiter({ perMinute: 60, now: c.now });
    for (let i = 0; i < 60; i++) limiter.take("ip");
    expect(limiter.take("ip").ok).toBe(false);
    c.advance(1000);
    expect(limiter.take("ip").ok).toBe(true);
    expect(limiter.take("ip").ok).toBe(false);
  });

  test("keys are limited independently", () => {
    const limiter = createRateLimiter({ perMinute: 1, now: clock().now });
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
    expect(limiter.take("b").ok).toBe(true);
  });

  test("0 turns limiting off", () => {
    const limiter = createRateLimiter({ perMinute: 0 });
    for (let i = 0; i < 1000; i++) expect(limiter.take("ip").ok).toBe(true);
  });

  test("the number of tracked keys stays bounded", () => {
    const c = clock();
    const limiter = createRateLimiter({ perMinute: 1, now: c.now, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) limiter.take(k);
    // "a" was evicted as least recently used, so it starts with a full bucket.
    expect(limiter.take("a").ok).toBe(true);
    // "d" is still tracked and empty.
    expect(limiter.take("d").ok).toBe(false);
  });
});

test("clientAddress prefers the first forwarded address", () => {
  expect(clientAddress(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  expect(clientAddress(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  expect(clientAddress(new Headers())).toBe("unknown");
});

test("readPerMinute parses env values and falls back on junk", () => {
  expect(readPerMinute(undefined, 120)).toBe(120);
  expect(readPerMinute("30", 120)).toBe(30);
  expect(readPerMinute("0", 120)).toBe(0);
  expect(readPerMinute("lots", 120)).toBe(120);
  expect(readPerMinute("-5", 120)).toBe(120);
});
