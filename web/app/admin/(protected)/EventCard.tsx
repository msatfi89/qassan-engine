import Link from "next/link";
import type { QueueEvent } from "@/lib/queue";
import { unmatchedNames } from "@/lib/queue";
import Decide from "./Decide";

/** Tunisia is UTC+1 year-round. Render in local time, never in the viewer's. */
const TZ = "Africa/Tunis";

/** Judge direction by the dominant script: the collector marks a document
 *  "ar" if it holds a single Arabic character, which is true of French
 *  bulletins that merely name Tunisian places. */
function textDirection(text: string): "rtl" | "ltr" {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  return arabic >= latin ? "rtl" : "ltr";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // The year is not optional here: the queue mixes backfilled 2023-2025
  // announcements with today's, and "ven. 24 juil." alone cannot be told
  // apart between them — which is precisely where a mistake would matter.
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
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

export default function EventCard({ ev }: { ev: QueueEvent }) {
  const unmatched = unmatchedNames(ev);
  const conf = ev.extraction_confidence ?? 0;
  const isWater = ev.utility === "water";
  const start = fmtTime(ev.starts_at);
  const end = fmtTime(ev.ends_at);
  const doc = ev.raw_documents;
  const reasons = doc?.parsed_json?.confidence_reasons ?? [];
  const rawText = doc?.raw_text ?? "";
  const dir = textDirection(rawText);

  return (
    <article className="event">
      <div className="event-head">
        <span className={`chip ${isWater ? "water" : "power"}`}>
          {isWater ? "ماء" : "كهرباء"}
        </span>

        {/* Planned and sudden must never blur into one another. */}
        <span className={`chip kind ${ev.event_kind}`}>
          {ev.event_kind === "planned" ? "مبرمج" : "مفاجئ"}
        </span>

        {ev.backfilled && <span className="chip archive">أرشيف</span>}

        <span className="event-id">#{ev.id}</span>
        <span className={`conf ${conf >= 0.85 ? "hi" : conf >= 0.5 ? "mid" : "lo"}`}>
          {conf.toFixed(2)}
        </span>
      </div>

      <div className="event-when">
        <strong>{fmtDate(ev.starts_at)}</strong>
        <span className="times">
          {start ?? "—"}
          {/* end_time_official=false must never render as a firm end time. */}
          {ev.end_time_official && end ? (
            <> → {end}</>
          ) : (
            <span className="no-official-end"> — بدون توقيت رجوع رسمي</span>
          )}
        </span>
      </div>

      {ev.cause_text && <p className="cause">« {ev.cause_text} »</p>}

      <div className="areas">
        {ev.event_areas.length === 0 ? (
          <p className="warn">لا توجد مناطق مرتبطة — this event maps to nowhere</p>
        ) : (
          ev.event_areas.map((a) => (
            <span
              key={a.place_id}
              className={`area ${a.named_explicitly ? "explicit" : "broad"}`}
              title={
                a.named_explicitly
                  ? "named in the announcement"
                  : "governorate-level, inferred from the announcement's scope"
              }
            >
              {a.places?.name_ar ?? a.raw_name_text}
            </span>
          ))
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="unmatched">
          <span className="unmatched-label">
            غير معروفة ({unmatched.length}):
          </span>
          {unmatched.map((n) => (
            <span key={n} className="area unknown">
              {n}
            </span>
          ))}
        </div>
      )}

      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {/* Every event shows its source — contract line, and the only way to
          check an extraction against what was actually published. */}
      <div className="event-foot">
        <span className="muted">{doc?.source_name ?? "unknown source"}</span>
        {doc?.source_url && (
          <a href={doc.source_url} target="_blank" rel="noopener noreferrer">
            المصدر ↗
          </a>
        )}
        {/* The only way to judge a reading is against the text it came from. */}
        <Link href={`/admin/event/${ev.id}`} className="compare-link">
          قارن بالنص الأصلي →
        </Link>
      </div>

      {/* Inline and collapsed by default: approving on a phone should not
          require leaving the queue, but 60k characters cannot be open on
          every card at once. */}
      {rawText && (
        <details className="rawpeek">
          <summary>النص الأصلي / original text</summary>
          <div className="rawtext" dir={dir} lang={doc?.language ?? "ar"}>
            {rawText}
          </div>
        </details>
      )}

      <Decide eventId={ev.id} />
    </article>
  );
}
