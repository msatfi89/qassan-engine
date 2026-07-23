"use client";

import { useMemo } from "react";
import {
  GOVERNORATES, delegationsOf, makeProjection, makeProjectionFor, pathFor,
} from "@/lib/geo";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Choropleth of Tunisia, shaded by what is happening now.
 *
 * Two zoom levels:
 *   - default: the 24 governorates (national view).
 *   - tapped:  one governorate's delegations, from the ADM2 boundaries.
 * Tapping a governorate both filters the feed and zooms the map into its
 * delegations; a delegation whose boundary never matched the registry
 * (place_id null) is drawn neutral grey and can never be coloured by a cut.
 *
 * Announcements dominate reports: an official bulletin is evidence, a handful
 * of taps is a signal. Each state is a different colour, never a darker shade
 * of one, so "STEG said" never blurs into "someone said".
 */
export type MapDatum = {
  liveElectric: boolean;
  liveWater: boolean;
  upcoming: boolean;
  observed: boolean;
  reports: number;
};

function fillFor(d: MapDatum | undefined): string {
  if (!d) return T.surface2;
  if (d.liveElectric) return "rgba(255,182,55,0.85)";
  if (d.liveWater) return "rgba(62,200,218,0.75)";
  if (d.upcoming) return "rgba(255,182,55,0.32)";
  if (d.observed) return "rgba(180,140,240,0.45)";
  if (d.reports > 0) return "rgba(255,106,85,0.30)";
  return T.surface2;
}

export default function TunisiaMap({
  govData, delData, lang, selected, onSelect,
}: {
  govData: Record<string, MapDatum>;      // keyed by governorate name_ar
  delData: Record<number, MapDatum>;      // keyed by delegation place_id
  lang: Lang;
  selected: string | null;                // selected governorate name_ar, or null
  onSelect: (nameAr: string | null) => void;
}) {
  const s = STR[lang];

  // Which governorate is zoomed in, and its ISO for pulling delegations.
  const selectedGov = selected
    ? GOVERNORATES.find((g) => g.properties.name_ar === selected) ?? null
    : null;
  const govIso = selectedGov?.properties.iso ?? null;

  const nationalProj = useMemo(() => makeProjection(320), []);
  const nationalPaths = useMemo(
    () => GOVERNORATES.map((f) => ({ f, d: pathFor(f, nationalProj) })),
    [nationalProj]
  );

  // Delegations of the zoomed governorate, with a projection fit to them.
  const zoom = useMemo(() => {
    if (!govIso) return null;
    const dels = delegationsOf(govIso);
    if (dels.length === 0) return null;
    const proj = makeProjectionFor(dels, 320);
    return { proj, paths: dels.map((f) => ({ f, d: pathFor(f, proj) })) };
  }, [govIso]);

  const proj = zoom?.proj ?? nationalProj;

  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ color: T.text }}>
          {zoom
            ? (lang === "ar" ? `معتمديات ${selected}` : `Délégations · ${selected}`)
            : (lang === "ar" ? "خريطة الانقطاعات" : "Carte des coupures")}
        </span>
        {selected && (
          <button onClick={() => onSelect(null)} className="text-xs" style={{ color: T.muted }}>
            {lang === "ar" ? "← كامل البلاد" : "← Tout le pays"}
          </button>
        )}
      </div>

      {/* dir=ltr on the wrapper: the map is geographic, not textual, and must
          not mirror when the UI is RTL. */}
      <div dir="ltr">
        <svg viewBox={`0 0 ${proj.width} ${proj.height}`} className="w-full h-auto"
             role="img"
             aria-label={lang === "ar" ? "خريطة تونس" : "Carte de Tunisie"}>
          {zoom
            ? zoom.paths.map(({ f, d }, i) => {
                const pid = f.properties.place_id;
                const datum = pid != null ? delData[pid] : undefined;
                return (
                  <path key={i} d={d}
                        fill={pid == null ? T.surface2 : fillFor(datum)}
                        stroke={T.line} strokeWidth={0.5}>
                    <title>{f.properties.name_ar}</title>
                  </path>
                );
              })
            : nationalPaths.map(({ f, d }) => {
                const name = f.properties.name_ar;
                const isSel = selected === name;
                return (
                  <path key={f.properties.iso} d={d}
                        fill={fillFor(govData[name])}
                        stroke={isSel ? T.text : T.line}
                        strokeWidth={isSel ? 1.6 : 0.6}
                        style={{ cursor: "pointer" }}
                        onClick={() => onSelect(isSel ? null : name)}>
                    <title>{name}</title>
                  </path>
                );
              })}
        </svg>
      </div>

      {zoom && (
        <p className="text-[11px] mt-2" style={{ color: T.muted }}>
          {lang === "ar"
            ? "المناطق الرمادية: حدود بدون مطابقة في السجل — لا تُلوَّن أبدا."
            : "Zones grises : limites non appariées au registre — jamais colorées."}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px]" style={{ color: T.muted }}>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(255,182,55,0.85)" }} />
          {s.elec} — {s.liveNow}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(62,200,218,0.75)" }} />
          {s.water} — {s.liveNow}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(255,182,55,0.32)" }} />
          {s.mapUpcoming}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(180,140,240,0.45)" }} />
          {s.observedShort}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(255,106,85,0.30)" }} />
          {s.reports}
        </span>
      </div>
    </div>
  );
}
