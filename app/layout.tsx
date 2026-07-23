import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listen - Text to Audio",
  description: "Convert text, PDF and EPUB into natural-sounding audiobooks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
