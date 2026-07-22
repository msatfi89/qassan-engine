"""
QASSAN COLLECTOR
Fetches Tunisian outage-announcement sources, extracts article text,
dedupes by content hash, stores verbatim into raw_documents.
Design: generic keyword-link crawler — resilient to site redesigns,
because the AI parser downstream understands text, not layouts.

Run: python collector.py   (env: SUPABASE_URL, SUPABASE_SERVICE_KEY)
"""

import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import unquote

import requests
import trafilatura

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; QassanBot/1.0; +https://qassan.app/about)"
}

# Listing pages to scan. Claude Code: verify each URL resolves on deploy;
# adjust paths if a site moved. Adding a source = adding one line.
SOURCES = [
    # verified 2026-07-21: /fr/actualites.html now 404s; /fr/news is the live
    # listing and carries the "إشعار بانقطاع الكهرباء" notices per region
    {"name": "steg",        "url": "https://www.steg.com.tn/fr/news"},
    # verified 2026-07-21: index.php?id=25 is now the homepage; the actual
    # communiqués listing moved to Médiathèque → Actualités
    {"name": "sonede",      "url": "https://www.sonede.com.tn/mediatheque/actualites/"},
    {"name": "tuniscope",   "url": "https://www.tuniscope.com/"},
    # almasdar.tn 301s to ar.webmanagercenter.com — same site, listed once below
    {"name": "directinfo",  "url": "https://directinfo.webmanagercenter.com/"},
    {"name": "wmc_ar",      "url": "https://ar.webmanagercenter.com/"},
    # verified live 2026-07-22
    {"name": "alikhbaria",  "url": "https://www.alikhbariaattounsia.com/"},
    {"name": "tunimedia",   "url": "https://tunimedia.tn/"},
    {"name": "tunisienum",  "url": "https://www.tunisienumerique.com/"},
    {"name": "jawharafm",   "url": "https://www.jawharafm.net/"},
    {"name": "mateurnews",  "url": "https://mateurnews.com/"},
]

# PARKED — reachable by hand, useless from the GitHub runner. Revisit with a
# proxy or a residential egress; their announcements are echoed elsewhere.
#   assarih    https://assarih.com/          blocks datacentre IPs: every
#                                            scheduled run logged "listing
#                                            unreachable", though it serves
#                                            fine from a home connection.
#   mosaiquefm https://www.mosaiquefm.net/   returns only a <title>; the body
#                                            is JS-rendered or behind a bot
#                                            wall, so LINK_RE finds nothing.

# Topic words. Latin terms are word-bounded: bare "eau" also matched
# nouv-eau / rés-eau / bur-eau / niv-eau, which pulled in unrelated articles
# from French news homepages by the dozen.
TOPIC = (
    r"قطع|انقطاع|الكهرباء|الماء|قصان|تقص|صيانة"
    r"|\bcoupures?\b|\bélectricit[ée]\b|\belectricite\b|\beaux?\b|\bpotable\b"
)

# Utility names are a strong signal in link *text* ("la STEG annonce...") but
# useless in a URL: every page on steg.com.tn contains "steg", so matching the
# URL made the entire site qualify — the 15-link cap was then spent on the nav
# bar and the real announcements further down the page were never reached.
UTILITY = r"الستاغ|الصوناد|\bsteg\b|\bsonede\b"

TOPIC_RE = re.compile(TOPIC, re.IGNORECASE)
UTILITY_RE = re.compile(UTILITY, re.IGNORECASE)

PER_SOURCE_CAP = 15  # politeness cap on article fetches per source per run

# Non-navigable hrefs. absolutize() would turn "mailto:cnsd@steg.com.tn" into
# "https://www.steg.com.tn/mailto:cnsd@steg.com.tn", and the address itself
# contains "steg", so every contact link scored as a match and consumed the cap.
SKIP_HREF = re.compile(r"^\s*(mailto:|tel:|javascript:|data:|ftp:|#)", re.IGNORECASE)

LINK_RE = re.compile(r'<a\s[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)

# HTTP status codes returned by rejected raw_documents writes (see store_document)
REJECTIONS: list[int] = []


def log_run(component: str, ok: bool, detail: str) -> None:
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/pipeline_runs",
            headers=HEADERS_DB,
            json={"component": component, "ok": ok, "detail": detail[:900],
                  "finished_at": datetime.now(timezone.utc).isoformat()},
            timeout=15,
        )
    except Exception:
        pass  # health logging must never crash the pipeline


def fetch(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HTTP_HEADERS, timeout=25)
        if r.status_code == 200:
            return r.text
    except Exception as e:
        print(f"  fetch failed {url}: {e}", file=sys.stderr)
    return None


def absolutize(base: str, href: str) -> str:
    if href.startswith("http"):
        return href
    root = "/".join(base.split("/")[:3])
    return root + (href if href.startswith("/") else "/" + href)


