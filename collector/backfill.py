"""
QASSAN BACKFILL
Walks the date archives of the WordPress-style sources for one month, ranks
links with the SAME logic the live collector uses, and stores matching
articles verbatim into raw_documents with is_backfill=true. The existing
parser then turns them into events — same validation, same approval gate.

Run:
    python collector/backfill.py 2025-07 --dry-run   # count only, costs nothing
    python collector/backfill.py 2025-07             # fetch and store

--dry-run walks the archives and reports how many outage-looking articles it
would fetch, without downloading them, writing anything, or calling Claude.
Always dry-run a new month first: that number is what the Claude bill scales
with.

Deliberately NOT wired into GitHub Actions: one month is ~200 archive pages,
well past the workflow's 12-minute budget.
"""

import argparse
import re
import sys
import time
from datetime import datetime

import trafilatura

import collector as C

# Sources exposing browsable /YYYY/MM/ archives with /page/N/ pagination.
# max_pages is a safety stop, set above the observed page count for a busy
# month (July 2025: directinfo 58, wmc_ar 125, alikhbaria 26).
ARCHIVE_SOURCES = [
    {"name": "wmc_ar",      "base": "https://ar.webmanagercenter.com",        "max_pages": 200},
    {"name": "directinfo",  "base": "https://directinfo.webmanagercenter.com", "max_pages": 100},
    {"name": "alikhbaria",  "base": "https://www.alikhbariaattounsia.com",     "max_pages": 60},
]

PAGE_DELAY = 1.0      # between archive listing pages
ARTICLE_DELAY = 1.5   # between article fetches — matches the live collector


def archive_urls(base: str, year: int, month: int, max_pages: int):
    """WordPress date archive: /YYYY/MM/ then /YYYY/MM/page/N/."""
    yield f"{base}/{year}/{month:02d}/"
    for n in range(2, max_pages + 1):
        yield f"{base}/{year}/{month:02d}/page/{n}/"


def in_month(url: str, year: int, month: int) -> bool:
    """True for article URLs dated inside the month being backfilled.

    Requires the day segment (/2025/07/31/...), which also excludes the
    archive's own pagination links (/2025/07/page/4/) — those would otherwise
    read as articles and the end-of-archive check would never fire."""
    return re.search(rf"/{year}/{month:02d}/\d{{1,2}}/", url) is not None


def page_articles(html: str, page_url: str, year: int, month: int) -> list[str]:
    """Every in-month article on this page, regardless of topic.

    Used only to decide whether the archive has ended. Outage stories are a
    small share of a general news site's output, so 'no outage articles here'
    says nothing about whether more pages exist — but 'no articles at all'
    means we have run past the last page."""
    urls, seen = [], set()
    for href, _anchor in C.LINK_RE.findall(html):
        if C.SKIP_HREF.match(href):
            continue
        full = C.absolutize(page_url, href.strip())
        if full not in seen and in_month(full, year, month):
            seen.add(full)
            urls.append(full)
    return urls


def discover(src: dict, year: int, month: int) -> list[str]:
    """Walk one source's archive, returning de-duplicated in-month article
    URLs that the live ranking considers outage-related."""
    found, seen, empty_pages = [], set(), 0
    for page_url in archive_urls(src["base"], year, month, src["max_pages"]):
        html = C.fetch(page_url)
        if not html:
            break  # past the last page, or the site stopped answering

        articles = page_articles(html, page_url, year, month)
        if not articles:
            empty_pages += 1
            if empty_pages >= 2:  # two bare pages in a row: archive exhausted
                break
            time.sleep(PAGE_DELAY)
            continue
        empty_pages = 0

        # cap=None: no politeness cap here, we want the whole month
        ranked = set(C.candidate_links(html, page_url, cap=None))
        hits = [u for u in articles if u in ranked and u not in seen]
        seen.update(hits)
        found.extend(hits)
        if hits:
            print(f"    {page_url.rsplit('/', 2)[-2] or 'p1':>4}: "
                  f"{len(articles):>2} articles, {len(hits)} outage-related "
                  f"({len(found)} so far)")
        time.sleep(PAGE_DELAY)
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill one month of outage announcements.")
    ap.add_argument("month", help="month to backfill, as YYYY-MM (e.g. 2025-07)")
    ap.add_argument("--dry-run", action="store_true",
                    help="count candidates only; no downloads, no writes, no Claude calls")
    args = ap.parse_args()

    try:
        target = datetime.strptime(args.month, "%Y-%m")
    except ValueError:
        print(f"error: month must look like 2025-07, got {args.month!r}", file=sys.stderr)
        return 2
    year, month = target.year, target.month

    print(f"\nQASSAN backfill — {year}-{month:02d}"
          f"{'  [DRY RUN — nothing will be written]' if args.dry_run else ''}\n")

    per_source, all_urls = {}, []
    for src in ARCHIVE_SOURCES:
        print(f"  [{src['name']}] walking archive...")
        urls = discover(src, year, month)
        per_source[src["name"]] = len(urls)
        all_urls.extend((src["name"], u) for u in urls)
        print(f"  [{src['name']}] {len(urls)} candidate article(s)\n")

    print("-" * 62)
    for name, n in per_source.items():
        print(f"  {name:<12} {n:>5} candidate articles")
    print(f"  {'TOTAL':<12} {len(all_urls):>5}")

    if args.dry_run:
        # Rough guide only. store_document drops duplicates by content hash,
        # and the parser skips anything that is not an announcement, so the
        # number actually billed is lower — usually well under half.
        hi = len(all_urls) * 0.033
        print(f"\n  Upper bound if every candidate were parsed: ~${hi:,.2f}")
        print("  Real cost is lower: duplicates are dropped before parsing and")
        print("  non-announcements are rejected by the text pre-filter.")
        print("\n  Dry run — nothing fetched, nothing stored, nothing billed.")
        return 0

    print("\nFetching articles...\n")
    stored = skipped = short = 0
    for i, (source, url) in enumerate(all_urls, 1):
        html = C.fetch(url)
        if not html:
            skipped += 1
            continue
        text = trafilatura.extract(html) or ""
        if len(text) < 120:
            short += 1
            continue
        # Cheap pre-filter: an article whose full text never mentions a cut,
        # electricity or water cannot be an announcement. Rejecting it here
        # costs nothing; sending it to Claude would cost ~$0.03. Deliberately
        # generous — it only drops texts with no topical word at all, so a
        # real announcement cannot be filtered away.
        if not C.TOPIC_RE.search(text) and not C.UTILITY_RE.search(text):
            skipped += 1
            continue
        if C.store_document(source, url, text, is_backfill=True):
            stored += 1
            print(f"  [{i}/{len(all_urls)}] + {source}: {url[:88]}")
        else:
            skipped += 1  # duplicate content hash, or rejected
        time.sleep(ARTICLE_DELAY)

    print("-" * 62)
    print(f"  stored {stored} new document(s); {skipped} skipped "
          f"(duplicate/off-topic), {short} too short to be announcements")
    print("\n  Next: run the parser to turn these into pending events:")
    print("      python collector/parser.py")
    print("  It reports token usage and dollar cost when it finishes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
