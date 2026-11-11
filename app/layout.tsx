import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import GalaxyBackground from "@/app/components/ui/GalaxyBackground";
import FloatingElements from "@/app/components/ui/FloatingElements";
import ServiceWorker from "@/app/components/ServiceWorker";

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
  themeColor: "#0f0f11",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render per request so Next.js can stamp the CSP nonce from proxy.ts.
  await connection();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <GalaxyBackground />
        <FloatingElements />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
