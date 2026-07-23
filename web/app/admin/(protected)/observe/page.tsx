import Link from "next/link";
import { sbGet } from "@/lib/supabase";
import ObserveForm from "./ObserveForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Place = { id: number; level: string; name_ar: string; parent_id: number | null };

export default async function ObservePage() {
  const places = await sbGet<Place[]>("places", {
    select: "id,level,name_ar,parent_id",
    order: "name_ar.asc",
    limit: "1000",
  });

  return (
    <>
      <p className="crumb"><Link href="/admin">← queue</Link></p>
      <ObserveForm places={places} />
    </>
  );
}
