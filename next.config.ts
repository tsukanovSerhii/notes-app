import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/shared/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: STATIC_SECURITY_HEADERS },
      {
        // The service worker must be re-checked on every load so updates ship.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
