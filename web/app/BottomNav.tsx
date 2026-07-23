"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map as MapIcon, Megaphone, ListChecks, BarChart3 } from "lucide-react";
import { T, STR, type Lang } from "@/lib/theme";

/**
 * Fixed bottom tab bar. Each tab is a real ROUTE (a Link); the active tab is
 * read purely from the URL pathname, never from app state. Content is a pure
 * function of the route.
 *
 * Layout: two tabs left of the centred report FAB, two right — a balanced 2+2
 * around the FAB, which is absolutely positioned out of the flow so every tab
 * is equal width and the FAB sits dead centre at any viewport.
 */
const HOME = "/", MAP = "/carte", REPORT = "/signaler", AREAS = "/villes", STATS = "/stats";

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
            <Tab href={AREAS} Icon={ListChecks} label={s.tabAreas} />
            <Tab href={STATS} Icon={BarChart3} label={s.tabStats} />
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
