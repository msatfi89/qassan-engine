"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Zap, Droplets } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Searchable list of areas with honest per-utility stats.
 *
 * Each utility cell carries a status (cut / on / no-data) plus the real report
 * numbers behind it: cut reports in the last 90 minutes and today, and the
 * most recent report time. A cell with no signal reads "لا توجد بيانات" — never
 * a zero shown as if it were a status.
 */
export type AreaStatus = "cut" | "on" | "nodata";
export type UtilityCell = { status: AreaStatus; n90: number; nToday: number; lastAt: string | null };
export type AreaRow = {
  id: number;
  name: string;
  gov: string;
  electricity: UtilityCell;
  water: UtilityCell;
};

function relTime(iso: string, lang: Lang): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return lang === "ar" ? "الآن" : "à l'instant";
  if (mins < 60) return lang === "ar" ? `${mins} د` : `${mins} min`;
  const h = Math.round(mins / 60);
  return lang === "ar" ? `${h} س` : `${h} h`;
}

function UtilityRow({ cell, utility, lang }: { cell: UtilityCell; utility: "e" | "w"; lang: Lang }) {
  const s = STR[lang];
  const Icon = utility === "w" ? Droplets : Zap;
  const hasActivity = cell.n90 + cell.nToday > 0;
  // "لا توجد بيانات" is only honest when there is genuinely nothing. If there
  // are reports today but none in the last 90 min, the current status is simply
  // unknown ("—") — the counts to the right carry the history without the
  // pill contradicting them.
  const meta = {
    cut: { c: utility === "w" ? T.aqua : T.live, t: s.statusOut },
    on: { c: T.ok, t: s.statusOn },
    nodata: { c: T.muted, t: hasActivity ? "—" : s.statusNoData },
  }[cell.status];
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="inline-flex items-center gap-1" style={{ color: T.muted }}>
        <Icon size={12} color={meta.c} />
        <span style={{ color: meta.c, fontWeight: 600 }}>{meta.t}</span>
      </span>
      {/* Real numbers, only when there are any. */}
      {cell.n90 + cell.nToday > 0 ? (
        <span style={{ color: T.muted }}>
          {cell.n90 > 0 && `${cell.n90} ${lang === "ar" ? "آخر ٩٠ د" : "90 min"}`}
          {cell.n90 > 0 && cell.nToday > 0 && " · "}
          {cell.nToday > 0 && `${cell.nToday} ${lang === "ar" ? "اليوم" : "auj."}`}
          {cell.lastAt && ` · ${relTime(cell.lastAt, lang)}`}
        </span>
      ) : (
        <span style={{ color: T.muted, opacity: 0.6 }}>—</span>
      )}
    </div>
  );
}

const active = (r: AreaRow) =>
  (r.electricity.status === "cut" || r.water.status === "cut" ? 2 : 0) +
  (r.electricity.n90 + r.water.n90 + r.electricity.nToday + r.water.nToday > 0 ? 1 : 0);

export default function AreasTab({
  rows, lang, onPick, focusId,
}: {
  rows: AreaRow[];
  lang: Lang;
  onPick: (id: number) => void;
  focusId?: number | null;
}) {
  const s = STR[lang];
  const [q, setQ] = useState("");
  const focusRef = useRef<HTMLButtonElement | null>(null);

  const focusGov = focusId != null ? rows.find((r) => r.id === focusId)?.gov ?? null : null;

  const filtered = useMemo(() => {
    const norm = (x: string) => x.replace(/[ً-ْـ]/g, "").toLowerCase().trim();
    const query = norm(q);
    const base = query
      ? rows.filter((r) => norm(r.name).includes(query) || norm(r.gov).includes(query))
      : focusGov
        ? rows.filter((r) => r.gov === focusGov)
        : rows;
    return [...base].sort((a, b) => {
      if (a.id === focusId) return -1;
      if (b.id === focusId) return 1;
      return active(b) - active(a) ||
        (b.electricity.n90 + b.water.n90) - (a.electricity.n90 + a.water.n90);
    }).slice(0, 120);
  }, [rows, q, focusGov, focusId]);

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
                <p className="text-sm font-bold truncate" style={{ color: T.text }}>{r.name}</p>
                <p className="text-[11px] mb-2" style={{ color: T.muted }}>{r.gov}</p>
                <div className="grid gap-1">
                  <UtilityRow cell={r.electricity} utility="e" lang={lang} />
                  <UtilityRow cell={r.water} utility="w" lang={lang} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
