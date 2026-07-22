export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Piece 1 deliberately renders nothing but proof that the lock works. The
 * pending-events queue arrives in piece 2; putting it here now would mean
 * shipping the queue and the auth untested together.
 */
export default function AdminHome() {
  return (
    <section className="card">
      <h1>Approval dashboard</h1>
      <p className="ok">You are signed in. The session cookie verified.</p>
      <p className="muted">
        Nothing is behind this page yet. Next: the pending-events queue,
        grouped by confidence, with each event shown beside the original
        announcement text it came from.
      </p>
      <p className="muted">
        No event has been approved. Nothing publishes until one is.
      </p>
    </section>
  );
}
