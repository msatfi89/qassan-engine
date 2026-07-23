"use client";

import { Zap, Droplets, Megaphone, CheckCircle2, Clock } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Real counts only. Every number here is something we can actually stand
 * behind today; anything requiring inference (predictions, trends) is held
 * behind an honest "coming soon" until there is enough data to show it with a
 * sample size — the "numbers are real or absent" principle.
 */
export type Stats = {
  activeElec: number;
  activeWater: number;
  upcoming: number;
  reports24: number;
  approved: number;
};

export default function StatsTab({ stats, lang }: { stats: Stats; lang: Lang }) {
  const s = STR[lang];
  const tiles = [
    { icon: Zap, color: T.live, value: stats.activeElec, label: `${s.statActive} · ${s.elec}` },
    { icon: Droplets, color: T.aqua, value: stats.activeWater, label: `${s.statActive} · ${s.water}` },
    { icon: Clock, color: T.amber, value: stats.upcoming, label: s.statUpcoming },
    { icon: Megaphone, color: T.observed, value: stats.reports24, label: s.statReports24 },
    { icon: CheckCircle2, color: T.ok, value: stats.approved, label: s.statApproved },
  ];

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-2xl p-4"
               style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <t.icon size={18} color={t.color} />
            <p className="text-2xl font-extrabold mt-2" style={{ color: T.text }}>{t.value}</p>
            <p className="text-xs mt-0.5" style={{ color: T.muted }}>{t.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5 text-center"
           style={{ background: T.surface, border: `1px dashed ${T.line}` }}>
        <p className="text-sm font-bold" style={{ color: T.amber }}>⏳ {s.statSoon}</p>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: T.muted }}>{s.statSoonBody}</p>
      </div>

      <p className="text-[11px] text-center" style={{ color: T.muted }}>{s.sources}</p>
    </div>
  );
}
