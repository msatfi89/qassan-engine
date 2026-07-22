"use client";

import { useState, useTransition } from "react";
import { approveMany } from "@/lib/actions";

/**
 * One-tap approve for the >= 0.85 tier.
 *
 * Sends the ids that were actually rendered, not "everything above the
 * threshold", so an event that arrived after the page loaded cannot be
 * approved unseen. Confirms first: this is the one control that publishes
 * many events at once.
 */
export default function BulkApprove({ ids }: { ids: number[] }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (ids.length === 0) return null;

  function go() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await approveMany(ids);
        setResult(`✓ ${res.changed} event${res.changed === 1 ? "" : "s"} approved`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  if (result) return <p className="ok bulkbar">{result}</p>;

  return (
    <div className="bulkbar">
      {confirming ? (
        <>
          <span>
            Approve all {ids.length}? They become publicly visible immediately.
          </span>
          <button type="button" className="approve" disabled={pending} onClick={go}>
            {pending ? "…" : `Yes, approve ${ids.length}`}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="approve" onClick={() => setConfirming(true)}>
          وافق على الكل ({ids.length}) / Approve all
        </button>
      )}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
