"use client";

import { useMemo } from "react";
import { GOVERNORATES, makeProjection, pathFor } from "@/lib/geo";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Choropleth of Tunisia's governorates, shaded by what is happening now.
 *
 * Announced cuts and community reports are combined, but announcements
 * dominate: an official bulletin is evidence, a handful of reports is a
 * signal. A governorate with reports and no announcement is shown in a
 * distinct shade rather than the same amber, so "people are saying" is never
 * dressed up as "STEG said".
 */
export type MapDatum = {
  liveElectric: boolean;
  liveWater: boolean;
  upcoming: boolean;
  reports: number;
};

export default function TunisiaMap({
  data, lang, selected, onSelect,
}: {
  data: Record<string, MapDatum>;
  lang: Lang;
  selected: string | null;
  onSelect: (nameAr: string | null) => void;
}) {
  const s = STR[lang];
  const proj = useMemo(() => makeProjection(320), []);
  const paths = useMemo(
    () => GOVERNORATES.map((f) => ({ f, d: pathFor(f, proj) })),
    [proj]
  );

  function fill(nameAr: string): string {
    const d = data[nameAr];
    if (!d) return T.surface2;
    if (d.liveElectric) return "rgba(255,182,55,0.85)";
    if (d.liveWater) return "rgba(62,200,218,0.75)";
    if (d.upcoming) return "rgba(255,182,55,0.32)";
    // Reports without an announcement: distinctly "unconfirmed".
    if (d.reports > 0) return "rgba(255,106,85,0.30)";
    return T.surface2;
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ color: T.text }}>
          {lang === "ar" ? "خريطة الانقطاعات" : "Carte des coupures"}
        </span>
        {selected && (
          <button onClick={() => onSelect(null)} className="text-xs" style={{ color: T.muted }}>
            {lang === "ar" ? "الكل ✕" : "Tout ✕"}
          </button>
        )}
      </div>

      {/* dir on the wrapper, not the svg: the map is geographic, not textual,
          and must not mirror when the UI switches to RTL. */}
      <div dir="ltr">
      <svg
        viewBox={`0 0 ${proj.width} ${proj.height}`}
        className="w-full h-auto"
        role="img"
        aria-label={lang === "ar" ? "خريطة ولايات تونس" : "Carte des gouvernorats"}
      >
        {paths.map(({ f, d }) => {
          const name = f.properties.name_ar;
          const isSel = selected === name;
          return (
            <path
              key={f.properties.iso}
              d={d}
              fill={fill(name)}
              stroke={isSel ? T.text : T.line}
              strokeWidth={isSel ? 1.6 : 0.6}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(isSel ? null : name)}
            >
              <title>{name}</title>
            </path>
          );
        })}
      </svg>
      </div>

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
          {s.upcoming}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(255,106,85,0.30)" }} />
          {s.reports}
        </span>
      </div>
    </div>
  );
}
