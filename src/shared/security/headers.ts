/**
 * Security headers. Kept free of Next.js imports so the policy can be unit
 * tested and shared by `proxy.ts` (per-request CSP) and `next.config.ts`
 * (static headers for every response, API routes included).
 */

export interface CspOptions {
  nonce: string;
  /** React needs `eval` in development to rebuild server error stacks. */
  dev?: boolean;
}

export function buildCsp({ nonce, dev = false }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets the nonced Next.js runtime load its own chunks
    // (including the lazily imported PDF exporter) and nothing else.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Server-rendered `style` attributes cannot carry a nonce.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Notes may embed remote images; the PDF export draws through blob/data URLs.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  // No `upgrade-insecure-requests`: it would break self-hosting over plain
  // HTTP on a LAN. HTTPS and HSTS belong to the reverse proxy in front.
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Headers that are the same for every response. */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];
