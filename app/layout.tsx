import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import GalaxyBackground from "@/app/components/ui/GalaxyBackground";
import FloatingElements from "@/app/components/ui/FloatingElements";
import ServiceWorker from "@/app/components/ServiceWorker";
import ThemeController from "@/app/components/ThemeController";
import { THEME_BOOT_SCRIPT } from "@/app/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NoteVoid — Markdown Notes",
  description:
    "A local-first Markdown notes app with live preview, syntax highlighting and PDF export.",
  applicationName: "NoteVoid",
  appleWebApp: { capable: true, title: "NoteVoid", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
  colorScheme: "dark light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render per request so Next.js can stamp the CSP nonce from proxy.ts.
  await connection();
  // The theme script must carry this request's CSP nonce to run.
  const csp = (await headers()).get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* A constant string, not user content. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <GalaxyBackground />
        <FloatingElements />
        <ServiceWorker />
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
