"use client";

import { useEffect, useState } from "react";
import { submitReport, type ReportKind } from "@/lib/report-action";
import type { PublicPlace } from "@/lib/public-db";

const AREA_KEY = "qassan.area";
const DEVICE_KEY = "qassan.device";

/**
 * "My area" lives in localStorage on the user's own device. That is allowed
 * here — this is a public web app, not an artifact — and it is what keeps the
 * product anonymous: the server is never told which area a device watches,
 * only that a report was made for one.
 */
function loadDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function AreaAndReport({ places }: { places: PublicPlace[] }) {
  const governorates = places.filter((p) => p.level === "governorate");
  const [govId, setGovId] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [pendingKind, setPendingKind] = useState<ReportKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [neighbours, setNeighbours] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(AREA_KEY);
    if (!saved) return;
    const id = Number(saved);
    const place = places.find((p) => p.id === id);
    if (place) {
      setPlaceId(place.id);
      setGovId(place.parent_id ?? place.id);
    }
  }, [places]);

  const delegations = govId
    ? places.filter((p) => p.parent_id === govId && p.level !== "governorate")
    : [];
  const chosen = places.find((p) => p.id === placeId) ?? null;

  function chooseArea(id: number) {
    setPlaceId(id);
    setMessage(null);
    setNeighbours(null);
    localStorage.setItem(AREA_KEY, String(id));
  }

  async function confirmAndSend(kind: ReportKind) {
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await submitReport({
        deviceId: loadDeviceId(),
        placeId: chosen.id,
        utility: "electricity",
        kind,
        // The user answered "yes, this is my area" on the confirm step. A fact
        // about their answer — not their location.
        areaConfirmed: true,
      });
      if (res.ok) {
        setNeighbours(res.neighbours);
        setMessage(
          kind === "cut" ? "شكرا، سجّلنا التبليغ." : "شكرا، سجّلنا رجوع الضو."
        );
      } else {
        setMessage(res.message);
      }
    } finally {
      setBusy(false);
      setPendingKind(null);
    }
  }

  return (
    <section className="card area-card">
      <h2>منطقتي</h2>

      <div className="pickers">
        <select
          value={govId ?? ""}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setGovId(v);
            setPlaceId(null);
          }}
          aria-label="الولاية"
        >
          <option value="">اختر الولاية…</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>

        <select
          value={placeId ?? ""}
          onChange={(e) => e.target.value && chooseArea(Number(e.target.value))}
          disabled={!govId}
          aria-label="المعتمدية"
        >
          <option value="">
            {govId ? "اختر المعتمدية…" : "اختر الولاية أولا"}
          </option>
          {delegations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name_ar}
            </option>
          ))}
        </select>
      </div>

      {chosen && (
        <>
          {pendingKind ? (
            /* The explicit area confirmation that replaced geolocation:
               a deliberate answer, storing nothing about where anyone is. */
            <div className="confirm-step">
              <p>
                تبليغ عن <strong>{chosen.name_ar}</strong> —{" "}
                {pendingKind === "cut" ? "الضو مقصوص" : "رجع الضو"}؟
              </p>
              <div className="report-row">
                <button
                  className="approve"
                  disabled={busy}
                  onClick={() => confirmAndSend(pendingKind)}
                >
                  {busy ? "…" : "نعم، أكّد"}
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => setPendingKind(null)}
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="report-row">
              <button className="report out" onClick={() => setPendingKind("cut")}>
                الضو مقصوص توّا
              </button>
              <button
                className="report back"
                onClick={() => setPendingKind("restored")}
              >
                رجع الضو
              </button>
            </div>
          )}

          {message && <p className="report-msg">{message}</p>}

          {neighbours !== null && (
            <p className="muted small">
              {neighbours <= 1
                ? "كن أول من يأكد في منطقتك."
                : `${neighbours} تبليغات في منطقتك خلال آخر ساعة ونصف.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
