# Deployment

9assan has two deployable halves that share one Supabase project:

- **the engine** — Python collector + parser, run on GitHub Actions cron
- **the app** — a Next.js site (public feed + admin dashboard) on Vercel

The design contract both halves preserve: raw source text is stored verbatim,
nothing is published until `approval_status` is `approved`/`auto_approved`, the
parser never invents or omits localities, and the service key stays
server-side.

## Prerequisites

- A Supabase project with `qassan-schema.sql` applied
- An Anthropic API key (console.anthropic.com)
- A GitHub account (hosts the repo and runs the engine cron)
- A Vercel account (hosts the app)

## Database setup

Run these in the Supabase SQL editor, in order. Each is idempotent.

1. `seed-places.sql` — seeds the place registry. Verify:
   `select count(*) from places;` → ~110 initially.
2. `registry-full.sql` — imports all ~264 delegations (grows the registry to
   ~286). Sourced from Arabic Wikipedia, matched by ISO where names differ.
3. `registry-merge.sql` — merges seed/official spelling variants (e.g.
   `التضامن` → `حي التضامن`) so one place is one row.
4. `backfill-schema.sql` — adds `events.backfilled` / `raw_documents.is_backfill`
   and indexes, for the historical backfill.
5. `public-app-schema.sql` — the row-level-security policies and grants that
   make the anon/publishable key safe in a browser. **This is what enforces the
   approval gate at the database.** Verify anon can read only approved events
   and cannot read `raw_documents` at all.
6. `observation-schema.sql` — adds `events.source_url` for manual social
   observations.

## Engine (GitHub Actions)

1. Push this repository to GitHub. A public repo gets unlimited Actions minutes,
   which the ≤30-minute collection cadence requires; a private repo's free tier
   (2,000 min/month) does not stretch to it.
2. **Settings → Secrets and variables → Actions**, add:
   - `SUPABASE_URL` — Supabase → Settings → Data API → Project URL
   - `SUPABASE_SERVICE_KEY` — the secret key (`sb_secret_…`). Bypasses RLS by
     design; backend only, never in frontend code.
   - `ANTHROPIC_API_KEY`
3. **Verify source URLs.** Open each URL in `collector/collector.py` `SOURCES`;
   news sites move their listing paths. If one 404s, find the current
   news/communiqués page and update the line. Adding a source is one line.
4. **First run:** Actions → `qassan-engine` → *Run workflow*. Then check:
   - `select source_name, count(*) from raw_documents group by 1;`
   - `select id, utility, event_kind, starts_at, extraction_confidence,
      approval_status from events order by id desc limit 20;`
   - `select * from pipeline_runs order by id desc limit 10;`
5. **Judge parser quality.** For each created event, compare against the
   `raw_documents.raw_text` it came from. Success bar: zero invented localities,
   zero missed localities on real announcements. Adjust `SYSTEM_PROMPT` in
   `parser.py` only deliberately.
6. **Leave the cron running.** It collects and parses every ~30 minutes during
   06:00–23:00 Tunisia time (sparse overnight). Events accumulate as `pending`;
   the dashboard is where they are approved.

### Historical backfill (optional)

`qassan-backfill` (manual workflow) walks the news archives for a month or a
range and stores matching articles with `is_backfill=true`. Always dry-run
first — it reports candidate counts and costs nothing. A month of peak season
measured ≈ $0.13; the full 2023→today ≈ $5.

## App (Vercel)

1. Import the repo into Vercel. **Set Root Directory to `web`** — the app lives
   there, the engine at the repo root.
2. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` — dashboard reads and report writes (server-side only)
   - `SUPABASE_ANON_KEY` — the publishable key (`sb_publishable_…`); the public
     feed reads through this, so RLS governs what it can see
   - `ADMIN_PASSWORD` — long random string; guards the dashboard
   - `ADMIN_SESSION_SECRET` — ≥32 random chars; signs the session cookie
3. Deploy. The public feed is at `/`, the approval dashboard at `/admin`.
4. Custom domain: add it under the project's Domains, then point the registrar's
   DNS at the A record and CNAME Vercel shows. The CNAME value must keep its
   trailing dot.

### After a registry change

`qassan-retrolink` (manual workflow) re-matches already-parsed documents against
the current registry and inserts the `event_areas` that were missed when it was
smaller. It makes no Claude calls and is free to re-run.

## Parked sources

Reachable by hand but not from CI, left in a comment block in `collector.py`:

- **assarih.com** — blocks datacenter IPs; serves fine from a home connection.
  Its announcements are echoed by other sources. Revisit with a proxy.
- **mosaiquefm.net** — returns only a `<title>`; body is JS-rendered, so the
  link regex finds nothing. Needs a renderer or proxy, not a keyword change.

## Cost expectations

5–15 new documents/day × one Claude call each ≈ cents/day. If a source floods
(collector storing >50 docs/run), suspect the keyword filter and tighten it.
