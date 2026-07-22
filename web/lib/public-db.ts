import "server-only";
import { sbGet } from "./supabase";

/**
 * Public reads, through the anon/publishable key.
 *
 * Deliberately NOT the service key. The service key bypasses row-level
 * security, so a forgotten filter would publish unapproved events. With the
 * anon key the database refuses them regardless of what this file asks for —
 * the approval gate is enforced by Postgres, not by remembering.
 *
 * Still server-only: rendering on the server keeps the feed fast and means
 * the browser makes no database calls at all.
 */

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }
  return { url, key };
}

export function publicConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

async function anonGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const { url, key } = config();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}/rest/v1/${path}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    // The feed is about "is the power out right now"; never serve it stale.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`anon GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export type PublicPlace = {
  id: number;
  level: string;
  name_ar: string;
  name_fr: string | null;
  parent_id: number | null;
};

export type PublicEvent = {
  id: number;
  utility: string;
  event_kind: string;
  starts_at: string | null;
  ends_at: string | null;
  end_time_official: boolean;
  cause_text: string | null;
  event_areas: {
    place_id: number;
    named_explicitly: boolean;
    places: { name_ar: string } | null;
  }[];
};

export async function fetchPlaces(): Promise<PublicPlace[]> {
  return anonGet<PublicPlace[]>("places", {
    select: "id,level,name_ar,name_fr,parent_id",
    order: "name_ar.asc",
    limit: "1000",
  });
}

/**
 * Approved events, newest first. The RLS policy already restricts this to
 * approved rows; the query does not repeat the filter, so if the policy were
 * ever dropped the failure would be loud in testing rather than silent in
 * production.
 */
/**
 * Recent community report counts per place, for the "أكّدو N" badge.
 *
 * Uses the SERVICE key, not anon — deliberately. anon is INSERT-only on
 * reports and has no SELECT policy, because letting the public read the report
 * table would expose every device's reporting history. Counting happens here,
 * on the server, and only the aggregated numbers are sent to the browser. The
 * service key still never leaves the server.
 */
export async function fetchReportCounts(
  windowMinutes = 90
): Promise<Record<number, { cut: number; restored: number }>> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const rows = await sbGet<{ place_id: number | null; kind: string }[]>("reports", {
    select: "place_id,kind",
    reported_at: `gte.${since}`,
    is_flagged: "eq.false",
    limit: "5000",
  });
  const out: Record<number, { cut: number; restored: number }> = {};
  for (const r of rows) {
    if (r.place_id == null) continue;
    out[r.place_id] ??= { cut: 0, restored: 0 };
    if (r.kind === "cut") out[r.place_id].cut += 1;
    else if (r.kind === "restored") out[r.place_id].restored += 1;
  }
  return out;
}

/**
 * Display-level dedupe.
 *
 * Ten sites republish one STEG bulletin, and each becomes its own event
 * (events carry a single source_document_id — that is why "confirmed by N
 * sources" was dropped). Showing all ten reads as ten separate outages.
 *
 * Grouping key is deliberately strict: same utility, kind, and identical
 * start AND end timestamps. Two genuinely different outages sharing a
 * to-the-minute window are far less likely than one bulletin echoed. Within a
 * group the event with the most linked areas wins, since that is the reading
 * that lost the least.
 *
 * Display only — nothing is merged, deleted, or written back.
 */
export function dedupeForDisplay(events: PublicEvent[]): PublicEvent[] {
  const groups = new Map<string, PublicEvent>();
  for (const ev of events) {
    const key = [ev.utility, ev.event_kind, ev.starts_at ?? "-", ev.ends_at ?? "-"].join("|");
    const held = groups.get(key);
    if (!held || ev.event_areas.length > held.event_areas.length) {
      groups.set(key, ev);
    }
  }
  return [...groups.values()];
}

export async function fetchApprovedEvents(): Promise<PublicEvent[]> {
  return anonGet<PublicEvent[]>("events", {
    select:
      "id,utility,event_kind,starts_at,ends_at,end_time_official,cause_text," +
      "event_areas(place_id,named_explicitly,places(name_ar))",
    order: "starts_at.desc.nullslast",
    limit: "60",
  });
}
