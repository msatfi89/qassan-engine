"use client";

import { useMemo, useState, useTransition } from "react";
import { addNeighborhood } from "@/lib/places-action";

type Place = {
  id: number;
  level: string;
  name_ar: string;
  name_fr: string | null;
  parent_id: number | null;
};

export default function NeighborhoodForm({ places }: { places: Place[] }) {
  const governorates = useMemo(
    () => places.filter((p) => p.level === "governorate"),
    [places]
  );

  const [govId, setGovId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [nameFr, setNameFr] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Neighborhoods added this session, so they appear under the list
  // immediately without a full reload.
  const [added, setAdded] = useState<{ delId: number; name: string }[]>([]);

  const delegations = useMemo(
    () =>
      govId
        ? places
            .filter((p) => p.parent_id === govId && p.level === "delegation")
            .sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"))
        : [],
    [places, govId]
  );

  // What already exists under the chosen delegation — from the database plus
  // anything just added — so Med can see gaps and avoid duplicates.
  const existing = useMemo(() => {
    if (!delId) return [];
    const seeded = places
      .filter((p) => p.level === "neighborhood" && p.parent_id === delId)
      .map((p) => p.name_ar);
    const fresh = added.filter((a) => a.delId === delId).map((a) => a.name);
    return [...new Set([...seeded, ...fresh])].sort((a, b) =>
      a.localeCompare(b, "ar")
    );
  }, [places, delId, added]);

  function submit() {
    setError(null);
    setResult(null);
    if (!delId) {
      setError("اختر الولاية والمعتمدية أولا");
      return;
    }
    if (nameAr.trim().length < 2) {
      setError("اكتب اسم الحي بالعربي");
      return;
    }
    const payload = { delegationId: delId, nameAr: nameAr.trim(), nameFr: nameFr.trim() };
    start(async () => {
      try {
        const res = await addNeighborhood(payload);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if ("duplicate" in res) {
          setResult(`«${res.name}» موجود بالفعل في ${res.delegation} — لا حاجة لإضافته`);
        } else {
          setResult(`✓ أُضيف «${res.name}» إلى ${res.delegation} — ظاهر توّا في التطبيق`);
          setAdded((a) => [...a, { delId, name: res.name }]);
        }
        // Keep governorate + delegation selected so several gaps in the same
        // area can be filled one after another; clear only the name fields.
        setNameAr("");
        setNameFr("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الإرسال");
      }
    });
  }

  return (
    <section className="card" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <div>
        <h1>+ حي (neighborhood)</h1>
        <p className="muted small">
          أضف حيّا ذكره السكان وهو ناقص من القائمة. اختر الولاية والمعتمدية
          الصحيحة — الحي يتعلّق بالمعتمدية، فإذا غلطنا فيها، بلاغات المعتمدية ما
          تظهرش لصاحب الحي. يظهر فورا في المنتقي، بدون SQL.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select
          value={govId ?? ""}
          aria-label="governorate"
          onChange={(e) => {
            setGovId(e.target.value ? Number(e.target.value) : null);
            setDelId(null);
          }}
        >
          <option value="">الولاية…</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>
        <select
          value={delId ?? ""}
          disabled={!govId}
          aria-label="delegation"
          onChange={(e) => setDelId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{govId ? "المعتمدية…" : "اختر الولاية أولا"}</option>
          {delegations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name_ar}
            </option>
          ))}
        </select>
      </div>

      <input
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
        placeholder="اسم الحي بالعربي — مثال: ديار سكرة"
        aria-label="name_ar"
        style={{ direction: "rtl" }}
      />
      <input
        value={nameFr}
        onChange={(e) => setNameFr(e.target.value)}
        placeholder="Nom en français (optionnel) — ex: Diar Sokra"
        aria-label="name_fr"
        style={{ direction: "ltr" }}
      />

      <button
        type="button"
        className="approve"
        disabled={pending}
        onClick={submit}
        style={{ padding: "10px 16px" }}
      >
        {pending ? "…" : "أضف الحي"}
      </button>

      {result && <p className="ok small">{result}</p>}
      {error && <p className="error small">{error}</p>}

      {delId && (
        <div>
          <p className="muted small" style={{ marginBottom: 6 }}>
            الأحياء الموجودة في هذه المعتمدية ({existing.length}):
          </p>
          {existing.length === 0 ? (
            <p className="muted small">لا يوجد حي بعد — أضف أول واحد.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {existing.map((n) => (
                <span
                  key={n}
                  className="badge"
                  style={{ direction: "rtl", fontWeight: 400 }}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
