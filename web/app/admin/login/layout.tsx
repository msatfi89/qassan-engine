import type { Metadata } from "next";

/**
 * The login page is a client component and cannot export metadata itself, so
 * its noindex lives here. Without it, removing the site-wide noindex would
 * have left an indexable "9assan BETA — password" page in search results.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
