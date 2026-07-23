"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, Droplets, Clock, Radio, MapPin, Languages, AlertTriangle, Crosshair } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";
import { computeStatus, feedOrder, type StatusResult } from "@/lib/status";
import { governorateAt } from "@/lib/geo";
import type { PublicEvent, PublicPlace, PlaceReportCounts } from "@/lib/public-db";
import AreaAndReport from "./AreaAndReport";
import TunisiaMap, { type MapDatum } from "./TunisiaMap";

/** How far back the front page looks. The archive stays in the database and
 *  keeps its value; it just does not belong on a page answering "is my power
 *  out right now" — a 3 July outage listed there reads as news. */
const FEED_WINDOW_HOURS = 48;

const LANG_KEY = "qassan.lang";
const AREA_KEY = "qassan.area";
const TZ = "Africa/Tunis";

type Ev = PublicEvent & { _status: StatusResult };

/** Direction of a specific string, independent of the UI language. Cause
 *  quotes are verbatim announcement text and must render as sourced. */
function dirOf(text: string): "rtl" | "ltr" {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const la = (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  return ar >= la ? "rtl" : "ltr";
}

/**
 * A place's name in the chosen language.
 *
 * French where we actually have it — all 24 governorates, but only ~80 of 280
 * delegations. For the rest, fall back to the Arabic name rather than invent a
 * transliteration: a made-up French spelling is worse than an honest Arabic
 * one, and the design contract's rule against inventing data applies to place
 * names too.
 */
function placeName(p: { name_ar: string; name_fr: string | null } | null, lang: Lang): string {
  if (!p) return "";
  return lang === "fr" && p.name_fr ? p.name_fr : p.name_ar;
}

function hhmm(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

function dayLabel(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-TN", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
  }).format(new Date(iso));
}

/* ---------- status badge (reference: StatusBadge) ---------- */
function StatusBadge({ ev, lang }: { ev: Ev; lang: Lang }) {
  const s = STR[lang];
  if (ev._status.status === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,106,85,0.15)", color: T.live }}>
        <Radio size={11} className="animate-pulse" /> {s.liveNow}
      </span>
    );
  }
  const sudden = ev.event_kind === "sudden";
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: sudden ? "rgba(255,182,55,0.12)" : "rgba(140,161,179,0.12)",
            color: sudden ? T.amber : T.muted,
          }}>
      {sudden ? s.sudden : s.planned}
      {ev._status.status === "ended" && ` · ${s.ended}`}
    </span>
  );
}

