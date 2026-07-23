"use client";

import { Home, Map as MapIcon, Megaphone, BarChart3 } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";
import type { TabKey } from "./PublicApp";

/**
 * Fixed bottom tab bar. Four tab items in the flex flow — two left of centre,
 * two right — with a fixed-width centre gutter reserving space for the report
 * FAB, which is absolutely centred and NOT part of the flow. Keeping the FAB
 * out of the flow is what fixes the skewed spacing: with it in the row, its
 * different width ate a slot and left a large empty gap on one side (worse on
 * desktop). Now all four tabs are equal width via justify-around and the FAB
 * sits dead centre at any viewport.
 */
export default function BottomNav({
  active, onChange, lang,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  lang: Lang;
}) {
  const s = STR[lang];
  const label: Record<TabKey, string> = {
    home: s.tabHome, map: s.tabMap, report: s.tabReport, stats: s.tabStats,
  };

  const TabButton = ({ k, Icon }: { k: TabKey; Icon: typeof Home }) => {
    const on = active === k;
    return (
      <button onClick={() => onChange(k)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 flex-1"
              aria-label={label[k]} aria-current={on ? "page" : undefined}>
        <Icon size={22} color={on ? T.amber : T.muted} />
        <span className="text-[10px]" style={{ color: on ? T.amber : T.muted, fontWeight: on ? 700 : 400 }}>
          {label[k]}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20"
         style={{ background: T.surface, borderTop: `1px solid ${T.line}` }}>
      <div className="relative mx-auto max-w-[640px]"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {/* Two equal halves (each flex-1) with a centred 72px gutter for the
            FAB. Left half holds home+map; right half holds stats spanning it.
            Equal halves keep the gutter — and thus the FAB — dead centre, and
            nothing is left as an empty gap. */}
        <div className="flex items-stretch">
          <div className="flex flex-1">
            <TabButton k="home" Icon={Home} />
            <TabButton k="map" Icon={MapIcon} />
          </div>
          <div style={{ width: 72 }} aria-hidden />
          <div className="flex flex-1">
            {/* stats sits in the inner-right slot so it mirrors map across the
                centre; the outer-right slot is an equal-width spacer, keeping
                every tab the same width and the FAB dead centre. */}
            <TabButton k="stats" Icon={BarChart3} />
            <span className="flex-1" aria-hidden />
          </div>
        </div>

        {/* Report FAB — absolutely centred, out of the flow. */}
        <button onClick={() => onChange("report")}
                aria-label={label.report}
                className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
                style={{ top: -18 }}>
          <span className="flex items-center justify-center rounded-full shadow-lg"
                style={{ width: 56, height: 56, background: T.amber, color: "#1a1205" }}>
            <Megaphone size={26} />
          </span>
          <span className="text-[10px] mt-0.5 font-bold"
                style={{ color: active === "report" ? T.amber : T.muted }}>
            {label.report}
          </span>
        </button>
      </div>
    </nav>
  );
}
