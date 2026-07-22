import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Latin brand spelling is "9assan"; the Arabic قصّان is unchanged.
  // Identifiers (cookie name, localStorage keys, the device-hash pepper,
  // the package name) deliberately keep "qassan": renaming them would sign
  // Med out and orphan every stored area and device id.
  title: "9assan",
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
