import "server-only";
import { sbGet } from "./supabase";

export type Place = { name_ar: string; level: string } | null;

export type Area = {
  place_id: number;
  named_explicitly: boolean;
  raw_name_text: string | null;
  places: Place;
};

export type SourceDoc = {
  id: number;
  source_name: string;
  source_url: string;
  language: string | null;
  parsed_json: {
    localities?: { raw?: string }[];
    governorates?: string[];
    confidence?: number;
    confidence_reasons?: string[];
    list_final?: boolean;
  } | null;
};

export type QueueEvent = {
  id: number;
  utility: string;
  event_kind: string;
  starts_at: string | null;
  ends_at: string | null;
  end_time_official: boolean;
  cause_text: string | null;
  extraction_confidence: number | null;
  approval_status: string;
  backfilled?: boolean;
  event_areas: Area[];
  raw_documents: SourceDoc | null;
};

/** PHASE2.md: >= 0.85 goes to the bulk-approve section, below it to review. */
export const BULK_THRESHOLD = 0.85;

const SELECT = [
  "id,utility,event_kind,starts_at,ends_at,end_time_official,cause_text",
  "extraction_confidence,approval_status,backfilled",
  "event_areas(place_id,named_explicitly,raw_name_text,places(name_ar,level))",
  // raw_text is deliberately absent: 60k characters per row would make the
  // queue enormous. The side-by-side comparison view fetches it per event.
  "raw_documents(id,source_name,source_url,language,parsed_json)",
].join(",");

/** One event with the full announcement text, for the comparison view. */
export type EventDetail = QueueEvent & {
  raw_documents:
    | (SourceDoc & { raw_text: string; fetched_at?: string; published_at?: string | null })
    | null;
};

export async function fetchEvent(id: number): Promise<EventDetail | null> {
  const rows = await sbGet<EventDetail[]>("events", {
    select: SELECT.replace(
      "raw_documents(id,source_name,source_url,language,parsed_json)",
      "raw_documents(id,source_name,source_url,language,parsed_json,raw_text,fetched_at,published_at)"
    ),
    id: `eq.${id}`,
    limit: "1",
  });
  return rows[0] ?? null;
}

export async function fetchPendingEvents(): Promise<QueueEvent[]> {
  return sbGet<QueueEvent[]>("events", {
    select: SELECT,
    approval_status: "eq.pending",
    order: "id.desc",
    limit: "200",
  });
}

/**
 * Names the extractor found that no event_area covers.
 *
 * Read from parsed_json rather than from a stored list, because the design
 * contract says unmatched names are preserved and never dropped — so the
 * extraction itself stays the source of truth, and this recomputes against
 * whatever the registry knows today.
 */
export function unmatchedNames(ev: QueueEvent): string[] {
  const linked = new Set(
    ev.event_areas.map((a) => (a.raw_name_text ?? "").trim()).filter(Boolean)
  );
  const claimed = [
    ...(ev.raw_documents?.parsed_json?.governorates ?? []),
    ...(ev.raw_documents?.parsed_json?.localities ?? []).map((l) => l?.raw ?? ""),
  ];
  const seen = new Set<string>();
  return claimed
    .map((n) => (n ?? "").trim())
    .filter((n) => n && !linked.has(n) && !seen.has(n) && seen.add(n) !== undefined);
}

export function splitByConfidence(events: QueueEvent[]) {
  const high: QueueEvent[] = [];
  const low: QueueEvent[] = [];
  for (const ev of events) {
    ((ev.extraction_confidence ?? 0) >= BULK_THRESHOLD ? high : low).push(ev);
  }
  return { high, low };
}
