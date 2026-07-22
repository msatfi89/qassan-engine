"""
QASSAN PARSER WORKER
Takes raw_documents with parse_status='new', asks Claude to extract
structured outage data (per qassan-parser-spec.md), validates
deterministically, matches localities against the place registry,
and writes events + event_areas with the approval gate:
  confidence >= 0.85  -> approval_status 'pending' (bulk-approve queue)
  confidence <  0.85  -> approval_status 'pending' + flagged detail
NOTHING is published without approval. The AI never invents; we verify.

Run: python parser.py  (env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

import requests

MODEL = "claude-sonnet-4-6"
# USD per million tokens for MODEL. Used only to report what a run cost;
# update alongside MODEL if it changes.
PRICE_IN, PRICE_OUT = 3.00, 15.00
USAGE = {"calls": 0, "in": 0, "out": 0}


def usage_summary() -> str:
    cost = USAGE["in"] / 1e6 * PRICE_IN + USAGE["out"] / 1e6 * PRICE_OUT
    return (f"{USAGE['calls']} Claude calls, {USAGE['in']:,} in / "
            f"{USAGE['out']:,} out tokens, ${cost:.2f}")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_KEY = os.environ["ANTHROPIC_API_KEY"]

DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

SYSTEM_PROMPT = """You are the extraction engine of Qassan, a Tunisian utility-outage tracker.
You receive the raw text of ONE announcement or news article about electricity (STEG)
or water (SONEDE) service in Tunisia, in Arabic and/or French.

Return ONLY a JSON object, no markdown fences, no commentary:
{
 "is_outage_announcement": true/false,
 "utility": "electricity"|"water",
 "event_kind": "planned"|"sudden",
 "date": "YYYY-MM-DD",
 "start_time": "HH:MM"|null,
 "end_time": "HH:MM"|null,
 "end_time_official": true/false,
 "governorates": ["تونس", ...],
 "localities": [{"raw":"المنازه","governorate_guess":"تونس"}, ...],
 "cause_text": "verbatim or null",
 "list_final": true/false,
 "confidence": 0.0-1.0,
 "confidence_reasons": []
}

