"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Zap, Droplets } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Searchable list of areas with honest per-utility status.
 *
 * Status is one of: cut (a live outage), on (in the recent window with no
 * outage), or no-data (we simply have nothing — never a guess). "on" is only
 * claimed for areas we actually track; everywhere else reads "لا توجد بيانات".
 */
export type AreaStatus = "cut" | "on" | "nodata";
export type AreaRow = {
  id: number;
  name: string;
  gov: string;
  elec: AreaStatus;
  water: AreaStatus;
  reports: number;
  lastAt: string | null;
};

function Pill({ status, utility, lang }: { status: AreaStatus; utility: "e" | "w"; lang: Lang }) {
  const s = STR[lang];
  const Icon = utility === "w" ? Droplets : Zap;
  const map = {
    cut: { c: utility === "w" ? T.aqua : T.live, t: s.statusOut, dot: true },
    on: { c: T.ok, t: s.statusOn, dot: true },
    nodata: { c: T.muted, t: s.statusNoData, dot: false },
  }[status];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full"
          style={{ background: `color-mix(in srgb, ${map.c} 14%, transparent)`, color: map.c }}>
      <Icon size={11} />
      {map.dot && <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: map.c }} />}
      {map.t}
    </span>
  );
}

export default function AreasTab({
  rows, lang, onPick, focusId,
}: {
  rows: AreaRow[];
  lang: Lang;
  onPick: (id: number) => void;
  // The delegation currently selected as "my area" (or the parent of a
  // selected neighborhood). When set, the list narrows to that governorate and
  // scrolls the selected card into view — selecting a zone FILTERS the list,
  // never replaces it.
  focusId?: number | null;
}) {
  const s = STR[lang];
  const [q, setQ] = useState("");
  const focusRef = useRef<HTMLButtonElement | null>(null);

  const focusGov = focusId != null ? rows.find((r) => r.id === focusId)?.gov ?? null : null;

  const filtered = useMemo(() => {
    const norm = (x: string) => x.replace(/[ً-ْـ]/g, "").toLowerCase().trim();
    const query = norm(q);
    // A typed search wins; otherwise, if a zone is selected, scope to its
    // governorate so the user sees their area and its neighbours.
    const base = query
      ? rows.filter((r) => norm(r.name).includes(query) || norm(r.gov).includes(query))
      : focusGov
        ? rows.filter((r) => r.gov === focusGov)
        : rows;
    return [...base].sort((a, b) => {
      if (a.id === focusId) return -1;         // selected area pinned to top
      if (b.id === focusId) return 1;
      const act = (r: AreaRow) => (r.elec === "cut" || r.water === "cut" ? 2 : r.reports > 0 ? 1 : 0);
      return act(b) - act(a) || b.reports - a.reports;
    }).slice(0, 120);
  }, [rows, q, focusGov, focusId]);

  // Scroll the selected card into view when the selection changes.
  useEffect(() => {
    if (focusId != null && !q) focusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId, q]);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl px-3 mb-3"
           style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <Search size={15} color={T.muted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.searchArea}
               className="flex-1 bg-transparent py-2.5 text-sm outline-none"
               style={{ color: T.text }} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm py-8" style={{ color: T.muted }}>{s.noAreas}</p>
      ) : (
        <div className="grid gap-2">
          {filtered.map((r) => {
            const isFocus = r.id === focusId;
            return (
            <button key={r.id} onClick={() => onPick(r.id)}
                    ref={isFocus ? focusRef : undefined}
                    className="rounded-2xl p-3 text-start"
                    style={{ background: isFocus ? T.surface2 : T.surface,
                             border: `1px solid ${isFocus ? T.amber : T.line}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: T.text }}>{r.name}</p>
                  <p className="text-[11px]" style={{ color: T.muted }}>{r.gov}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Pill status={r.elec} utility="e" lang={lang} />
                  <Pill status={r.water} utility="w" lang={lang} />
                </div>
              </div>
              {r.reports > 0 && (
                <p className="text-[11px] mt-2" style={{ color: T.muted }}>
                  {s.confirmed} {r.reports}
                  {r.lastAt && ` · ${s.lastReport} ${relTime(r.lastAt, lang)}`}
                </p>
              )}
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relTime(iso: string, lang: Lang): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return lang === "ar" ? `${mins} د` : `${mins} min`;
  const h = Math.round(mins / 60);
  return lang === "ar" ? `${h} س` : `${h} h`;
}
