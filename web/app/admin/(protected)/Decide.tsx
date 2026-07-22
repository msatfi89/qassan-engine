"use client";

import { useState, useTransition } from "react";
import { decideEvent } from "@/lib/actions";

/**
 * Approve / reject for one event.
 *
 * Reject asks for a confirmation, approve does not. The asymmetry is
 * deliberate: approving is the routine action and gets fast, while rejecting
 * is the one that makes an event disappear from the queue.
 */
export default function Decide({ eventId }: { eventId: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run(decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await decideEvent(eventId, decision);
        if (res.changed === 0) {
          setError("Already decided elsewhere — reload to see its status.");
          return;
        }
        setDone(decision === "approve" ? "approved" : "rejected");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  if (done) {
    return (
      <p className={done === "approved" ? "ok decided" : "muted decided"}>
        {done === "approved" ? "✓ approved — now public" : "✕ rejected"}
      </p>
    );
  }

  return (
    <div className="decide">
      <button
        type="button"
        className="approve"
        disabled={pending}
        onClick={() => run("approve")}
      >
        {pending ? "…" : "وافق / Approve"}
      </button>

      {confirming ? (
        <>
          <span className="muted small">Sure?</span>
          <button
            type="button"
            className="reject confirm"
            disabled={pending}
            onClick={() => run("reject")}
          >
            Yes, reject
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
        <button
          type="button"
          className="reject"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          ارفض / Reject
        </button>
      )}

      {error && <span className="error small">{error}</span>}
    </div>
  );
}
