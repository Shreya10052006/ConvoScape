import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConvoScape",
  description: "Practise the conversation before it happens.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
