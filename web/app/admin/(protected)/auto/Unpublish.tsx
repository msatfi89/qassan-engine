"use client";

import { useState, useTransition } from "react";
import { unpublishEvent } from "@/lib/actions";

/** One-tap unpublish for an auto-approved event: returns it to the queue. */
export default function Unpublish({ eventId }: { eventId: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <span className="muted small">✓ unpublished — back in the queue</span>;

  return (
    <span className="decide">
      <button type="button" className="reject" disabled={pending}
              onClick={() => start(async () => {
                setError(null);
                try {
                  const r = await unpublishEvent(eventId);
                  if (r.changed === 0) setError("Already changed elsewhere");
                  else setDone(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed");
                }
              })}>
        {pending ? "…" : "Unpublish"}
      </button>
      {error && <span className="error small">{error}</span>}
    </span>
  );
}
