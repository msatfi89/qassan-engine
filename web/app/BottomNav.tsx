"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map as MapIcon, Megaphone, BarChart3 } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Fixed bottom tab bar. Each tab is a real ROUTE (a Link), and the active tab
 * is derived purely from the URL pathname — never from app state. This is what
 * makes tab content a pure function of the route: navigating changes the URL,
 * the URL mounts one View, and nothing about zone-selection or history can
 * change which View renders.
 *
 * Layout: two equal-width tabs left of a centred report FAB, one tab plus an
 * equal spacer on the right, so every tab is the same width and the FAB sits
 * dead centre at any viewport (the FAB is absolutely positioned, out of flow).
 */
const HOME = "/", MAP = "/carte", REPORT = "/signaler", STATS = "/stats";

export default function BottomNav({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const path = usePathname();

  const Tab = ({ href, Icon, label }: { href: string; Icon: typeof Home; label: string }) => {
    const on = path === href;
    return (
      <Link href={href} prefetch
            className="flex flex-col items-center justify-center gap-0.5 py-2 flex-1"
            aria-label={label} aria-current={on ? "page" : undefined}>
        <Icon size={22} color={on ? T.amber : T.muted} />
        <span className="text-[10px]" style={{ color: on ? T.amber : T.muted, fontWeight: on ? 700 : 400 }}>
          {label}
        </span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20"
         style={{ background: T.surface, borderTop: `1px solid ${T.line}` }}>
      <div className="relative mx-auto max-w-[640px]"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-stretch">
          <div className="flex flex-1">
            <Tab href={HOME} Icon={Home} label={s.tabHome} />
            <Tab href={MAP} Icon={MapIcon} label={s.tabMap} />
          </div>
          <div style={{ width: 72 }} aria-hidden />
          <div className="flex flex-1">
            <Tab href={STATS} Icon={BarChart3} label={s.tabStats} />
            <span className="flex-1" aria-hidden />
          </div>
        </div>

        <Link href={REPORT} prefetch aria-label={s.tabReport}
              className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ top: -18 }}>
          <span className="flex items-center justify-center rounded-full shadow-lg"
                style={{ width: 56, height: 56, background: T.amber, color: "#1a1205" }}>
            <Megaphone size={26} />
          </span>
          <span className="text-[10px] mt-0.5 font-bold"
                style={{ color: path === REPORT ? T.amber : T.muted }}>
            {s.tabReport}
          </span>
        </Link>
      </div>
    </nav>
  );
}
