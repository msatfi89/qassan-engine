import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchEvent, unmatchedNames } from "@/lib/queue";
import Highlighted from "./Highlighted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Africa/Tunis";

/**
 * Direction from the text itself, not from raw_documents.language.
 *
 * The collector labels a document "ar" if it contains a single Arabic
 * character, which is true of French articles that merely name Tunisian
 * places — and those then render right-aligned and hard to read. Judging by
 * which script actually dominates keeps a French bulletin in LTR while an
 * Arabic one stays RTL.
 */
function textDirection(text: string): "rtl" | "ltr" {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  return arabic >= latin ? "rtl" : "ltr";
}

function fmt(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: TZ,
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(iso));
}

export default async function EventDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const ev = await fetchEvent(eventId);
  if (!ev) notFound();

  const doc = ev.raw_documents;
  const parsed = doc?.parsed_json ?? null;
  const unmatched = unmatchedNames(ev);
  const matched = ev.event_areas
    .map((a) => (a.raw_name_text ?? "").trim())
    .filter(Boolean);
  const conf = ev.extraction_confidence ?? 0;

  return (
    <>
      <p className="crumb">
        <Link href="/admin">← back to the queue</Link>
      </p>

      <div className="compare">
        {/* -------- what the parser produced -------- */}
        <section className="card pane">
          <h2>Parsed reading</h2>

          <dl className="fields">
            <dt>Event</dt>
            <dd>#{ev.id}</dd>

            <dt>Utility</dt>
            <dd>{ev.utility === "water" ? "ماء / water" : "كهرباء / electricity"}</dd>

            <dt>Kind</dt>
            <dd>
              {ev.event_kind === "planned" ? "مبرمج / planned" : "مفاجئ / sudden"}
            </dd>

            <dt>Starts</dt>
            <dd>{fmt(ev.starts_at)}</dd>

            <dt>Ends</dt>
            <dd>
              {ev.end_time_official ? (
                fmt(ev.ends_at)
              ) : (
                <span className="no-official-end">
                  بدون توقيت رجوع رسمي — no official end time
                </span>
              )}
            </dd>

            <dt>Confidence</dt>
            <dd className={conf >= 0.85 ? "ok" : conf >= 0.5 ? "" : "error"}>
              {conf.toFixed(2)}
              {parsed?.confidence !== undefined && (
                <span className="muted">
                  {" "}
                  (extractor said {Number(parsed.confidence).toFixed(2)})
                </span>
              )}
            </dd>

            <dt>List final?</dt>
            <dd>
              {parsed?.list_final === false
                ? "no — the announcement says more areas may be added"
                : parsed?.list_final === true
                  ? "yes"
                  : "—"}
            </dd>

            <dt>Status</dt>
            <dd>{ev.approval_status}</dd>
          </dl>

          {ev.cause_text && <p className="cause">« {ev.cause_text} »</p>}

          <h3>
            Linked areas <span className="count">{ev.event_areas.length}</span>
          </h3>
          <div className="areas">
            {ev.event_areas.length === 0 && (
              <p className="warn">Linked to nowhere — cannot appear on a map.</p>
            )}
            {ev.event_areas.map((a) => (
              <span
                key={a.place_id}
                className={`area ${a.named_explicitly ? "explicit" : "broad"}`}
              >
                {a.places?.name_ar ?? a.raw_name_text}
                {!a.named_explicitly && <span className="muted"> (governorate)</span>}
              </span>
            ))}
          </div>

          {unmatched.length > 0 && (
            <>
              <h3>
                Not in the registry <span className="count">{unmatched.length}</span>
              </h3>
              <div className="areas">
                {unmatched.map((n) => (
                  <span key={n} className="area unknown">
                    {n}
                  </span>
                ))}
              </div>
              <p className="muted small">
                Read correctly from the text, but no matching place exists yet.
                Preserved, never dropped.
              </p>
            </>
          )}

          {(parsed?.confidence_reasons?.length ?? 0) > 0 && (
            <>
              <h3>Extractor&apos;s own caveats</h3>
              <ul className="reasons">
                {parsed!.confidence_reasons!.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* -------- the announcement as published -------- */}
        <section className="card pane">
          <h2>Original announcement</h2>
          <p className="muted small">
            Stored verbatim. This is the truth the reading must match.
          </p>

          <dl className="fields compact">
            <dt>Source</dt>
            <dd>
              {doc?.source_name ?? "—"}
              {doc?.source_url && (
                <>
                  {" · "}
                  <a href={doc.source_url} target="_blank" rel="noopener noreferrer">
                    open original ↗
                  </a>
                </>
              )}
            </dd>
            <dt>Published</dt>
            <dd>{fmt(doc?.published_at, false)}</dd>
            <dt>Collected</dt>
            <dd>{fmt(doc?.fetched_at, false)}</dd>
          </dl>

          <p className="legend">
            <mark className="hl ok">matched to a place</mark>{" "}
            <mark className="hl unknown">not in the registry</mark>
          </p>

          <div
            className="rawtext"
            dir={textDirection(doc?.raw_text ?? "")}
            lang={doc?.language ?? "ar"}
          >
            {doc?.raw_text ? (
              <Highlighted
                text={doc.raw_text}
                matched={matched}
                unmatched={unmatched}
              />
            ) : (
              <span className="muted">No stored text for this event.</span>
            )}
          </div>
        </section>
      </div>

      <p className="muted small foot-note">
        No approve or reject action exists yet — that is the next piece. Judge
        the readings first.
      </p>
    </>
  );
}
