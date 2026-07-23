import {
  publicConfigured,
  fetchApprovedEvents,
  fetchPlaces,
  fetchReportCounts,
  fetchReportCount24h,
  dedupeForDisplay,
} from "@/lib/public-db";
import { PublicProvider } from "../PublicApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shared shell for every public route. Fetches the data once and provides it
 * (plus all client state and derived values) through PublicProvider. Because a
 * Next.js layout persists across navigation to its sibling routes, the store —
 * selected area, language, theme — survives moving between tabs; only the page
 * (the View) swaps. Tab content is therefore decided by the URL, never by
 * carried-over render state.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  if (!publicConfigured()) {
    return <main style={{ padding: 24 }}><p>SUPABASE_ANON_KEY غير مضبوط — see web/.env.example</p></main>;
  }

  const [events, places, reportCounts, reports24] = await Promise.all([
    fetchApprovedEvents(),
    fetchPlaces(),
    fetchReportCounts().catch(() => ({})),
    fetchReportCount24h().catch(() => 0),
  ]);

  return (
    <PublicProvider data={{ events: dedupeForDisplay(events), places, reportCounts, reports24 }}>
      {children}
    </PublicProvider>
  );
}
