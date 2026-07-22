"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { sbPatch } from "./supabase";

/**
 * Approval actions — the only code in the project that can move an event out
 * of 'pending'. Everything upstream deliberately cannot.
 *
 * Server actions are POST endpoints and are reachable directly. The /admin
 * layout guard only covers rendering, so each action re-checks the session
 * itself; without that, anyone who knew the endpoint could approve events.
 */

async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    throw new Error("Not signed in");
  }
}

export type Decision = "approve" | "reject";

/**
 * PHASE2.md: "Status flip sets approved_at. Rejected events keep their
 * raw_document." So this only ever changes the event row — the announcement
 * it came from is never deleted, and a rejection can be revisited.
 */
export async function decideEvent(id: number, decision: Decision) {
  await requireAdmin();

  if (!Number.isInteger(id) || id <= 0) throw new Error("Bad event id");
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Bad decision");
  }

  const body: Record<string, unknown> =
    decision === "approve"
      ? { approval_status: "approved", approved_at: new Date().toISOString() }
      : { approval_status: "rejected" };

  // Filter on the current status as well as the id: if this event was already
  // decided (another tab, a double submit), the filter matches nothing and the
  // earlier decision stands rather than being silently overwritten.
  const rows = await sbPatch<unknown[]>(
    "events",
    { id: `eq.${id}`, approval_status: "eq.pending" },
    body
  );

  revalidatePath("/admin");
  revalidatePath(`/admin/event/${id}`);
  return { changed: rows.length };
}

/**
 * Bulk approve for the >= 0.85 tier.
 *
 * Takes explicit ids rather than "approve everything above the threshold".
 * A confidence-based server-side sweep could approve an event that arrived
 * after the page rendered and that Med never actually saw.
 */
export async function approveMany(ids: number[]) {
  await requireAdmin();

  const clean = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (clean.length === 0) return { changed: 0 };

  const rows = await sbPatch<unknown[]>(
    "events",
    { id: `in.(${clean.join(",")})`, approval_status: "eq.pending" },
    { approval_status: "approved", approved_at: new Date().toISOString() }
  );

  revalidatePath("/admin");
  return { changed: rows.length };
}
