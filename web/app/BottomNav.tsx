"use client";

import { Home, Map as MapIcon, Megaphone, BarChart3 } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";
import type { TabKey } from "./PublicApp";

/**
 * Fixed bottom tab bar, four items, with the center report action raised as a
 * FAB. RTL-aware by construction: it uses the document direction (justify
 * evenly) rather than a hardcoded left→right order, so the same order reads
 * naturally in Arabic and French. The areas list now lives inside the report
 * tab, so this dropped from five items to four.
 */
const ITEMS: { key: TabKey; icon: typeof Home; fab?: boolean }[] = [
  { key: "home", icon: Home },
  { key: "map", icon: MapIcon },
  { key: "report", icon: Megaphone, fab: true },
  { key: "stats", icon: BarChart3 },
];

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

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20"
         style={{ background: T.surface, borderTop: `1px solid ${T.line}` }}>
      <div className="mx-auto max-w-[640px] flex items-stretch justify-around px-2"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {ITEMS.map(({ key, icon: Icon, fab }) => {
          const on = active === key;
          if (fab) {
            return (
              <button key={key} onClick={() => onChange(key)}
                      className="flex flex-col items-center justify-center -mt-4 px-2"
                      aria-label={label[key]}>
                <span className="flex items-center justify-center rounded-full shadow-lg"
                      style={{ width: 52, height: 52, background: T.amber, color: "#1a1205" }}>
                  <Icon size={24} />
                </span>
                <span className="text-[10px] mt-0.5 font-bold" style={{ color: on ? T.amber : T.muted }}>
                  {label[key]}
                </span>
              </button>
            );
          }
          return (
            <button key={key} onClick={() => onChange(key)}
                    className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 flex-1"
                    aria-label={label[key]} aria-current={on ? "page" : undefined}>
              <Icon size={20} color={on ? T.amber : T.muted} />
              <span className="text-[10px]" style={{ color: on ? T.amber : T.muted, fontWeight: on ? 700 : 400 }}>
                {label[key]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
