"""
QASSAN RETRO-LINK
Re-matches already-parsed documents against the registry as it stands now,
inserting the event_areas that were missed when the registry was smaller, and
recomputing the confidence ceilings that unmatched names imposed.

Makes NO Claude calls: every extraction is already stored verbatim in
raw_documents.parsed_json. Re-running after each registry change is free.

    python collector/retrolink.py --dry-run   # report only
    python collector/retrolink.py             # apply

Never edits parsed_json, never creates or deletes events, never touches
approval_status. It only adds links the registry can now justify.
"""

import argparse
import sys
from collections import Counter

import parser as P

PAGE = 1000


def fetch_all(path: str, params: dict) -> list:
    """PostgREST caps rows per response; page until short."""
    out, offset = [], 0
    while True:
        page = P.sb_get(path, {**params, "limit": str(PAGE), "offset": str(offset)})
        out.extend(page)
        if len(page) < PAGE:
            return out
        offset += PAGE


def main() -> int:
    ap = argparse.ArgumentParser(description="Re-link parsed documents against the current registry.")
    ap.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    args = ap.parse_args()

    registry = P.load_registry()
    events = fetch_all("events", {"select": "id,extraction_confidence,source_document_id",
                                  "order": "id.asc"})
    docs = {d["id"]: d.get("parsed_json")
            for d in fetch_all("raw_documents", {"select": "id,parsed_json",
                                                 "parsed_json": "not.is.null",
                                                 "order": "id.asc"})}
    existing = {(a["event_id"], a["place_id"])
                for a in fetch_all("event_areas", {"select": "event_id,place_id"})}

    print(f"\n{len(events)} events, {len(docs)} parsed documents, "
          f"{len(existing)} existing links"
          f"{'   [DRY RUN]' if args.dry_run else ''}\n")

    new_links, still_unmatched = [], Counter()
    events_touched, conf_updates = 0, []

    for ev in events:
        parsed = docs.get(ev.get("source_document_id"))
        if not parsed:
            continue

        # Same two-pass shape as parser.process: governorates first so their
        # ids can disambiguate locality names that exist in several.
        gov_ids, links, unmatched = set(), [], []
        for g in parsed.get("governorates") or []:
            pl = P.lookup(registry, g, prefer_level="governorate")
            if pl:
                gov_ids.add(pl["id"])
                if pl.get("parent_id"):
                    gov_ids.add(pl["parent_id"])

        for g in parsed.get("governorates") or []:
            pl = P.lookup(registry, g, prefer_level="governorate")
            if pl:
                links.append((pl["id"], False, g))
            else:
                unmatched.append(g)
        for loc in parsed.get("localities") or []:
            raw = loc.get("raw", "")
            pl = P.lookup(registry, raw, gov_ids, prefer_level="delegation")
            if pl:
                links.append((pl["id"], True, raw))
            else:
                unmatched.append(raw)

        added = 0
        for place_id, explicit, raw in links:
            if (ev["id"], place_id) in existing:
                continue
            existing.add((ev["id"], place_id))  # dedupe within this event too
            new_links.append({"event_id": ev["id"], "place_id": place_id,
                              "named_explicitly": explicit, "raw_name_text": raw})
            added += 1
        if added:
            events_touched += 1
            print(f"  event {ev['id']}: +{added} link(s), {len(unmatched)} still unmatched")

        for u in unmatched:
            still_unmatched[u] += 1

        # Confidence is deliberately only ever LOWERED here.
        #
        # Raising it is not reconstructable: parser.process also caps at 0.4
        # when validate() finds a problem, and those problems are not stored.
        # An event capped at 0.6 for names the registry now knows may equally
        # have been capped at 0.4 for a bad date. Lifting it would need a
        # number we do not have — and 0.85 is the bulk-approve threshold in
        # PHASE2.md, so a guess there would push events into the one-tap
        # approve pile. Leaving them conservative costs Med a manual review;
        # guessing costs correctness.
        base = float(ev.get("extraction_confidence") or 0.0)
        if not links and base > 0.3:
            conf_updates.append((ev["id"], round(min(base, 0.3), 2)))

    print("\n" + "-" * 62)
    print(f"  {len(new_links)} new link(s) across {events_touched} event(s)")
    print(f"  {len(still_unmatched)} distinct name(s) still unmatched")
    if still_unmatched:
        print("\n  Most frequent unmatched names (the registry's next gap):")
        for name, n in still_unmatched.most_common(25):
            print(f"    {n:>3}x  {name}")

    if args.dry_run:
        print("\n  Dry run — nothing written.")
        return 0

    for i in range(0, len(new_links), 500):
        P.sb_post("event_areas", new_links[i:i + 500], prefer="return=minimal")
    print(f"\n  inserted {len(new_links)} event_areas row(s)")

    for ev_id, capped in conf_updates:
        P.sb_patch("events", {"id": f"eq.{ev_id}"}, {"extraction_confidence": capped})
    if conf_updates:
        print(f"  capped {len(conf_updates)} event(s) that still link to no place")
    print("\n  Confidence was never raised — see the note in the source for why.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
