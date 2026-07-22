import {
  publicConfigured,
  fetchApprovedEvents,
  fetchPlaces,
  type PublicEvent,
} from "@/lib/public-db";
import AreaAndReport from "./AreaAndReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Africa/Tunis";

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-TN", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function EventRow({ ev }: { ev: PublicEvent }) {
  const isWater = ev.utility === "water";
  const start = fmtTime(ev.starts_at);
  const end = fmtTime(ev.ends_at);
  // Named areas are the precise ones; governorate-level links are broad.
  const named = ev.event_areas.filter((a) => a.named_explicitly);
  const broad = ev.event_areas.filter((a) => !a.named_explicitly);

  return (
    <article className={`feed-item ${isWater ? "water" : "power"}`}>
      <div className="feed-head">
        <span className={`chip ${isWater ? "water" : "power"}`}>
          {isWater ? "ماء" : "كهرباء"}
        </span>
        <span className={`chip kind ${ev.event_kind}`}>
          {ev.event_kind === "planned" ? "مبرمج" : "مفاجئ"}
        </span>
        {/* Precision badge: green when the announcement named the areas. */}
        {named.length > 0 && <span className="chip precise">مناطق محدّدة</span>}
      </div>

      <p className="feed-when">
        <strong>{fmtDay(ev.starts_at)}</strong>
        {start && <span className="times"> · {start}</span>}
        {ev.end_time_official && end ? (
          <span className="times"> → {end}</span>
        ) : (
          <span className="no-official-end"> · بدون توقيت رجوع رسمي</span>
        )}
      </p>

      {(named.length > 0 || broad.length > 0) && (
        <p className="feed-areas">
          {named.map((a) => a.places?.name_ar).filter(Boolean).join("، ")}
          {named.length > 0 && broad.length > 0 && " — "}
          {broad.length > 0 && (
            <span className="muted">
              {broad.map((a) => a.places?.name_ar).filter(Boolean).join("، ")}
            </span>
          )}
        </p>
      )}

      {ev.cause_text && <p className="feed-cause">« {ev.cause_text} »</p>}

      {/* Contract: every public event shows its source. */}
      <p className="feed-source muted small">المصدر: بلاغ رسمي</p>
    </article>
  );
}

export default async function Home() {
  if (!publicConfigured()) {
    return (
      <main className="public-wrap">
        <section className="card">
          <h1>
            قصّان <span className="badge">BETA</span>
          </h1>
          <p className="muted">
            SUPABASE_ANON_KEY غير مضبوط — راجع web/.env.example
          </p>
        </section>
      </main>
    );
  }

  const [events, places] = await Promise.all([
    fetchApprovedEvents(),
    fetchPlaces(),
  ]);

  return (
    <main className="public-wrap">
      <header className="public-header">
        <h1>
          قصّان <span className="badge">BETA</span>
        </h1>
        <p className="muted small">انقطاع الكهرباء والماء في تونس</p>
      </header>

      <AreaAndReport places={places} />

      <section className="feed">
        <h2>آخر الانقطاعات المؤكّدة</h2>
        {events.length === 0 ? (
          /* Never render as a bare zero. An empty feed means nothing is
             confirmed right now, which is good news, not a broken app. */
          <p className="empty invite">
            ما فماش انقطاعات مؤكّدة توّا.
            <br />
            <span className="muted">
              إذا الضو مقصوص عندك، كن أول من يأكد.
            </span>
          </p>
        ) : (
          <div className="feed-list">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </section>

      <footer className="public-foot muted small">
        <p>
          المعطيات من بلاغات الشركة التونسية للكهرباء والغاز (STEG) والشركة
          الوطنية لاستغلال وتوزيع المياه (SONEDE) ومصادر إخبارية تونسية.
        </p>
        <p>نسخة تجريبية — لا نجمع أي بيانات شخصية.</p>
      </footer>
    </main>
  );
}
