/**
 * Live status, computed from the clock rather than stored.
 *
 * events.status exists in the database but is written once at parse time and
 * never updated, so it says "upcoming" forever. Anything the user is told is
 * happening NOW has to be derived at render time.
 *
 * The honesty problem this has to respect: end_time_official=false means the
 * announcement gave no binding end. We may not silently promote a guess into
 * "ended", because someone still without power would be told their outage is
 * over. So an unofficial end produces `endUncertain`, and the UI says the
 * power may still be out rather than declaring it back.
 */

export type LiveStatus = "upcoming" | "live" | "ended";

/** How long an outage with no stated end is assumed to run before we stop
 *  calling it live. Six hours matches the longest STEG rotation window seen
 *  in the announcements collected so far. */
const ASSUMED_HOURS = 6;

export type StatusResult = {
  status: LiveStatus;
  /** true when the end time is not official, so "ended" is an assumption */
  endUncertain: boolean;
  /** minutes until it starts; null unless upcoming */
  startsInMin: number | null;
};

export function computeStatus(
  ev: { starts_at: string | null; ends_at: string | null; end_time_official: boolean },
  now: Date = new Date()
): StatusResult {
  const t = now.getTime();
  const start = ev.starts_at ? new Date(ev.starts_at).getTime() : null;
  const officialEnd = ev.end_time_official && ev.ends_at
    ? new Date(ev.ends_at).getTime()
    : null;

  // No start time at all: a sudden fault announced without a clock.
  //
  // An earlier version called these "live", reasoning that a fault is not
  // something that starts later. That was wrong in the only way that matters:
  // the backfill contains 2025 faults with no start time, and they rendered as
  // "جاري الآن" forever — telling someone their water is out right now on the
  // strength of a year-old announcement.
  //
  // We cannot know when an outage began if nothing recorded it, and the public
  // app cannot read raw_documents (RLS denies anon) to recover the publication
  // date. So we decline to assert: never live, never a promise that it ended.
  if (start === null) {
    return { status: "ended", endUncertain: true, startsInMin: null };
  }

  if (t < start) {
    return {
      status: "upcoming",
      endUncertain: !ev.end_time_official,
      startsInMin: Math.round((start - t) / 60000),
    };
  }

  const effectiveEnd =
    officialEnd ??
    (ev.ends_at ? new Date(ev.ends_at).getTime() : start + ASSUMED_HOURS * 3600_000);

  if (t < effectiveEnd) {
    return { status: "live", endUncertain: !ev.end_time_official, startsInMin: null };
  }
  return {
    status: "ended",
    // Ended by assumption, not by announcement.
    endUncertain: !ev.end_time_official,
    startsInMin: null,
  };
}

/** Sort for the feed: live first, then soonest upcoming, then most recent ended. */
export function feedOrder<T extends { starts_at: string | null }>(
  items: (T & { _status: StatusResult })[]
): (T & { _status: StatusResult })[] {
  const rank = { live: 0, upcoming: 1, ended: 2 } as const;
  return [...items].sort((a, b) => {
    const r = rank[a._status.status] - rank[b._status.status];
    if (r !== 0) return r;
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    // upcoming: soonest first. live/ended: most recent first.
    return a._status.status === "upcoming" ? ta - tb : tb - ta;
  });
}
