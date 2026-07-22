# QASSAN — PHASE 2 BUILD ORDERS
For Claude Code, working with Med. Chat-Claude (keeper of the blueprint) wrote
these. Implementation decisions are yours; design-contract decisions are not —
if a step forces you to violate or reinterpret a contract line, stop and have
Med bring the question back to chat-Claude.

## Design contract (unchanged, binding)
- Nothing publishes without approval_status in ('approved','auto_approved').
- The AI never invents data; unmatched place names are preserved, never dropped.
- Every public event shows its source. Planned vs sudden never blurred.
- end_time_official=false renders as "بدون توقيت رجوع رسمي" — never as a firm end.
- Community stats always show n-counts; aggregate governorate-level when n is small.
- Anonymous by design: no accounts, no emails, no names. device_hash only.
- SUPABASE_SERVICE_KEY stays backend-only. Public app uses anon key + RLS.

## Build order

### Task 1 — Complete the place registry (do this first, ~1 session)
Import ALL ~264 Tunisian delegations (24 governorates) into `places`.
Source: official INS / municipal delegation lists (verify online; prefer a
source with Arabic + French names). Keep existing rows (dedupe by name_ar +
parent), merge aliases. Then retro-link: re-scan raw_documents.parsed_json
for previously unmatched locality names, match against the grown registry,
insert missing event_areas. Verify with: count of unmatched names per new
announcement should drop to ~0-1.

### Task 2 — Approval dashboard (private, Med-only)
A single protected page (simple password via env var is acceptable for beta;
never the service key in the browser — build a tiny API layer or use Supabase
auth for one admin user).
- Queue view: pending events, newest first, grouped by confidence:
  ≥0.85 → "bulk approve" section with one-tap Approve All + per-row toggle;
  <0.85 → individual review cards.
- Each card: parsed fields vs. ORIGINAL raw_text side by side (raw text is
  the truth; make it visible, scrollable, RTL-aware), source link,
  unmatched names highlighted with "add to registry as new place / map to
  existing / ignore" actions (adding grows places.aliases).
- Actions: approve / reject / edit-then-approve (edits limited to times,
  utility, kind, and area links — never free-text invention).
- Status flip sets approved_at. Rejected events keep their raw_document.

### Task 3 — Public app (the face)
Next.js PWA, deployed on Vercel, reading APPROVED events only (RLS: anon role
sees events where approval_status in ('approved','auto_approved') and
nothing else; reports table INSERT-only for anon with rate limiting).
Design reference: `design-reference-app.jsx` in this folder — Med approved
this design. Reproduce its look and behavior faithfully: dark night-blue
theme, amber=electricity / aqua=water, Arabic-first RTL with FR toggle,
governorate→delegation picker, green/amber precision badge (named_explicitly),
day-strip timeline, risk banner, "علاش يقصّو الضو؟" card, feed cards with
source + planned/sudden + endsUnknown badge, the two report buttons
("الضو مقصوص توّا" / "رجع الضو") writing to reports with utility+kind,
sources footer. Beta label visible.
- "My area" persistence: localStorage on the user's device (public web app —
  allowed there; this is not an artifact).
- Report rate limiting: 1 report per kind per area per device per 30 min
  (enforce server-side by device_hash, not just UI).
- Live "neighbors" count on each area: reports in last 90 minutes.
- Web push can come in a later step if time is short — the feed and reports
  are the launch blockers, push is fast-follow.

### Task 4 — Operational touches
- Restore collector cron toward */30 during 05:00–23:00 Tunisia time once
  the dashboard exists (pre-launch requirement from chat-Claude).
- Add a daily "pipeline health" query/page in the dashboard: last run per
  component, failed docs count.

## What phase 2 does NOT include (deliberately)
Facebook auto-poster (needs approval flow live first), predictions/shadow
mode, weather backfill, Android TWA wrapper, ads. Do not build ahead.

## Definition of done
Med approves real pending events on his phone; an approved event appears in
the public app within a minute; a report from his phone shows in the DB with
correct place and rate limiting; unmatched names ~0 on new announcements.
Then write DEPLOY-LOG-PHASE2.md and Med pastes it to chat-Claude.
