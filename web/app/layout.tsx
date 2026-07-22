import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qassan",
  description: "Tunisian power and water outage tracker",
  // The dashboard is private and the public app is not launched; keep both
  // out of search results until Med decides otherwise.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
