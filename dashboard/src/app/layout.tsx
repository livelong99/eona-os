import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agentic OS — Local Studio",
  description: "Agent Home: local mission control over Hermes Agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* reducedMotion="user" propagates prefers-reduced-motion to all framer-motion
          children; no individual component needs its own media query. */}
      <body className="min-h-full bg-background">
        <MotionConfig reducedMotion="user">
          {/* AppShell mounts the spatial perspective context, AuroraField, and
              Grain so layout.tsx stays a Server Component (no "use client"). */}
          <AppShell>{children}</AppShell>
        </MotionConfig>
      </body>
    </html>
  );
}