Rules:
1. NEVER add a locality not in the text. NEVER omit one that is.
2. Copy locality names character-for-character into "raw".
3. "غدا"=publication date+1. "اليوم"=publication date. Publication date is in the header.
4. Multiple dates or utilities in one text -> confidence <= 0.5 + reasons.
5. Hedged wording ("قد يتم اللجوء") does NOT lower confidence; it is normal STEG style.
6. Not an outage announcement -> {"is_outage_announcement": false} only.
"""


def _check(r, verb: str, path: str) -> None:
    """raise_for_status() drops the response body, but PostgREST puts the actual
    reason there ('permission denied for table X', 'relation does not exist').
    Without it a 403 is undiagnosable from the logs alone."""
    if r.status_code >= 400:
        raise RuntimeError(
            f"{verb} {path} -> HTTP {r.status_code}: {r.text[:500] or '(empty body)'}"
        )


def sb_get(path: str, params: dict) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=DB, params=params, timeout=20)
    _check(r, "GET", path)
    return r.json()


def sb_post(path: str, body, prefer="return=representation"):
    h = dict(DB, Prefer=prefer)
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=h, json=body, timeout=20)
    _check(r, "POST", path)
    return r.json() if "representation" in prefer else None


def sb_patch(path: str, params: dict, body: dict):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=DB, params=params, json=body, timeout=20)
    _check(r, "PATCH", path)


def log_run(ok: bool, detail: str):
    try:
        sb_post("pipeline_runs", {"component": "parser", "ok": ok, "detail": detail[:900],
                                  "finished_at": datetime.now(timezone.utc).isoformat()},
                prefer="return=minimal")
    except Exception:
        pass


def ask_claude(doc: dict) -> dict | None:
    header = f"source={doc['source_name']} | published={doc.get('published_at') or doc['fetched_at'][:10]} | url={doc['source_url']}"
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json={
            "model": MODEL,
            "max_tokens": 2000,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": header + "\n\n" + doc["raw_text"][:15000]}],
        },
        timeout=90,
    )
    if r.status_code >= 400:
        # Body carries the real reason (rate limit, credit exhausted, bad
        # model id). Over a long backfill these are the failures that matter.
        raise RuntimeError(f"Anthropic API {r.status_code}: {r.text[:400]}")
    payload = r.json()
    u = payload.get("usage") or {}
    USAGE["calls"] += 1
    USAGE["in"] += u.get("input_tokens", 0)
    USAGE["out"] += u.get("output_tokens", 0)
    text = "".join(b.get("text", "") for b in payload["content"] if b.get("type") == "text")
    text = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def validate(p: dict, published: str) -> list[str]:
    """Deterministic gates. Any failure -> low confidence route, human review."""
    problems = []
    if p.get("utility") not in ("electricity", "water"):
        problems.append("bad utility")
    if p.get("event_kind") not in ("planned", "sudden"):
        problems.append("bad event_kind")
    try:
        d = datetime.strptime(p.get("date", ""), "%Y-%m-%d").date()
        pub = datetime.strptime(published[:10], "%Y-%m-%d").date()
        if abs((d - pub).days) > 3:
            problems.append(f"date {d} far from publication {pub}")
    except ValueError:
        problems.append("bad date")
    st, en = p.get("start_time"), p.get("end_time")
    if st and en and st >= en:
        problems.append("start >= end")
    if p.get("event_kind") == "planned" and not (p.get("localities") or p.get("governorates")):
        problems.append("planned cut with no areas")
    return problems


def load_registry() -> dict:
    """alias/lowered-name -> LIST of matching places.

    A list, not a single row: place names are not unique nationally. الزهور is
    a delegation in both تونس and القصرين, and both are official. Keeping only
    the first match silently attached القصرين outages to a Tunis place."""
    places = sb_get("places", {"select": "id,level,name_ar,name_fr,aliases,parent_id", "limit": "5000"})
    idx: dict[str, list] = {}
    for pl in places:
        keys = {pl["name_ar"], pl.get("name_fr") or ""} | set(pl.get("aliases") or [])
        for k in keys:
            k = k.strip().lower()
            if k and pl not in idx.setdefault(k, []):
                idx[k].append(pl)
    return idx


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).lower()


# Announcements qualify place names in ways the registry does not:
#   حي التضامن      (neighbourhood of ...)  vs registry's التضامن
#   جهة زغوان       (region of ...)         vs registry's زغوان
#   وسط مدينة صفاقس (city centre of ...)    vs registry's صفاقس
# Longest alternatives first so "وسط مدينة" wins over "مدينة".
PREFIX_RE = re.compile(r"^(?:وسط\s+مدينة|معتمدية|منطقة|ولاية|مدينة|جهة|حي)\s+")


def lookup(registry: dict, raw: str, gov_ids: set | None = None):
    """Resolve a name to one place, or None.

    Name as written first; only then retry without a qualifying prefix. The
    stripped form still has to exist in the registry, so this widens matching
    without inventing places.

    When a name exists in several governorates, it is resolved only if the
    announcement itself named one of them. Otherwise it returns None and the
    name is reported as unmatched — a name in the review queue is recoverable,
    an outage silently pinned to the wrong governorate is not."""
    key = norm(raw)
    matches = registry.get(key)
    if not matches:
        stripped = PREFIX_RE.sub("", key).strip()
        if stripped and stripped != key:
            matches = registry.get(stripped)
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    if gov_ids:
        scoped = [m for m in matches
                  if m.get("parent_id") in gov_ids or m["id"] in gov_ids]
        if len(scoped) == 1:
            return scoped[0]
    return None  # ambiguous — surfaced for review rather than guessed


def process(doc: dict, registry: dict) -> str:
    parsed = ask_claude(doc)
    if parsed is None:
        sb_patch("raw_documents", {"id": f"eq.{doc['id']}"}, {"parse_status": "failed"})
        return "failed:json"
    sb_patch("raw_documents", {"id": f"eq.{doc['id']}"}, {"parsed_json": parsed})

    if not parsed.get("is_outage_announcement"):
        sb_patch("raw_documents", {"id": f"eq.{doc['id']}"}, {"parse_status": "no_event"})
        return "no_event"

    published = (doc.get("published_at") or doc["fetched_at"])[:10]
    problems = validate(parsed, published)
    confidence = float(parsed.get("confidence") or 0.0)
    if problems:
        confidence = min(confidence, 0.4)

    # build timestamps (Tunisia is UTC+1)
    def ts(day: str, hhmm: str | None):
        if not hhmm:
            return None
        return f"{day}T{hhmm}:00+01:00"

    event_body = {
        "utility": parsed["utility"],
        "event_kind": parsed["event_kind"],
        "status": "upcoming",
        "starts_at": ts(parsed["date"], parsed.get("start_time")),
        "ends_at": ts(parsed["date"], parsed.get("end_time")),
        "end_time_official": bool(parsed.get("end_time_official")),
        "cause_text": parsed.get("cause_text"),
        "is_official": True,
        "source_document_id": doc["id"],
        "extraction_confidence": round(confidence, 2),
        "approval_status": "pending",
    }
    if doc.get("is_backfill"):
        # Only sent when true, so live parsing still works on a database where
        # backfill-schema.sql has not been applied. Approval gate is unchanged:
        # historical events are 'pending' like every other event.
        event_body["backfilled"] = True
    event = sb_post("events", event_body)[0]

    # link areas: governorates (broad) + localities (named_explicitly)
    links, unmatched = [], []
    # Governorates first: their ids scope the locality lookups below, which is
    # what lets a name like الزهور resolve to the right one of two.
    gov_ids = set()
    for g in parsed.get("governorates") or []:
        pl = lookup(registry, g)
        if pl:
            gov_ids.add(pl["id"])
            if pl.get("parent_id"):
                gov_ids.add(pl["parent_id"])  # e.g. جربة filed as a governorate

    for g in parsed.get("governorates") or []:
        pl = lookup(registry, g)
        if pl:
            # Accept any level here: STEG sometimes files جربة (a delegation)
            # under governorates. Better linked to the right place than dropped.
            links.append({"event_id": event["id"], "place_id": pl["id"],
                          "named_explicitly": False, "raw_name_text": g})
        else:
            # Previously dropped in silence. STEG's operating regions
            # (الجنوب الغربي, الشمال الغربي) are not governorates, so events
            # covering them linked to nothing while keeping a high score.
            unmatched.append(g)
    for loc in parsed.get("localities") or []:
        raw = loc.get("raw", "")
        pl = lookup(registry, raw, gov_ids)
        if pl:
            links.append({"event_id": event["id"], "place_id": pl["id"],
                          "named_explicitly": True, "raw_name_text": raw})
        else:
            unmatched.append(raw)  # founder review: new place or typo?
    if links:
        # dedupe (event_id, place_id)
        uniq = {(l["event_id"], l["place_id"]): l for l in links}
        sb_post("event_areas", list(uniq.values()), prefer="return=minimal")

    final = confidence
    if unmatched:
        final = min(final, 0.6)
    if not links:
        # An outage attached to no place cannot be mapped or notified on, so it
        # must never outrank a well-linked event in the approval queue.
        final = min(final, 0.3)
    if final != confidence:
        sb_patch("events", {"id": f"eq.{event['id']}"},
                 {"extraction_confidence": round(final, 2)})
    if unmatched:
        log_run(True, f"event {event['id']}: unmatched places {unmatched[:10]}")
    if not links:
        log_run(True, f"event {event['id']}: NO AREAS LINKED - review manually")

    sb_patch("raw_documents", {"id": f"eq.{doc['id']}"}, {"parse_status": "parsed"})
    return f"event:{event['id']} conf={confidence:.2f} unmatched={len(unmatched)}"


def run(limit: int = 25, drain: bool = False) -> None:
    registry, total = None, 0
    while True:
        docs = sb_get("raw_documents",
                      {"select": "*", "parse_status": "eq.new",
                       "order": "fetched_at.asc", "limit": str(limit)})
        if not docs:
            break
        if registry is None:
            registry = load_registry()  # loaded once, reused across batches
        results = []
        for doc in docs:
            try:
                results.append(process(doc, registry))
            except Exception as e:
                sb_patch("raw_documents", {"id": f"eq.{doc['id']}"}, {"parse_status": "failed"})
                results.append(f"failed:{e}")
                print(f"  parse failed doc {doc['id']}: {e}", file=sys.stderr)
        total += len(docs)
        log_run(all(not r.startswith("failed") for r in results),
                f"{len(docs)} docs -> {results[:15]}")
        print(f"  batch of {len(docs)}: {results}")
        if not drain:
            break  # one batch per scheduled run, as before

    if total == 0:
        log_run(True, "no new documents")
        print("Parser: nothing new.")
        return
    print(f"Parser done: {total} document(s). {usage_summary()}")
    log_run(True, f"{total} docs parsed; {usage_summary()}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Parse new raw_documents into pending events.")
    ap.add_argument("--all", action="store_true",
                    help="keep going until no documents remain (use for backfill)")
    ap.add_argument("--limit", type=int, default=25, help="documents per batch")
    args = ap.parse_args()
    run(limit=args.limit, drain=args.all)
