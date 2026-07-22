import {
  publicConfigured,
  fetchApprovedEvents,
  fetchPlaces,
  fetchReportCounts,
  dedupeForDisplay,
} from "@/lib/public-db";
import PublicApp from "./PublicApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!publicConfigured()) {
    return (
      <main style={{ padding: 24 }}>
        <p>SUPABASE_ANON_KEY غير مضبوط — see web/.env.example</p>
      </main>
    );
  }

  // Events and places come through the anon key, so row-level security decides
  // what exists. Report counts need the service key (anon is INSERT-only on
  // reports) and are aggregated here — the browser receives numbers only.
  const [events, places, reportCounts] = await Promise.all([
    fetchApprovedEvents(),
    fetchPlaces(),
    fetchReportCounts().catch(() => ({})),
  ]);

  return (
    <PublicApp
      events={dedupeForDisplay(events)}
      places={places}
      reportCounts={reportCounts}
    />
  );
}
