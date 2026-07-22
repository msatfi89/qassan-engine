# Qassan Engine — Deployment Guide

**To Claude Code:** you are deploying the data engine of Qassan, a Tunisian
power/water outage tracker. Med (the founder) is non-technical; execute these
steps with him, verify each one, and adapt calmly if a URL or UI has changed.
The design contract you must preserve: raw source text is stored verbatim,
nothing is published without approval_status flipping to approved/auto_approved,
and the parser must never invent or omit localities.

## Prerequisites (Med has these)
- Supabase project "qassan" with `qassan-schema.sql` already run
- This repository's files
- An Anthropic API key (console.anthropic.com)

## Steps

1. **Seed the registry**: run `seed-places.sql` in the Supabase SQL editor.
   Verify: `select count(*) from places;` → should be ~110.

2. **Create a GitHub repository** (private), push this folder.

3. **Repository → Settings → Secrets and variables → Actions**, add:
   - `SUPABASE_URL` — from Supabase: Settings → API → Project URL
   - `SUPABASE_SERVICE_KEY` — Settings → API → service_role key (SECRET — never
     put this in frontend code; it bypasses RLS by design, backend only)
   - `ANTHROPIC_API_KEY`

4. **Verify source URLs**: open each URL in `collector/collector.py` SOURCES.
   You have network access; I (chat Claude) could not verify the STEG and
   SONEDE listing paths. If one 404s, find the actual news/communiqués page
   on that domain and update the line. Add any additional Tunisian news site
   that republishes STEG/SONEDE بلاغات as a new SOURCES line.

5. **First run**: Actions tab → qassan-engine → "Run workflow". Then check:
   - `select source_name, count(*) from raw_documents group by 1;`
   - `select id, utility, event_kind, starts_at, extraction_confidence,
      approval_status from events order by id desc limit 20;`
   - `select * from pipeline_runs order by id desc limit 10;`

6. **Judge parser quality with Med**: for each created event, compare against
   the raw_documents.raw_text it came from. Success bar (from the spec):
   zero invented localities, zero missed localities on real announcements.
   Log misses; adjust SYSTEM_PROMPT in parser.py only with Med's approval.

7. **Leave the cron running.** Every 30 minutes it collects and parses.
   Events accumulate as 'pending' — the approval dashboard (next build phase)
   is where Med bulk-approves them.

## Parked sources (reachable by hand, not from CI)
- **assarih.com** — blocks datacenter IPs. Every scheduled run logs
  `listing unreachable: assarih`, yet it serves fine from a home connection
  and carried 4 genuine outage notices when tested locally. Revisit with a
  proxy later; its announcements are echoed by other sources.
- **mosaiquefm.net** — returns only a `<title>`; the body is JS-rendered or
  behind a bot wall, so the collector's link regex finds nothing. Same
  remedy: a renderer or proxy, not a keyword change.

## Cost expectations
5–15 new documents/day × one Claude call each ≈ cents/day. If a source floods
(collector storing >50 docs/run), suspect the keyword filter and tighten it.

## What is deliberately NOT here yet
- Approval dashboard (next phase, with the frontend)
- Facebook auto-poster (after approval flow exists — nothing posts unapproved)
- Report endpoints, notifications, weather backfill, shadow predictions

Build order matters: data flowing correctly first, everything else on top.
