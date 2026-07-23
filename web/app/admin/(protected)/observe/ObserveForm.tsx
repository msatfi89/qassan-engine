"use client";

import { useState, useTransition } from "react";
import { createObservation } from "@/lib/observation-action";

type Place = { id: number; level: string; name_ar: string; parent_id: number | null };

export default function ObserveForm({ places }: { places: Place[] }) {
  const governorates = places.filter((p) => p.level === "governorate");
  const [govId, setGovId] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [utility, setUtility] = useState<"electricity" | "water">("electricity");
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const delegations = govId
    ? places.filter((p) => p.parent_id === govId && p.level !== "governorate")
    : [];

  function submit() {
    setError(null);
    setResult(null);
    // Allow attaching at governorate level too, when the post names no delegation.
    const target = placeId ?? govId;
    if (!target) { setError("Pick a governorate (and delegation if known)"); return; }
    start(async () => {
      try {
        await createObservation({ placeId: target, utility, note, sourceUrl });
        setResult("✓ Observation published — shown as غير مؤكد");
        setNote("");
        setSourceUrl("");
        setPlaceId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <section className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <div>
        <h1>Social observation</h1>
        <p className="muted small">
          For something you read on social media, not an official STEG/SONEDE
          bulletin. It publishes immediately as{" "}
          <strong>رصد من مواقع التواصل — غير مؤكد</strong>, in its own colour, and
          is never counted as a citizen report.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select value={govId ?? ""} aria-label="governorate"
                onChange={(e) => { setGovId(e.target.value ? Number(e.target.value) : null); setPlaceId(null); }}>
          <option value="">Governorate…</option>
          {governorates.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}
        </select>
        <select value={placeId ?? ""} disabled={!govId} aria-label="delegation"
                onChange={(e) => setPlaceId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{govId ? "Delegation (optional)…" : "Pick governorate first"}</option>
          {delegations.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {(["electricity", "water"] as const).map((u) => (
          <button key={u} type="button" onClick={() => setUtility(u)}
                  className={utility === u ? "approve" : "ghost"}
                  style={{ flex: 1, padding: "8px 12px" }}>
            {u === "electricity" ? "كهرباء" : "ماء"}
          </button>
        ))}
      </div>

      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="ما قرأته — مثال: بلاغ على صفحة بلدية… قطع بمنطقة…"
                style={{ background: "var(--bg)", color: "var(--text)",
                         border: "1px solid var(--border)", borderRadius: 8, padding: 10,
                         font: "inherit", direction: "rtl" }} />

      <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
             placeholder="https://facebook.com/… (link to the post)"
             style={{ direction: "ltr" }} />

      <button type="button" className="approve" disabled={pending} onClick={submit}
              style={{ padding: "10px 16px" }}>
        {pending ? "…" : "Publish observation"}
      </button>

      {result && <p className="ok small">{result}</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
