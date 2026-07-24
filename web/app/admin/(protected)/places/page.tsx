import Link from "next/link";
import { sbGet } from "@/lib/supabase";
import NeighborhoodForm from "./NeighborhoodForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Place = {
  id: number;
  level: string;
  name_ar: string;
  name_fr: string | null;
  parent_id: number | null;
};

export default async function PlacesPage() {
  const places = await sbGet<Place[]>("places", {
    select: "id,level,name_ar,name_fr,parent_id",
    order: "name_ar.asc",
    limit: "2000",
  });

  return (
    <>
      <p className="crumb"><Link href="/admin">← queue</Link></p>
      <NeighborhoodForm places={places} />
    </>
  );
}
