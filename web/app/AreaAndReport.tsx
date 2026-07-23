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
  places, lang, onAreaChange, selectedId,
}: {
  places: PublicPlace[];
  lang: Lang;
  onAreaChange: (id: number | null) => void;
  selectedId: number | null;
}) {
  const s = STR[lang];
  const governorates = places.filter((p) => p.level === "governorate");
  const [govId, setGovId] = useState<number | null>(null);
  const [pending, setPending] = useState<{ kind: ReportKind; utility: "electricity" | "water" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    if (place) setGovId(place.parent_id ?? place.id);
  }, [selectedId, places]);

  const delegations = govId
    ? places.filter((p) => p.parent_id === govId && p.level !== "governorate")
    : [];
  const chosen = places.find((p) => p.id === selectedId) ?? null;

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
        utility: pending.utility,
        kind: pending.kind,
        // The user answered "yes, this is my area" — a fact about their answer,
        // not about where they physically are. No location is sent.
        areaConfirmed: true,
      });
      setMessage(res.ok
        ? (pending.kind === "cut" ? "✓" : "✓") + " " + (lang === "ar" ? "شكرا، وصل بلاغك" : "Merci, signalement reçu")
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
                onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setGovId(v); onAreaChange(null); }}
                className="w-full rounded-lg px-3 py-2.5 text-sm" style={selectStyle}>
          <option value="">{s.govLabel}…</option>
          {governorates.map((g) => <option key={g.id} value={g.id}>{label(g, lang)}</option>)}
        </select>

        <select value={selectedId ?? ""} disabled={!govId} aria-label={s.cityLabel}
                onChange={(e) => e.target.value && chooseArea(Number(e.target.value))}
                className="w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-50" style={selectStyle}>
          <option value="">{govId ? `${s.cityLabel}…` : s.govLabel}</option>
          {delegations.map((d) => <option key={d.id} value={d.id}>{label(d, lang)}</option>)}
        </select>
      </div>

      {chosen && (
        <div className="mt-3">
          {pending ? (
            <div className="rounded-xl p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <p className="text-sm mb-2">
                {label(chosen, lang)} — {pending.kind === "cut" ? s.reportCut : s.reportBack}؟
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
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPending({ kind: "cut", utility: "electricity" })}
                      className="flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold"
                      style={{ background: T.amber, color: "#1a1205" }}>
                <Zap size={15} /> {s.reportCut}
              </button>
              <button onClick={() => setPending({ kind: "restored", utility: "electricity" })}
                      className="flex items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold"
                      style={{ background: T.ok, color: "#06301b" }}>
                <Droplets size={15} style={{ opacity: 0 }} /> {s.reportBack}
              </button>
            </div>
          )}
          {message && <p className="text-xs mt-2" style={{ color: T.ok }}>{message}</p>}
        </div>
      )}
    </div>
  );
}