def candidate_links(listing_html: str, base_url: str, cap: int | None = PER_SOURCE_CAP) -> list[str]:
    """Rank by signal strength so the politeness cap is spent on real
    announcements rather than on whatever appears first in the HTML.

      tier 1 - link text names an outage ("إشعار بانقطاع الكهرباء")
      tier 2 - decoded URL names an outage (.../coupures-delectricite-...)
      tier 3 - link text only names the utility ("STEG en chiffres")

    Tier 3 is kept because third-party articles often say "la STEG annonce",
    but it must rank last: on steg.com.tn every nav link qualifies for it.
    """
    seen, tier1, tier2, tier3 = set(), [], [], []
    for href, anchor in LINK_RE.findall(listing_html):
        if SKIP_HREF.match(href):
            continue
        text = re.sub(r"<[^>]+>", " ", anchor)
        full = absolutize(base_url, href.strip())
        if full in seen or len(full) >= 500:
            continue
        seen.add(full)
        if TOPIC_RE.search(text):
            tier1.append(full)
        # unquote: STEG's notice URLs carry the Arabic headline percent-encoded,
        # so the raw href never matches an Arabic keyword.
        elif TOPIC_RE.search(unquote(href)):
            tier2.append(full)
        elif UTILITY_RE.search(text):
            tier3.append(full)
    ranked = tier1 + tier2 + tier3
    # cap=None: take everything. The backfill wants completeness over a fixed
    # past month, where the politeness cap would silently truncate history.
    return ranked if cap is None else ranked[:cap]


# WordPress-style article URLs carry their publication date: /2025/07/03/slug.
# Without it the parser falls back to fetched_at, which for a backfill is the
# day we crawled — so a 2025 announcement would be dated to today.
ARTICLE_DATE_RE = re.compile(r"/(20\d{2})/(\d{1,2})/(\d{1,2})/")


def url_published_date(url: str) -> str | None:
    """ISO date from the URL path, or None if it carries no plausible date."""
    m = ARTICLE_DATE_RE.search(url)
    if not m:
        return None
    year, month, day = (int(g) for g in m.groups())
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def store_document(source: str, url: str, text: str, is_backfill: bool = False) -> bool:
    content_hash = hashlib.sha256(
        re.sub(r"\s+", " ", text.strip()).encode("utf-8")
    ).hexdigest()
    lang = "ar" if re.search(r"[\u0600-\u06FF]", text) else "fr"
    body = {
        "source_name": source,
        "source_url": url[:990],
        "content_hash": content_hash,
        "language": lang,
        "raw_text": text[:60000],
    }
    if is_backfill:
        # Only sent when true, so live collection keeps working on a database
        # where backfill-schema.sql has not been applied yet.
        body["is_backfill"] = True
    # Applies to live collection too: when the URL states the date, it beats
    # inferring one from when the crawler happened to run.
    published = url_published_date(url)
    if published:
        body["published_at"] = published
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/raw_documents",
        headers=HEADERS_DB,
        json=body,
        timeout=20,
    )
    if resp.status_code in (200, 201):
        return True
    if resp.status_code == 409:  # duplicate content hash — expected, not an error
        return False
    # Anything else is a real rejection (auth, permissions, schema). Surface it:
    # silently returning False here is what let a fully broken run report
    # "0 new documents" and exit green.
    print(f"  ! REJECTED [{source}] HTTP {resp.status_code}: {resp.text[:300]}",
          file=sys.stderr)
    REJECTIONS.append(resp.status_code)
    return False


def run() -> None:
    new_docs, candidates, extracted = 0, 0, 0
    for src in SOURCES:
        listing = fetch(src["url"])
        if not listing:
            log_run("collector", False, f"listing unreachable: {src['name']}")
            continue
        links = candidate_links(listing, src["url"])
        candidates += len(links)
        print(f"  [{src['name']}] {len(links)} candidate link(s)")
        for link in links:
            html = fetch(link)
            if not html:
                continue
            text = trafilatura.extract(html) or ""
            if len(text) < 120:  # too short to be an announcement
                continue
            extracted += 1
            if store_document(src["name"], link, text):
                new_docs += 1
                print(f"  + stored [{src['name']}] {link}")
            time.sleep(1.5)  # politeness between article fetches

    print(f"Collector done: {candidates} candidates, {extracted} articles extracted, "
          f"{new_docs} new documents, {len(REJECTIONS)} rejected.")

    # If we had articles to save and the database refused every one of them,
    # that is a broken deployment, not an uneventful day. Fail loudly.
    if REJECTIONS and new_docs == 0:
        log_run("collector", False,
                f"all {len(REJECTIONS)} writes rejected, e.g. HTTP {REJECTIONS[0]}")
        sys.exit(f"FATAL: every write was rejected (HTTP {sorted(set(REJECTIONS))}). "
                 f"Check SUPABASE_SERVICE_KEY and table permissions.")

    log_run("collector", True, f"run complete, {new_docs} new documents")


if __name__ == "__main__":
    run()
