"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { sbPost } from "./supabase";

/**
 * Create a "social observation" event from something Med read on social media.
 *
 * These are is_official = false and carry the label "غير مؤكد" everywhere they
 * appear. They exist so a visible signal ("people on Facebook are saying the
 * power is out in X") can reach the app before STEG publishes — but the app
 * must never let that signal masquerade as confirmed.
 *
 * Firewall against the citizen-report counts: observations are rows in EVENTS.
 * The "أكّدو N من الجيران" numbers come from the REPORTS table, which this never
 * touches. The two cannot cross-contaminate because they are different tables
 * read by different code paths.
 */

async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) throw new Error("Not signed in");
}

export type ObservationInput = {
  placeId: number;
  utility: "electricity" | "water";
  note: string;
  sourceUrl: string;
};

export async function createObservation(input: ObservationInput) {
  await requireAdmin();

  const { placeId, utility, note, sourceUrl } = input;
  if (!Number.isInteger(placeId) || placeId <= 0) throw new Error("Pick an area");
  if (utility !== "electricity" && utility !== "water") throw new Error("Bad utility");
  const text = (note ?? "").trim();
  if (text.length < 3) throw new Error("Add a short note");
  const url = (sourceUrl ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error("Source link must start with http");

  const now = new Date().toISOString();

  // Approved on creation: Med entering it through the authenticated dashboard
  // IS the approval act, the same as tapping Approve on a parsed event. It is
  // still gated — an anonymous visitor cannot create one. event_kind is
  // 'sudden' because an observation of an ongoing cut is by nature unplanned,
  // and end_time_official is false so the card never implies a return time.
  const event = await sbPost<{ id: number }[]>("events", {
    utility,
    event_kind: "sudden",
    status: "live",
    starts_at: now,
    ends_at: null,
    end_time_official: false,
    cause_text: text,
    is_official: false, // the marker for a social observation
    source_url: url || null,
    source_document_id: null,
    extraction_confidence: null,
    approval_status: "approved",
    approved_at: now,
  });

  const eventId = event?.[0]?.id;
  if (!eventId) throw new Error("Insert did not return an id");

  await sbPost(
    "event_areas",
    [{ event_id: eventId, place_id: placeId, named_explicitly: true,
       raw_name_text: null }],
    "return=minimal"
  );

  revalidatePath("/");
  revalidatePath("/admin");
  return { id: eventId };
}
