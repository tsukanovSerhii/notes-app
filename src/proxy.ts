import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce } from "@/shared/security/headers";

/**
 * Adds a per-request nonce-based Content Security Policy to pages. Next.js
 * reads the nonce from the request header and stamps it on its own scripts,
 * so an injected <script> without the nonce never runs.
 */
export function proxy(request: NextRequest) {
  const csp = buildCsp({
    nonce: createNonce(),
    dev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API responses are JSON, static files carry no scripts.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icons|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
