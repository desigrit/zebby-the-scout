import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PM Application Tracker",
  description: "Track product management applications, match scores, resumes, and progress.",
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: "/brand-icon.png",
    shortcut: "/brand-icon.png",
    apple: "/brand-icon.png",
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
