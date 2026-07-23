"use client";

import { useMemo, useState } from "react";
import {
  GOVERNORATES, delegationsOf, makeProjection, makeProjectionFor,
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
          {(zoom ? zoom.items : national).map((it, i) => {
            const isGov = !zoom;
            const name = it.f.properties.name_ar;
            // @ts-expect-error place_id exists only on delegation features
            const pid: number | null = isGov ? null : (it.f.properties.place_id ?? null);
            const datum = isGov ? govData[name] : (pid != null ? delData[pid] : undefined);
            const unmatched = !isGov && pid == null;
            const fill = unmatched ? C.none : fillFor(datum);
            const affected = !unmatched && isAffected(datum);
            const isSel = isGov && selected === name;
            const display = isGov ? localizeGov(name) : delName(pid, name);

            return (
              <path key={i} d={it.d} fill={fill}
                    stroke={isSel ? T.text : T.line}
                    strokeWidth={isSel ? 1.6 : 0.5}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (isGov) { onSelect(isSel ? null : name); setTapped(null); }
                      else setTapped(describe("del", pid ?? -1) ?? { title: display });
                    }}>
                <title>{display}</title>
              </path>
            );
          })}

          {/* Labels: drawn after all shapes so they sit on top. Only affected
              shapes are labelled, and only where the name fits; smaller
              affected shapes get a dot and reveal their name on tap. */}
          {(zoom ? zoom.items : national).map((it, i) => {
            const isGov = !zoom;
            const name = it.f.properties.name_ar;
            // @ts-expect-error place_id only on delegations
            const pid: number | null = isGov ? null : (it.f.properties.place_id ?? null);
            const datum = isGov ? govData[name] : (pid != null ? delData[pid] : undefined);
            if (isGov ? !isAffected(datum) : (pid == null || !isAffected(datum))) return null;
            const display = isGov ? localizeGov(name) : delName(pid, name);
            const fits = it.b.w >= MIN_W && it.b.h >= MIN_H;
            const fontSize = Math.max(7, Math.min(11, it.b.w / Math.max(6, display.length)));
            if (!fits) {
              return (
                <circle key={`m${i}`} cx={it.b.cx} cy={it.b.cy} r={2.2}
                        fill={T.text} stroke={T.night} strokeWidth={0.6}
                        style={{ cursor: "pointer" }}
                        onClick={() => setTapped(describe(isGov ? "gov" : "del", isGov ? name : (pid ?? -1)) ?? { title: display })} />
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
