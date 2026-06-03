// Root layout — loads fonts, applies global styles, and mounts the
// galaxy + floating-element background behind every page.

import type { Metadata } from "next";
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
  description: "A clean, dark Markdown notes app.",
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
