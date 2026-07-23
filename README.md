# قصّان — 9assan

Tunisia's power & water outage tracker. Live at [9assan.com](https://9assan.com/)

**الضو والماء في تونس — لحظة بلحظة**

9assan tells Tunisians when their area is officially at risk of an electricity
or water cut, shows what neighbors are experiencing in real time, and — over
time — learns which areas are most likely to be affected next.

**Status:** public beta, launched during the July 2026 heatwave.

## What it does

- **Reads every official announcement automatically.** A collector watches STEG
  and SONEDE communiqués and the Tunisian press around the clock; an AI parsing
  layer turns each free-text Arabic/French بلاغ into structured data: areas,
  time windows, planned vs. sudden, cause, source.
- **Speaks human.** Pick your governorate and delegation — or let your browser
  locate you (computed entirely on your device; coordinates are never
  transmitted) — and see your area's status: upcoming cut, live cut, or all
  clear. Arabic-first, full French toggle.
- **Lets neighbors complete the picture.** Two anonymous one-tap reports —
  "مقصوص توّا" and "رجع" — for electricity or water, cover what officials never
  announce and measure how long cuts really last.
- **Refuses to pretend.** When a communiqué gives no return time, the app says
  so ("بدون توقيت رجوع رسمي") instead of inventing one. When an announced window
  ends but return-without-notice applies, the app asks instead of asserting.
  Community signal is never dressed up as official.

## Principles

1. **Every event shows its source.** Official announcements, community reports,
   and social-media observations are visibly distinct — always.
2. **No personal data.** No accounts, no names, no emails, no stored locations.
   Reports carry only an unlinkable hashed device value used for rate limiting.
3. **Nothing publishes unreviewed.** Every AI-extracted event passes validation
   and human approval before it appears. The approval gate is enforced by the
   database (RLS), not by code convention.
4. **Numbers are real or absent.** Report counts are firsthand taps. Statistics
   ship with their sample sizes. Predictions (in development) run in shadow mode
   and go public only when they demonstrably beat naive baselines — with
   accuracy published.

## Architecture

```
Tunisian press + STEG/SONEDE ─→ collector (Python, cron)
                                    │ verbatim, deduped
                                    ▼
                              raw_documents
                                    │ Claude extraction + deterministic validation
                                    ▼
                    events + event_areas ──→ 286-delegation registry
                                    │ human approval (dashboard)
                                    ▼
                        public app (Next.js PWA, RLS)
                        map · live status · reports
```

- **Engine:** Python collectors on GitHub Actions; Claude API for Arabic/French
  extraction; Supabase (Postgres + RLS)
- **App:** Next.js on Vercel; Arabic-first RTL with French toggle; choropleth map
  from open governorate and delegation boundaries
- **Registry:** all 24 governorates and 286 delegations with spelling variants,
  grown automatically as new names appear in announcements

## Why open source

An app that asks for public trust should be inspectable. The code is open; the
value lives in the accumulated outage history, the place-name registry, and the
community — none of which can be forked.

Licensed under **AGPL-3.0** (see [LICENSE](LICENSE)): anyone may run, study, and
modify it, but anyone who deploys a modified copy as a network service must
publish their changes.

Deployment details: see [DEPLOY.md](DEPLOY.md).

## Contact

Found a wrong area, a missed announcement, or want to contribute a source? Open
an issue, or reach us via the قصّان Facebook page.

بيانات من بلاغات الستاغ والصوناد والصحافة التونسية. نسخة تجريبية — لا نجمع أي
بيانات شخصية.
