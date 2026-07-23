"use client";

import { useMemo, useState } from "react";
import {
  GOVERNORATES, DELEGATIONS, delegationsOf, makeProjection, makeProjectionFor,
  pathFor, projectedBounds,
} from "@/lib/geo";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Choropleth of Tunisia, shaded by what is happening now, with two zoom
 * levels (governorates → one governorate's delegations), on-shape labels for
 * affected areas, and a tap panel that describes any shape without leaving the
 * map.
 *
 * Colours are six distinct hues, never shades of one, so certainty and utility
 * read at a glance and the legend can match exactly:
 *   red    live electricity cut          amber  electricity upcoming today
 *   blue   water live (bright) / upcoming (dim)
 *   violet social observation (unconfirmed)
 *   pink   citizen reports (no official bulletin)
 *   grey   nothing / boundary unmatched to the registry
 */
export type MapDatum = {
  liveElectric: boolean;
  liveWater: boolean;
  upcoming: boolean;       // electricity, announced for today
  upcomingWater: boolean;  // water, announced
  observed: boolean;
  reports: number;
};

const C = {
  liveElec: "#FF6A55",
  liveWater: "#3EC8DA",
  upElec: "#FFB637",
  upWater: "rgba(62,200,218,0.38)",
  observed: "#B48CF0",
  reports: "rgba(244,114,182,0.55)",
  none: T.surface2,
};

function fillFor(d: MapDatum | undefined): string {
  if (!d) return C.none;
  if (d.liveElectric) return C.liveElec;
  if (d.liveWater) return C.liveWater;
  if (d.upcoming) return C.upElec;
  if (d.upcomingWater) return C.upWater;
  if (d.observed) return C.observed;
  if (d.reports > 0) return C.reports;
  return C.none;
}
const isAffected = (d: MapDatum | undefined) =>
  !!d && (d.liveElectric || d.liveWater || d.upcoming || d.upcomingWater || d.observed || d.reports > 0);

/** Info shown in the tap panel, built by the parent from live event data. */
export type ShapeInfo = {
  title: string;
  status?: string;
  utility?: string;
  window?: string;
  source?: string;
  namedAreas?: string[];
};

export default function TunisiaMap({
  govData, delData, lang, selected, onSelect, localizeGov, delName, describe,
}: {
  govData: Record<string, MapDatum>;
  delData: Record<number, MapDatum>;
  lang: Lang;
  selected: string | null;               // selected governorate name_ar
  onSelect: (nameAr: string | null) => void;
  localizeGov: (nameAr: string) => string;
  delName: (placeId: number | null, fallbackAr: string) => string;
  describe: (kind: "gov" | "del", key: string | number) => ShapeInfo | null;
}) {
  const s = STR[lang];
  const [tapped, setTapped] = useState<ShapeInfo | null>(null);

  const selectedGov = selected
    ? GOVERNORATES.find((g) => g.properties.name_ar === selected) ?? null
    : null;
  const govIso = selectedGov?.properties.iso ?? null;

  // Slightly more padding than the default so the country (and each zoomed
  // governorate) sits inside the frame with a margin — no shape touching the
  // edge, nothing stuck in a corner.
  const nationalProj = useMemo(() => makeProjection(360), []);
  const national = useMemo(() =>
    GOVERNORATES.map((f) => ({
      f, d: pathFor(f, nationalProj), b: projectedBounds(f, nationalProj),
    })), [nationalProj]);

  const zoom = useMemo(() => {
    if (!govIso) return null;
    const dels = delegationsOf(govIso);
    if (dels.length === 0) return null;
    const proj = makeProjectionFor(dels, 360, 0.08);
    return { proj, items: dels.map((f) => ({
      f, d: pathFor(f, proj), b: projectedBounds(f, proj),
    })) };
  }, [govIso]);

  const proj = zoom?.proj ?? nationalProj;

  // A label fits inside a shape only if the shape is big enough; otherwise the
  // name would overflow onto neighbours. Small affected shapes get a dot and
  // reveal their name on tap instead of overlapping.
  const MIN_W = 34, MIN_H = 16;

  // Country view: one marker per AFFECTED DELEGATION at its centroid, not a
  // whole-governorate fill — colouring a whole province when only a few of its
  // delegations are named overstates the cut. Markers falling in the same
  // ~14px cell are merged so a dense governorate does not become a blob; the
  // merged marker takes the highest-severity colour and grows with the count.
  const priority = (d: MapDatum) =>
    d.liveElectric ? 6 : d.liveWater ? 5 : d.upcoming ? 4 : d.upcomingWater ? 3 : d.observed ? 2 : d.reports > 0 ? 1 : 0;
  const markers = useMemo(() => {
    const CELL = 14;
    const cells = new Map<string, { cx: number; cy: number; count: number;
      best: { p: number; datum: MapDatum; pid: number } | null }>();
    for (const f of DELEGATIONS) {
      const pid = f.properties.place_id;
      if (pid == null) continue;                 // unmatched boundary → never a marker
      const d = delData[pid];
      if (!d || !isAffected(d)) continue;
      const b = projectedBounds(f, nationalProj);
      const key = `${Math.round(b.cx / CELL)},${Math.round(b.cy / CELL)}`;
      let c = cells.get(key);
      if (!c) { c = { cx: b.cx, cy: b.cy, count: 0, best: null }; cells.set(key, c); }
      c.count++;
      const p = priority(d);
      if (!c.best || p > c.best.p) { c.best = { p, datum: d, pid }; c.cx = b.cx; c.cy = b.cy; }
    }
    return [...cells.values()];
  }, [delData, nationalProj]);

  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ color: T.text }}>
          {zoom
            ? (lang === "ar" ? `معتمديات ${selected}` : `Délégations · ${localizeGov(selected!)}`)
            : (lang === "ar" ? "خريطة الانقطاعات" : "Carte des coupures")}
        </span>
        {selected && (
          <button onClick={() => { onSelect(null); setTapped(null); }}
                  className="text-xs" style={{ color: T.muted }}>
            {lang === "ar" ? "← كامل البلاد" : "← Tout le pays"}
          </button>
        )}
      </div>

      <div dir="ltr">
        <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="w-full h-auto"
             role="img" aria-label={lang === "ar" ? "خريطة تونس" : "Carte de Tunisie"}>

          {/* ---------- COUNTRY VIEW: faint outlines + delegation markers ---------- */}
          {!zoom && national.map((it, i) => {
            const name = it.f.properties.name_ar;
            const isSel = selected === name;
            return (
              // Outline only — no province-wide fill. Still clickable to zoom.
              <path key={`g${i}`} d={it.d} fill="transparent"
                    stroke={isSel ? T.text : T.line} strokeWidth={isSel ? 1.4 : 0.6}
                    style={{ cursor: "pointer" }}
                    onClick={() => { onSelect(isSel ? null : name); setTapped(null); }}>
                <title>{localizeGov(name)}</title>
              </path>
            );
          })}
          {!zoom && markers.map((m, i) => {
            if (!m.best) return null;
            const r = Math.min(7, 3 + (m.count - 1));
            return (
              <g key={`mk${i}`} style={{ cursor: "pointer" }}
                 onClick={() => setTapped(describe("del", m.best!.pid) ?? { title: "" })}>
                <circle cx={m.cx} cy={m.cy} r={r + 0.8} fill={T.night} opacity={0.5} />
                <circle cx={m.cx} cy={m.cy} r={r} fill={fillFor(m.best.datum)}
                        stroke={T.night} strokeWidth={0.7} />
                {m.count > 1 && (
                  <text x={m.cx} y={m.cy} fontSize={r} textAnchor="middle"
                        dominantBaseline="central" fill={T.night} fontWeight={800}
                        style={{ pointerEvents: "none" }}>{m.count}</text>
                )}
              </g>
            );
          })}

          {/* ---------- DRILL-DOWN VIEW: full-shape shading is accurate here ---------- */}
          {zoom && zoom.items.map((it, i) => {
            const name = it.f.properties.name_ar;
            const pid: number | null = it.f.properties.place_id ?? null;
            const datum = pid != null ? delData[pid] : undefined;
            const unmatched = pid == null;
            const display = delName(pid, name);
            return (
              <path key={i} d={it.d} fill={unmatched ? C.none : fillFor(datum)}
                    stroke={T.line} strokeWidth={0.5} style={{ cursor: "pointer" }}
                    onClick={() => setTapped(describe("del", pid ?? -1) ?? { title: display })}>
                <title>{display}</title>
              </path>
            );
          })}
          {zoom && zoom.items.map((it, i) => {
            const name = it.f.properties.name_ar;
            const pid: number | null = it.f.properties.place_id ?? null;
            const datum = pid != null ? delData[pid] : undefined;
            if (pid == null || !isAffected(datum)) return null;
            const display = delName(pid, name);
            const fits = it.b.w >= MIN_W && it.b.h >= MIN_H;
            const fontSize = Math.max(7, Math.min(11, it.b.w / Math.max(6, display.length)));
            if (!fits) {
              return (
                <circle key={`m${i}`} cx={it.b.cx} cy={it.b.cy} r={2.2}
                        fill={T.text} stroke={T.night} strokeWidth={0.6}
                        style={{ cursor: "pointer" }}
                        onClick={() => setTapped(describe("del", pid ?? -1) ?? { title: display })} />
              );
            }
            return (
              <text key={`t${i}`} x={it.b.cx} y={it.b.cy} fontSize={fontSize}
                    textAnchor="middle" dominantBaseline="central"
                    fill={T.night} fontWeight={700}
                    stroke={T.text} strokeWidth={0.35} paintOrder="stroke"
                    style={{ pointerEvents: "none" }}>
                {display}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Tap panel — describes a shape without leaving the map. */}
      {tapped && (
        <div className="mt-3 rounded-xl p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
          <div className="flex items-start justify-between gap-2">
            <strong className="text-sm" style={{ color: T.text }}>{tapped.title}</strong>
            <button onClick={() => setTapped(null)} className="text-xs" style={{ color: T.muted }}>✕</button>
          </div>
          {tapped.status && (
            <p className="text-xs mt-1" style={{ color: T.text }}>
              {tapped.utility ? `${tapped.utility} · ` : ""}{tapped.status}
            </p>
          )}
          {tapped.window && <p className="text-xs" style={{ color: T.muted }}>{tapped.window}</p>}
          {tapped.namedAreas && tapped.namedAreas.length > 0 && (
            <p className="text-xs mt-1" style={{ color: T.muted }}>
              {s.namedInBulletin}: {tapped.namedAreas.join("، ")}
            </p>
          )}
          {tapped.source && <p className="text-xs mt-1" style={{ color: T.muted }}>{s.source}: {tapped.source}</p>}
          {!tapped.status && <p className="text-xs mt-1" style={{ color: T.muted }}>{s.noArea}</p>}
        </div>
      )}

      {zoom && (
        <p className="text-[11px] mt-2" style={{ color: T.muted }}>
          {lang === "ar"
            ? "المناطق الرمادية: حدود بدون مطابقة في السجل — لا تُلوَّن أبدا."
            : "Zones grises : limites non appariées — jamais colorées."}
        </p>
      )}
      {!zoom && !selected && (
        <p className="text-[11px] mt-2 text-center" style={{ color: T.amber }}>{s.tapGov}</p>
      )}

      {/* Legend — matches fillFor exactly. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px]" style={{ color: T.muted }}>
        <Key c={C.liveElec} t={`${s.elec} — ${s.liveNow}`} />
        <Key c={C.upElec} t={`${s.elec} — ${s.upcoming}`} />
        <Key c={C.liveWater} t={`${s.water} — ${s.liveNow}`} />
        <Key c={C.upWater} t={`${s.water} — ${s.upcoming}`} />
        <Key c={C.observed} t={s.observedShort} />
        <Key c={C.reports} t={s.reports} />
      </div>
    </div>
  );
}

function Key({ c, t }: { c: string; t: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />
      {t}
    </span>
  );
}
