import { isConfigured } from "@/lib/supabase";
import { fetchPendingEvents, splitByConfidence, BULK_THRESHOLD } from "@/lib/queue";
import EventCard from "./EventCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminQueue() {
  if (!isConfigured()) {
    return (
      <section className="card">
        <h1>Approval queue</h1>
        <p className="error">Supabase is not configured.</p>
        <p className="muted">
          Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_KEY</code> to{" "}
          <code>web/.env.local</code> (locally) or to the Vercel project&apos;s
          environment variables. See <code>web/.env.example</code>.
        </p>
      </section>
    );
  }

  let events;
  try {
    events = await fetchPendingEvents();
  } catch (err) {
    // Show the real reason rather than a blank page — the same lesson the
    // collector taught when a 403 spent three runs disguised as "0 documents".
    return (
      <section className="card">
        <h1>Approval queue</h1>
        <p className="error">Could not load the queue.</p>
        <pre className="trace">{String(err instanceof Error ? err.message : err)}</pre>
      </section>
    );
  }

  const { high, low } = splitByConfidence(events);

  return (
    <>
      <section className="card summary">
        <h1>Approval queue</h1>
        <p className="muted">
          {events.length} pending event{events.length === 1 ? "" : "s"} — none
          published. Nothing leaves this page until you approve it.
        </p>
      </section>

      <section className="queue-section">
        <h2>
          Ready for bulk approval
          <span className="count">{high.length}</span>
        </h2>
        <p className="muted small">
          Confidence ≥ {BULK_THRESHOLD.toFixed(2)}: every place name the
          extractor found is in the registry and the deterministic checks
          passed.
        </p>
        {high.length === 0 ? (
          <p className="muted empty">
            Nothing here yet. Confidence is capped at 0.60 whenever an
            announcement names a place the registry does not know, so events
            reach this tier only once coverage catches up.
          </p>
        ) : (
          <div className="event-list">
            {high.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </section>

      <section className="queue-section">
        <h2>
          Needs individual review
          <span className="count">{low.length}</span>
        </h2>
        <p className="muted small">
          Below {BULK_THRESHOLD.toFixed(2)} — usually unknown place names, not a
          bad reading. Check each against its source.
        </p>
        {low.length === 0 ? (
          <p className="muted empty">Nothing to review.</p>
        ) : (
          <div className="event-list">
            {low.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
