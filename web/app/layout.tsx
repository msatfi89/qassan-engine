import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Latin brand spelling is "9assan"; the Arabic قصّان is unchanged.
  // Identifiers (cookie name, localStorage keys, the device-hash pepper,
  // the package name) deliberately keep "qassan": renaming them would sign
  // Med out and orphan every stored area and device id.
  title: "9assan",
  description: "متتبّع انقطاع الكهرباء والماء في تونس — 9assan",
  // The public app is launching, so the site-wide noindex is gone. /admin
  // re-adds it for itself: removing it here without that would have put the
  // approval dashboard into Google.
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
