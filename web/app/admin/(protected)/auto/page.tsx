import Link from "next/link";
import { isConfigured } from "@/lib/supabase";
import { fetchAutoApproved } from "@/lib/queue";
import EventCard from "../EventCard";
import Unpublish from "./Unpublish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AutoApprovedPage() {
  if (!isConfigured()) {
    return <section className="card"><p className="error">Supabase not configured.</p></section>;
  }

  let events;
  try {
    events = await fetchAutoApproved();
  } catch (err) {
    return (
      <section className="card">
        <h1>Auto-approved</h1>
        <pre className="trace">{String(err instanceof Error ? err.message : err)}</pre>
      </section>
    );
  }

  return (
    <>
      <p className="crumb"><Link href="/admin">← queue</Link></p>
      <section className="card summary">
        <h1>Auto-approved & published</h1>
        <p className="muted">
          {events.length} event{events.length === 1 ? "" : "s"} the parser published
          automatically — clean official announcements with every place name matched,
          confidence ≥ 0.90, all checks passed. Pull any of them down with one tap; it
          returns to the review queue and leaves the public app immediately.
        </p>
      </section>

      {events.length === 0 ? (
        <p className="muted empty">Nothing auto-approved yet.</p>
      ) : (
        <div className="event-list">
          {events.map((ev) => (
            <div key={ev.id}>
              <EventCard ev={ev} />
              <div style={{ marginTop: -6, paddingInlineStart: 4 }}>
                <Unpublish eventId={ev.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
