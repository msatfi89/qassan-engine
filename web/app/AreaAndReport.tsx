"use client";

import { useEffect, useState } from "react";
import { Zap, Droplets } from "lucide-react";
import { submitReport, type ReportKind } from "@/lib/report-action";
import type { PublicPlace } from "@/lib/public-db";
import { T, STR, type Lang } from "@/lib/theme";

const AREA_KEY = "qassan.area";
const DEVICE_KEY = "qassan.device";

/** French where present, Arabic otherwise — most delegations have no name_fr,
 *  and a fabricated transliteration is worse than the real Arabic name. */
function label(p: { name_ar: string; name_fr: string | null }, lang: Lang): string {
  return lang === "fr" && p.name_fr ? p.name_fr : p.name_ar;
}

/**
 * "My area" lives in localStorage on the user's own device. That is what keeps
 * the product anonymous: the server is never told which area a device watches,
 * only that a report was filed for one.
 */
function loadDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function AreaAndReport({
  places, lang, onAreaChange, selectedId, showReport = true,
}: {
  places: PublicPlace[];
  lang: Lang;
  onAreaChange: (id: number | null) => void;
  selectedId: number | null;
  // false on the home tab (pick an area only); true on the report tab.
  showReport?: boolean;
}) {
  const s = STR[lang];
  const byId = new Map(places.map((p) => [p.id, p]));
  const governorates = places.filter((p) => p.level === "governorate");
  const [govId, setGovId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  // Which utility the report is about. Water is a first-class choice, not an
  // afterthought — SONEDE cuts are a year-round differentiator, unlike STEG's
  // summer peak — so the toggle defaults to nothing pre-selected visually but
  // starts on electricity for a one-tap common case.
  const [reportUtility, setReportUtility] = useState<"electricity" | "water">("electricity");
  const [pending, setPending] = useState<ReportKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Restore the two upper selects from the finest saved place, whatever its
  // level: a saved neighborhood sets its delegation and governorate too.
  useEffect(() => {
    if (!selectedId) return;
    const place = byId.get(selectedId);
    if (!place) return;
    if (place.level === "neighborhood") {
      const del = place.parent_id ? byId.get(place.parent_id) : undefined;
      setDelId(del?.id ?? null);
      setGovId(del?.parent_id ?? null);
    } else if (place.level === "delegation") {
      setDelId(place.id);
      setGovId(place.parent_id ?? null);
    } else {
      setGovId(place.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, places]);

  const delegations = govId
    ? places.filter((p) => p.parent_id === govId && p.level === "delegation")
    : [];
  // Third level only exists for some delegations (the dense urban ones seeded
  // from OSM). The select appears only when there is something to choose.
  const neighborhoods = delId
    ? places.filter((p) => p.parent_id === delId && p.level === "neighborhood")
    : [];
  const chosen = byId.get(selectedId ?? -1) ?? null;

  function chooseArea(id: number) {
    localStorage.setItem(AREA_KEY, String(id));
    onAreaChange(id);
    setMessage(null);
  }

  async function send() {
    if (!chosen || !pending) return;
    setBusy(true);
    try {
      const res = await submitReport({
        deviceId: loadDeviceId(),
        placeId: chosen.id,
        utility: reportUtility,
        kind: pending,
        // The user answered "yes, this is my area" — a fact about their answer,
        // not about where they physically are. No location is sent.
        areaConfirmed: true,
      });
      setMessage(res.ok
        ? "✓ " + (lang === "ar" ? "شكرا، وصل بلاغك" : "Merci, signalement reçu")
        : res.message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const selectStyle = {
    background: T.night, color: T.text, border: `1px solid ${T.line}`,
  } as const;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select value={govId ?? ""} aria-label={s.govLabel}
                onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setGovId(v); setDelId(null); onAreaChange(null); }}
                className="w-full rounded-lg px-3 py-2.5 text-sm" style={selectStyle}>
          <option value="">{s.govLabel}…</option>
          {governorates.map((g) => <option key={g.id} value={g.id}>{label(g, lang)}</option>)}
        </select>

        <select value={delId ?? ""} disabled={!govId} aria-label={s.cityLabel}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setDelId(v);
                  // Report at delegation level for now; refine to a neighborhood
                  // if the user picks one below.
                  if (v) chooseArea(v);
                }}
                className="w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-50" style={selectStyle}>
          <option value="">{govId ? `${s.cityLabel}…` : s.govLabel}</option>
          {delegations.map((d) => <option key={d.id} value={d.id}>{label(d, lang)}</option>)}
        </select>
      </div>

      {/* Third level: appears only when the chosen delegation has neighborhoods. */}
      {neighborhoods.length > 0 && (
        <select value={chosen?.level === "neighborhood" ? chosen.id : ""}
                aria-label={s.hoodLabel}
                onChange={(e) => e.target.value ? chooseArea(Number(e.target.value)) : (delId && chooseArea(delId))}
                className="w-full rounded-lg px-3 py-2.5 text-sm mt-2" style={selectStyle}>
          <option value="">{s.hoodLabel} ({s.optional})</option>
          {neighborhoods.map((n) => <option key={n.id} value={n.id}>{label(n, lang)}</option>)}
        </select>
      )}

      {chosen && showReport && (
        <div className="mt-3">
          {pending ? (
            <div className="rounded-xl p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <p className="text-sm mb-2">
                {label(chosen, lang)} · {reportUtility === "water" ? s.water : s.elec} —{" "}
                {pending === "cut" ? s.reportCut : s.reportBack}؟
              </p>
              <div className="flex gap-2">
                <button onClick={send} disabled={busy}
                        className="flex-1 rounded-lg py-2.5 text-sm font-bold"
                        style={{ background: T.ok, color: "#06301b" }}>
                  {busy ? "…" : lang === "ar" ? "نعم، أكّد" : "Confirmer"}
                </button>
                <button onClick={() => setPending(null)} disabled={busy}
                        className="rounded-lg px-4 py-2.5 text-sm"
                        style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted }}>
                  {lang === "ar" ? "إلغاء" : "Annuler"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: which utility. Water is a peer of electricity here,
                  not hidden behind it — the fix for reports only ever writing
                  'electricity'. */}
              <p className="text-xs mb-1.5" style={{ color: T.muted }}>{s.reportWhich}</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(["electricity", "water"] as const).map((u) => {
                  const on = reportUtility === u;
                  const c = u === "water" ? T.aqua : T.amber;
                  return (
                    <button key={u} onClick={() => setReportUtility(u)}
                            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold"
                            style={{
                              background: on ? `color-mix(in srgb, ${c} 14%, transparent)` : "transparent",
                              border: `1px solid ${on ? c : T.line}`,
                              color: on ? c : T.muted,
                            }}>
                      {u === "water" ? <Droplets size={15} /> : <Zap size={15} />}
                      {u === "water" ? s.water : s.elec}
                    </button>
                  );
                })}
              </div>

              {/* Step 2: cut or restored, for the chosen utility. */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPending("cut")}
                        className="flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold"
                        style={{ background: reportUtility === "water" ? T.aqua : T.amber,
                                 color: reportUtility === "water" ? "#04222a" : "#1a1205" }}>
                  {reportUtility === "water" ? <Droplets size={15} /> : <Zap size={15} />} {s.reportCut}
                </button>
                <button onClick={() => setPending("restored")}
                        className="rounded-lg py-3 text-sm font-bold"
                        style={{ background: T.ok, color: "#06301b" }}>
                  {s.reportBack}
                </button>
              </div>
            </>
          )}
          {message && <p className="text-xs mt-2" style={{ color: T.ok }}>{message}</p>}
        </div>
      )}
    </div>
  );
}
