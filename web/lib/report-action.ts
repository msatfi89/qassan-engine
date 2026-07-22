"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { sbGet } from "./supabase";
import { sbPost } from "./supabase";

/**
 * Community reports: "الضو مقصوص توّا" and "رجع الضو".
 *
 * Anonymous by construction. The client holds a random id in localStorage
 * that is tied to nothing; the server hashes it before storing, so the value
 * in the database cannot be matched back to anything a device holds. No
 * account, no email, no name, and — per chat-Claude's ruling — no location.
 *
 * area_confirmed records that the user explicitly agreed which area they were
 * reporting for. It is a fact about their answer, not about where they are.
 *
 * Runs with the service key, not anon: enforcing "1 report per kind per area
 * per device per 30 minutes" requires READING recent reports, and the anon
 * role is INSERT-only by policy. Doing the check here keeps it server-side,
 * which the spec requires — a UI-only limit is bypassed by reloading.
 */

const WINDOW_MINUTES = 30;

function hashDevice(raw: string): string {
  // Peppered so a database leak cannot be correlated with a value held by a
  // device. Falls back to the session secret, which is already required.
  const pepper = process.env.ADMIN_SESSION_SECRET ?? "qassan";
  return createHash("sha256").update(`${pepper}:${raw}`).digest("hex");
}

/** Values fixed by reports_kind_check in the database, not chosen here. */
export type ReportKind = "cut" | "restored";
export type ReportResult =
  | { ok: true; neighbours: number }
  | { ok: false; reason: "rate_limited" | "bad_input" | "failed"; message: string };

export async function submitReport(input: {
  deviceId: string;
  placeId: number;
  utility: "electricity" | "water";
  kind: ReportKind;
  areaConfirmed: boolean;
}): Promise<ReportResult> {
  const { deviceId, placeId, utility, kind, areaConfirmed } = input;

  if (
    typeof deviceId !== "string" ||
    deviceId.length < 8 ||
    !Number.isInteger(placeId) ||
    placeId <= 0 ||
    (utility !== "electricity" && utility !== "water") ||
    (kind !== "cut" && kind !== "restored")
  ) {
    return { ok: false, reason: "bad_input", message: "طلب غير صالح" };
  }

  const device = hashDevice(deviceId);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  try {
    const recent = await sbGet<{ id: number }[]>("reports", {
      select: "id",
      device_hash: `eq.${device}`,
      kind: `eq.${kind}`,
      place_id: `eq.${placeId}`,
      reported_at: `gte.${since}`,
      limit: "1",
    });
    if (recent.length > 0) {
      return {
        ok: false,
        reason: "rate_limited",
        message: `سجّلنا تبليغك. جرّب مرة أخرى بعد ${WINDOW_MINUTES} دقيقة.`,
      };
    }

    await sbPost(
      "reports",
      {
        device_hash: device,
        place_id: placeId,
        utility,
        kind,
        area_confirmed: areaConfirmed,
      },
      "return=minimal"
    );

    // "Neighbours": other devices reporting the same area in the last 90
    // minutes. Counted server-side because anon cannot read reports at all.
    const window90 = new Date(Date.now() - 90 * 60_000).toISOString();
    const neighbours = await sbGet<{ id: number }[]>("reports", {
      select: "id",
      place_id: `eq.${placeId}`,
      kind: `eq.${kind}`,
      reported_at: `gte.${window90}`,
      // Respect the moderation flag the schema already provides: a report
      // someone has flagged should not inflate the count others are shown.
      is_flagged: "eq.false",
      limit: "500",
    });

    revalidatePath("/");
    return { ok: true, neighbours: neighbours.length };
  } catch (e) {
    return {
      ok: false,
      reason: "failed",
      message: e instanceof Error ? e.message : "تعذّر الإرسال",
    };
  }
}
