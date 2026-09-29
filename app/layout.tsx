import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PM Application Tracker",
  description: "Track product management applications, match scores, resumes, and progress.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
