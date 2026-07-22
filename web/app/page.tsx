/**
 * Placeholder. The public app is Task 3 and must read APPROVED events only,
 * through the anon key with RLS. Nothing is approved yet, and RLS is not
 * written, so this deliberately shows no data rather than an empty feed that
 * looks broken.
 */
export default function Home() {
  return (
    <main className="login-wrap">
      <section className="card" style={{ maxWidth: 420, textAlign: "center" }}>
        <h1>
          قصّان <span className="badge">BETA</span>
        </h1>
        <p className="muted">
          متتبّع انقطاع الكهرباء والماء في تونس — قيد الإنشاء
        </p>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Tunisian power and water outage tracker — under construction
        </p>
      </section>
    </main>
  );
}
