import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import GalaxyBackground from "@/app/components/ui/GalaxyBackground";
import FloatingElements from "@/app/components/ui/FloatingElements";

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
};

export const viewport: Viewport = {
  themeColor: "#0f0f11",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <GalaxyBackground />
        <FloatingElements />
        {children}
      </body>
    </html>
  );
}
