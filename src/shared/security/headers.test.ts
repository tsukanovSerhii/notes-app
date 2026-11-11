import { expect, test } from "@playwright/test";
import { STATIC_SECURITY_HEADERS, buildCsp, createNonce } from "@/shared/security/headers";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? null;

test.describe("buildCsp", () => {
  test("allows only nonced scripts in production", () => {
    const csp = buildCsp({ nonce: "abc123" });
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-inline'");
  });

  test("does not force HTTPS, so plain-HTTP self-hosting keeps working", () => {
    expect(buildCsp({ nonce: "n" })).not.toContain("upgrade-insecure-requests");
  });

  test("relaxes only what the dev server needs", () => {
    const csp = buildCsp({ nonce: "n", dev: true });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
  });

  test("blocks framing, plugins and foreign connections", () => {
    const csp = buildCsp({ nonce: "n" });
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
  });
});

test("createNonce returns a fresh base64 value each time", () => {
  const a = createNonce();
  expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  expect(createNonce()).not.toBe(a);
});

test("static headers cover sniffing, framing and referrers", () => {
  const keys = STATIC_SECURITY_HEADERS.map((h) => h.key);
  expect(keys).toEqual(
    expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"])
  );
});