/* ---------- day strip (reference: DayStrip) ---------- */
function DayStrip({ events, lang }: { events: Ev[]; lang: Lang }) {
  const s = STR[lang];
  const [nowH, setNowH] = useState<number | null>(null);

  // Computed after mount: the server and the visitor are in different clocks,
  // and rendering "now" on the server would hydrate to the wrong position.
  useEffect(() => {
    const tick = () => {
      const p = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date());
      const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
      const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
      setNowH(h + m / 60);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toDateString();
  const bands = events.filter(
    (e) => e.utility === "electricity" && e.starts_at &&
           new Date(e.starts_at).toDateString() === today
  ).map((e) => {
    const st = new Date(e.starts_at!);
    const en = e.ends_at ? new Date(e.ends_at) : new Date(st.getTime() + 6 * 3600_000);
    const toH = (d: Date) => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
      return Number(p.find((x) => x.type === "hour")?.value ?? 0) + Number(p.find((x) => x.type === "minute")?.value ?? 0) / 60;
    };
    return { start: toH(st), end: toH(en) };
  });

  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold" style={{ color: T.text }}>{s.timeline}</span>
        {nowH !== null && (
          <span className="text-xs" style={{ color: T.muted }}>
            {String(Math.floor(nowH)).padStart(2, "0")}:{String(Math.round((nowH % 1) * 60)).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="relative h-9 rounded-lg overflow-hidden flex" style={{ background: T.surface2 }}>
        {Array.from({ length: 24 }, (_, h) => {
          const inBand = bands.some((b) => h >= Math.floor(b.start) && h < Math.ceil(b.end));
          const isPast = nowH !== null && h < Math.floor(nowH);
          return (
            <div key={h} className="flex-1 border-l first:border-l-0"
                 style={{
                   borderColor: "rgba(36,54,70,0.6)",
                   background: inBand ? (isPast ? "rgba(138,99,32,0.55)" : "rgba(255,182,55,0.85)") : "transparent",
                   opacity: isPast && !inBand ? 0.35 : 1,
                 }} />
          );
        })}
        {nowH !== null && (
          <div className="absolute top-0 bottom-0 w-0.5"
               style={{
                 insetInlineStart: `${(nowH / 24) * 100}%`,
                 background: T.live, boxShadow: `0 0 8px ${T.live}`,
               }} />
        )}
      </div>
      <div className="flex justify-between mt-1 text-[10px]" style={{ color: T.muted }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

/* ---------- feed card ---------- */
function EventCard({ ev, lang }: { ev: Ev; lang: Lang }) {
  const s = STR[lang];
  const water = ev.utility === "water";
  const observation = !ev.is_official;
  const named = ev.event_areas.filter((a) => a.named_explicitly);
  const broad = ev.event_areas.filter((a) => !a.named_explicitly);
  const start = hhmm(ev.starts_at);
  const end = hhmm(ev.ends_at);
  const live = ev._status.status === "live";

  // Observations get their own violet edge, distinct from live-red and the
  // amber/aqua of official cuts, so "unconfirmed sighting" never looks
  // official at a glance.
  const edge = observation ? T.observed : live ? "rgba(255,106,85,0.4)" : T.line;

  return (
    <div className="rounded-2xl p-4"
         style={{
           background: T.surface,
           border: `1px solid ${edge}`,
           opacity: ev._status.status === "ended" && !observation ? 0.55 : 1,
         }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: `${observation ? T.observed : water ? T.aqua : T.amber}1A` }}>
          {water ? <Droplets size={18} color={observation ? T.observed : T.aqua} />
                 : <Zap size={18} color={observation ? T.observed : T.amber}
                        fill={observation ? "none" : T.amber} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge ev={ev} lang={lang} />
            <span className="text-xs" style={{ color: T.muted }}>{dayLabel(ev.starts_at, lang)}</span>
          </div>

          {observation && (
            <p className="text-xs font-bold mb-1" style={{ color: T.observed }}>
              {s.observed}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: T.muted }}>
            <Clock size={12} />
            <span className="font-semibold" style={{ color: T.text }}>
              {start ?? "—"}
              {ev.end_time_official && end ? ` → ${end}` : ""}
            </span>
            {!ev.end_time_official && !observation && (
              <span style={{ color: T.amber }}>· {s.endsUnknown}</span>
            )}
          </div>

          {(named.length > 0 || broad.length > 0) && (
            <p className="text-sm mt-2 leading-relaxed" style={{ color: T.text }}>
              {named.map((a) => placeName(a.places, lang)).filter(Boolean).join("، ")}
              {named.length > 0 && broad.length > 0 && " — "}
              {broad.length > 0 && (
                <span style={{ color: T.muted }}>
                  {broad.map((a) => placeName(a.places, lang)).filter(Boolean).join("، ")}
                </span>
              )}
            </p>
          )}

          {ev.cause_text && (
            /* Verbatim: rendered in its own direction, not the UI's, and never
               translated — true of both an announcement quote and Med's note. */
            <p className="text-xs mt-2 ps-2 border-s" dir={dirOf(ev.cause_text)}
               style={{ color: T.muted, borderColor: T.line }}>
              « {ev.cause_text} »
            </p>
          )}

          <p className="text-xs mt-2" style={{ color: T.muted }}>
            {observation ? (
              ev.source_url ? (
                <a href={ev.source_url} target="_blank" rel="noopener noreferrer"
                   style={{ color: T.observed }}>
                  {s.source} ↗
                </a>
              ) : s.observedShort
            ) : (
              `${s.source}: STEG / SONEDE`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- the app ---------- */
export default function PublicApp({
  events, places, reportCounts,
}: {
  events: PublicEvent[];
  places: PublicPlace[];
  reportCounts: Record<number, PlaceReportCounts>;
}) {
  const [lang, setLang] = useState<Lang>("ar");
  const [areaId, setAreaId] = useState<number | null>(null);
  const [tab, setTab] = useState<"all" | "electricity" | "water">("all");
  const [govFilter, setGovFilter] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const s = STR[lang];
  const rtl = lang === "ar";

  /**
   * Locate the visitor without transmitting anything.
   *
   * The browser gives us coordinates, we test them against the bundled
   * governorate polygons in this tab, and we keep only the answer. The
   * latitude and longitude are never sent to our server, never stored, and
   * never written to localStorage — the design contract says device_hash
   * only, and this respects it because no location ever leaves the device.
   */
  function locateMe() {
    if (!("geolocation" in navigator)) { setLocError(s.locationDenied); return; }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gov = governorateAt(pos.coords.longitude, pos.coords.latitude);
        setLocating(false);
        if (!gov) { setLocError(s.locationDenied); return; }
        const match = places.find(
          (p) => p.level === "governorate" && p.name_ar === gov.properties.name_ar
        );
        if (!match) { setLocError(s.locationDenied); return; }
        // Selects the governorate; the delegation is still the user's choice,
        // because nothing in the registry knows where delegations are.
        setGovFilter(gov.properties.name_ar);
        setAreaId(match.id);
        localStorage.setItem(AREA_KEY, String(match.id));
      },
      () => { setLocating(false); setLocError(s.locationDenied); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }
    );
  }

  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ar" || saved === "fr") setLang(saved);
    const a = Number(localStorage.getItem(AREA_KEY));
    if (a) setAreaId(a);
  }, []);

  // Zoom the map to the chosen area's governorate whenever an area is picked
  // (including one restored from localStorage on load). Without this the map
  // stays on the national view and the delegation layer is invisible unless
  // the user happens to discover that governorates are tappable — which is why
  // it looked like "no delegations". The back control still returns to
  // national, and with no area chosen the national view remains the default.
  useEffect(() => {
    if (areaId == null) return;
    const byId = new Map(places.map((x) => [x.id, x]));
    let p = byId.get(areaId);
    while (p && p.level !== "governorate") p = p.parent_id ? byId.get(p.parent_id) : undefined;
    if (p) setGovFilter(p.name_ar);
  }, [areaId, places]);

  // Drive the document so native RTL applies to scrollbars, form controls
  // and text selection, not just our own layout.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    localStorage.setItem(LANG_KEY, lang);
  }, [lang, rtl]);

  const withStatus: Ev[] = useMemo(
    () => events.map((e) => ({ ...e, _status: computeStatus(e) })),
    [events]
  );

  const area = places.find((p) => p.id === areaId) ?? null;

  // Place-tree helpers. The tree is now three deep (governorate → delegation →
  // neighborhood), so every rollup walks to the top rather than one level.
  const tree = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    // self + every ancestor id, so an event/report at any level matches an
    // area at that level OR any level above it.
    const ancestors = (id: number): Set<number> => {
      const out = new Set<number>();
      let p = byId.get(id);
      while (p) { out.add(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined; }
      return out;
    };
    const govNameOf = (id: number): string | null => {
      let p = byId.get(id);
      while (p && p.level !== "governorate") p = p.parent_id ? byId.get(p.parent_id) : undefined;
      return p?.name_ar ?? null;
    };
    // The delegation ancestor of any place (itself if it is a delegation),
    // for rolling neighborhood reports up onto the delegation map.
    const delegationIdOf = (id: number): number | null => {
      let p = byId.get(id);
      while (p && p.level !== "delegation") p = p.parent_id ? byId.get(p.parent_id) : undefined;
      return p?.id ?? null;
    };
    // every descendant id (a delegation's neighborhoods, a gov's everything),
    // so an area's report count includes finer reports beneath it.
    const kids = new Map<number, number[]>();
    for (const p of places) if (p.parent_id != null) (kids.get(p.parent_id) ?? kids.set(p.parent_id, []).get(p.parent_id)!).push(p.id);
    const descendants = (id: number): number[] => {
      const out: number[] = [], stack = [id];
      while (stack.length) { const c = stack.pop()!; for (const k of kids.get(c) ?? []) { out.push(k); stack.push(k); } }
      return out;
    };
    return { byId, ancestors, govNameOf, delegationIdOf, descendants };
  }, [places]);
  const govNameOf = tree.govNameOf;

  // Events touching my area: at the area itself, or at any level above it (a
  // governorate-wide bulletin covers a neighborhood inside it).
  const mine = useMemo(() => {
    if (!area) return [];
    const ids = tree.ancestors(area.id);
    return withStatus.filter((e) => e.event_areas.some((a) => ids.has(a.place_id)));
  }, [withStatus, area, tree]);

  const myLive = mine.find((e) => e._status.status === "live");
  const myNext = mine.filter((e) => e._status.status === "upcoming")
                     .sort((a, b) => (a._status.startsInMin ?? 0) - (b._status.startsInMin ?? 0))[0];
  const namedInLive = myLive?.event_areas.some((a) => a.place_id === area?.id && a.named_explicitly);

  const recent = useMemo(() => {
    const cutoff = Date.now() - FEED_WINDOW_HOURS * 3600_000;
    return withStatus.filter((e) => {
      if (e._status.status === "upcoming") return true; // always show what is coming
      if (!e.starts_at) return false;                   // undated archive rows
      return new Date(e.starts_at).getTime() >= cutoff;
    });
  }, [withStatus]);

  const feed = useMemo(() => {
    let list = recent.filter((e) => tab === "all" || e.utility === tab);
    if (govFilter) {
      list = list.filter((e) => e.event_areas.some((a) => govNameOf(a.place_id) === govFilter));
    }
    return feedOrder(list);
  }, [recent, tab, govFilter, govNameOf]);

  /** Map shading. Built from the same recent window the feed uses, so the map
   *  and the list can never disagree about what is happening. */
  // Two layers so the map can shade the national view AND the zoomed-in
  // delegation view from the same events: one keyed by governorate name, one
  // by delegation place_id.
  const { mapData, delData } = useMemo(() => {
    const gov: Record<string, MapDatum> = {};
    const del: Record<number, MapDatum> = {};
    const blank = (): MapDatum => ({ liveElectric: false, liveWater: false, upcoming: false, observed: false, reports: 0 });
    const touchGov = (name: string) => (gov[name] ??= blank());
    const touchDel = (id: number) => (del[id] ??= blank());
    const apply = (d: MapDatum, e: (typeof recent)[number]) => {
      if (!e.is_official) { d.observed = true; return; }
      if (e._status.status === "live") {
        if (e.utility === "water") d.liveWater = true; else d.liveElectric = true;
      } else if (e._status.status === "upcoming") d.upcoming = true;
    };
    for (const e of recent) {
      for (const a of e.event_areas) {
        const g = govNameOf(a.place_id);
        if (g) apply(touchGov(g), e);
        // Roll any sub-governorate link up onto its delegation for the zoomed
        // view. A governorate-wide link (delegationIdOf null) colours the
        // national view only, so a province bulletin does not paint every town.
        const delId = tree.delegationIdOf(a.place_id);
        if (delId) apply(touchDel(delId), e);
      }
    }
    for (const [placeId, c] of Object.entries(reportCounts)) {
      const id = Number(placeId);
      const cuts = c.electricity.cut + c.water.cut;
      if (cuts <= 0) continue;
      const g = govNameOf(id);
      if (g) touchGov(g).reports += cuts;
      const delId = tree.delegationIdOf(id);
      if (delId) touchDel(delId).reports += cuts;
    }
    return { mapData: gov, delData: del };
  }, [recent, reportCounts, govNameOf, tree]);

  // Reports for the selected area: its own plus everything beneath it, so a
  // delegation's count includes its neighborhoods and a neighborhood shows just
  // its own. Aggregation is upward for display, per the spec.
  const counts = useMemo(() => {
    if (!area) return undefined;
    const ids = [area.id, ...tree.descendants(area.id)];
    const acc = { electricity: { cut: 0, restored: 0 }, water: { cut: 0, restored: 0 } };
    for (const id of ids) {
      const c = reportCounts[id];
      if (!c) continue;
      acc.electricity.cut += c.electricity.cut;
      acc.water.cut += c.water.cut;
    }
    return acc;
  }, [area, reportCounts, tree]);

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-5" style={{ color: T.text }}>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold">
            {s.appName}{" "}
            <span className="align-middle text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ borderColor: T.amber, color: T.amber }}>
              {s.beta}
            </span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: T.muted }}>{s.tagline}</p>
        </div>
        <button onClick={() => setLang(rtl ? "fr" : "ar")}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}
                aria-label="language">
          <Languages size={14} /> {rtl ? "FR" : "ع"}
        </button>
      </header>

      {/* ---- AREA FIRST: the question people open the app to answer ---- */}
      <section className="rounded-2xl p-4 mb-4"
               style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={15} color={T.muted} />
          <span className="text-sm font-bold">{s.myArea}</span>
        </div>

        {area ? (
          <>
            <div className="rounded-xl p-4 mb-3 text-center"
                 style={{
                   background: myLive ? "rgba(255,106,85,0.12)" : "rgba(91,208,143,0.10)",
                   border: `1px solid ${myLive ? T.live : T.ok}`,
                 }}>
              <p className="text-xl font-extrabold" style={{ color: myLive ? T.live : T.ok }}>
                {myLive ? s.cutNow : s.poweredNow}
              </p>
              <p className="text-sm mt-1" style={{ color: T.text }}>{placeName(area, lang)}</p>
              {myLive && (
                <p className="text-xs mt-1" style={{ color: T.muted }}>
                  {namedInLive ? s.cityNamed : s.govOnly}
                </p>
              )}
              {!myLive && myNext?.starts_at && (
                <p className="text-xs mt-1" style={{ color: T.amber }}>
                  {s.nextCut}: {hhmm(myNext.starts_at)}
                </p>
              )}
              {!myLive && !myNext && (
                <p className="text-xs mt-1" style={{ color: T.muted }}>{s.noArea}</p>
              )}
              {counts && (counts.electricity.cut > 0 || counts.water.cut > 0) && (
                <p className="text-xs mt-2" style={{ color: T.muted }}>
                  {counts.electricity.cut > 0 && (
                    <span style={{ color: T.amber }}>
                      ⚡ {s.confirmedElec} {counts.electricity.cut}
                    </span>
                  )}
                  {counts.electricity.cut > 0 && counts.water.cut > 0 && " · "}
                  {counts.water.cut > 0 && (
                    <span style={{ color: T.aqua }}>
                      💧 {s.confirmedWater} {counts.water.cut}
                    </span>
                  )}
                </p>
              )}
            </div>
            <button onClick={() => { setAreaId(null); localStorage.removeItem(AREA_KEY); }}
                    className="text-xs" style={{ color: T.muted }}>
              {s.pickArea} ↻
            </button>
          </>
        ) : (
          <p className="text-xs mb-3" style={{ color: T.muted }}>{s.pickArea}</p>
        )}

        <AreaAndReport places={places} lang={lang} onAreaChange={setAreaId} selectedId={areaId} />

        <button onClick={locateMe} disabled={locating}
                className="flex items-center gap-1.5 mt-3 text-xs px-3 py-2 rounded-lg"
                style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted }}>
          <Crosshair size={13} /> {locating ? s.locating : s.useMyLocation}
        </button>
        {locError && <p className="text-xs mt-2" style={{ color: T.amber }}>{locError}</p>}
        <p className="text-[11px] mt-1.5" style={{ color: T.muted }}>
          {rtl
            ? "موقعك يتحدد داخل هاتفك فقط — ما نبعثوه لحتى مكان."
            : "Votre position est calculée sur votre téléphone — rien n'est transmis."}
        </p>
      </section>

      <div className="mb-4">
        <TunisiaMap govData={mapData} delData={delData} lang={lang}
                    selected={govFilter} onSelect={setGovFilter} />
      </div>

      {area && mine.length > 0 && (
        <div className="mb-4"><DayStrip events={mine} lang={lang} /></div>
      )}

      {/* ---- risk banner ---- */}
      {withStatus.some((e) => e._status.status === "live" && e.utility === "electricity") && (
        <div className="rounded-2xl p-4 mb-4 flex gap-3"
             style={{ background: "rgba(255,182,55,0.08)", border: `1px solid ${T.amberDim}` }}>
          <AlertTriangle size={18} color={T.amber} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold" style={{ color: T.amber }}>{s.whyTitle}</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: T.muted }}>{s.whyBody}</p>
            <p className="text-xs mt-2" style={{ color: T.muted }}>{s.hotline}</p>
          </div>
        </div>
      )}

      {/* ---- feed ---- */}
      <div className="flex gap-2 mb-3">
        {([["all", s.all], ["electricity", s.elec], ["water", s.water]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: tab === id ? T.surface2 : "transparent",
                    border: `1px solid ${tab === id ? T.line : "transparent"}`,
                    color: tab === id ? (id === "water" ? T.aqua : id === "electricity" ? T.amber : T.text) : T.muted,
                  }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2.5">
        {feed.length === 0 ? (
          <p className="rounded-2xl p-6 text-center text-sm leading-loose"
             style={{ border: `1px dashed ${T.line}`, color: T.muted }}>
            {s.noArea}
            <br />
            <span style={{ color: T.text }}>{s.beFirst}</span>
          </p>
        ) : (
          feed.map((ev) => <EventCard key={ev.id} ev={ev} lang={lang} />)
        )}
      </div>

      <footer className="mt-8 pt-4 text-center text-xs leading-relaxed"
              style={{ borderTop: `1px solid ${T.line}`, color: T.muted }}>
        <p>{s.sources}</p>
        <p className="mt-1">{s.beta} — {rtl ? "لا نجمع أي بيانات شخصية" : "aucune donnée personnelle collectée"}</p>
      </footer>
    </main>
  );
}
