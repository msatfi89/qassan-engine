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
    {"name": "assarih",     "url": "https://assarih.com/"},
    {"name": "directinfo",  "url": "https://directinfo.webmanagercenter.com/"},
    {"name": "wmc_ar",      "url": "https://ar.webmanagercenter.com/"},
]

# A link is interesting if its anchor text or URL matches any of these
KEYWORDS = re.compile(
    r"قطع|انقطاع|الكهرباء|الستاغ|الماء|الصوناد|قصان|تقص|coupure|électricité|electricite|steg|sonede|eau",
    re.IGNORECASE,
)

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


def candidate_links(listing_html: str, base_url: str) -> list[str]:
    seen, out = set(), []
    for href, anchor in LINK_RE.findall(listing_html):
        text = re.sub(r"<[^>]+>", " ", anchor)
        if KEYWORDS.search(text) or KEYWORDS.search(href):
            full = absolutize(base_url, href.strip())
            if full not in seen and len(full) < 500:
                seen.add(full)
                out.append(full)
    return out[:15]  # per source per run — politeness cap


def store_document(source: str, url: str, text: str) -> bool:
    content_hash = hashlib.sha256(
        re.sub(r"\s+", " ", text.strip()).encode("utf-8")
    ).hexdigest()
    lang = "ar" if re.search(r"[\u0600-\u06FF]", text) else "fr"
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/raw_documents",
        headers=HEADERS_DB,
        json={
            "source_name": source,
            "source_url": url[:990],
            "content_hash": content_hash,
            "language": lang,
            "raw_text": text[:60000],
        },
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
