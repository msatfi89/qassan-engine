"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { sbGet, sbPost } from "./supabase";

/**
 * Add a neighborhood (حي) under a delegation, from the dashboard, without SQL.
 *
 * Users keep reporting areas the picker is missing. The bulk OSM seed resolved
 * every parent by point-in-polygon and "never guessed"; this is the human
 * equivalent — an admin who knows the ground truth picks the delegation, so the
 * parent is still chosen by someone who knows, not by the machine.
 *
 * Like the approval actions, this re-checks the session itself: server actions
 * are POST endpoints reachable directly, and the /admin layout guard only
 * covers rendering.
 */

async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    throw new Error("Not signed in");
  }
}

export type AddNeighborhoodResult =
  | { ok: true; id: number; name: string; delegation: string }
  | { ok: true; duplicate: true; name: string; delegation: string }
  | { ok: false; message: string };

export async function addNeighborhood(input: {
  delegationId: number;
  nameAr: string;
  nameFr?: string;
}): Promise<AddNeighborhoodResult> {
  await requireAdmin();

  const delegationId = Number(input.delegationId);
  const nameAr = (input.nameAr ?? "").trim();
  const nameFr = (input.nameFr ?? "").trim();

  if (!Number.isInteger(delegationId) || delegationId <= 0) {
    return { ok: false, message: "Bad delegation id" };
  }
  if (nameAr.length < 2) {
    return { ok: false, message: "الاسم بالعربي مطلوب (حرفين على الأقل)" };
  }

  // The parent must really be a delegation. Without this, a directly-POSTed
  // call could hang a neighborhood off a governorate or another neighborhood
  // and quietly corrupt the picker's three-level hierarchy.
  const parent = await sbGet<{ id: number; level: string; name_ar: string }[]>(
    "places",
    { select: "id,level,name_ar", id: `eq.${delegationId}`, level: "eq.delegation", limit: "1" }
  );
  if (parent.length === 0) {
    return { ok: false, message: "المنطقة الأم لازم تكون معتمدية" };
  }
  const delegation = parent[0].name_ar;

  // Idempotent by (parent, name_ar), the same key the SQL seed used. Re-adding
  // a neighborhood that already exists is a no-op, not an error or a duplicate.
  const existing = await sbGet<{ id: number }[]>("places", {
    select: "id",
    level: "eq.neighborhood",
    parent_id: `eq.${delegationId}`,
    name_ar: `eq.${nameAr}`,
    limit: "1",
  });
  if (existing.length > 0) {
    return { ok: true, duplicate: true, name: nameAr, delegation };
  }

  const rows = await sbPost<{ id: number }[]>("places", {
    level: "neighborhood",
    parent_id: delegationId,
    name_ar: nameAr,
    name_fr: nameFr || null,
  });
  const id = rows?.[0]?.id ?? 0;

  // The public picker reads places on every render (no-store), so a new
  // neighborhood is selectable immediately; revalidate the cached routes too.
  revalidatePath("/");
  revalidatePath("/villes");
  revalidatePath("/signaler");
  revalidatePath("/admin/places");

  return { ok: true, id, name: nameAr, delegation };
}
