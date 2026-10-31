---
name: spx-source-tiers
description: Decide whether a data source may be used in spx-stats and under which tier (green, grey, red-confirm, red), and what may be stored from it. Use before fetching, adding or citing any external site or API, when a ticket names a source, or when a daily-job or confirm-only change is made. Covers the red sources and the banned ones.
---

# spx-source-tiers: may we use this source, and what may we keep?

Rules: [AGENTS.md §3](../../../AGENTS.md#3-what-the-project-is) (source tiers, confirm-only, provenance, never collect),
[item 1 of docs/data-work.md](../../../docs/data-work.md) (archive first). The registry is `scripts/daily/sources.py`; read it with
`python3 -I scripts/daily/sources.py --json`. The limiter is `scripts/daily/limiter.py`, the wait client `scripts/daily/wikiapi.py`.

## Step 1: find the tier

| Tier | Meaning | May store? | Who sets it |
|---|---|---|---|
| green | terms allow storing and reuse, with the clause and a checked date | yes, with the credit | John, recorded with `terms.checked_by`, `checked_on`, `clause` |
| grey | no terms found; backup or cross-check only | only what the daily job or an admin asks for, within `daily_cap` | John |
| red-confirm | read to CONFIRM a result other sources gave; never stored | NO: only an outcome | John, 2026-10-19 |
| red | forbidden, or AGENTS.md bars it | never fetched, not even tested | the rules |

- Green today (examples): English Wikipedia (CC BY-SA 4.0, credit), Wikidata (CC0), nflverse (CC BY 4.0, credit line), Retrosheet
  (credit notice), Lahman, OpenStreetMap (ODbL, kept only in `legacy_osm` and `core.brand_venue_osm`), balldontlie (free tier, credit).
- **Red-confirm** (John, 2026-10-19): the NHL APIs (`api-web.nhle.com`, `api.nhle.com`, `statsapi.web.nhl.com`), `statsapi.mlb.com`,
  `stats.nba.com`, `stats.wnba.com` (John, 2026-10-28), the PWHL HockeyTech feed, the public scoreboards of Yahoo Sports and USA TODAY (NHL, NBA, MLB, NFL).
- **Banned, never**: ESPN (`espn.com`, `site.api.espn.com`) and Sports Reference (`hockey-`, `basketball-`, `baseball-`,
  `pro-football-reference`, `fbref`). Not even confirm-only.
- Not sure? Make it grey with notes, not green. Only John's yes makes it green (ask him: `NEED FROM YOU:` with the one choice).

## Step 2: what red-confirm may do

- Read only, through the shared limiter (`limiter.confirm`), only with purpose `confirm`, only when Wikipedia's result is single-source or
  disputed, and only with `DAILY_CONFIRM_RED=1` set in the job's environment (off by default; John's call).
- Keep ONE outcome per check: agrees, disagrees or unavailable, the source code, `checked_at`, our game id. Stored as
  `red-confirm.jsonl` in the job's cache; loading it to `meta.verification` is a later coordinating-session step.
- Never: no raw archive, no Dropbox copy, no `legacy_*` load, no `core` row, no value (score, name, time) copied anywhere.
- Data already loaded from a red source (`legacy_nhlapi` and what it built, such as game venue names) stays, credited "NHL". Never delete it.
  The fetch scripts that store data (`scripts/nhlapi/fetch.py`, `scripts/players/nhl_fetch.py`, `scripts/team_stats/fetch.py --source nhl`) refuse to run.

## Step 3: how to fetch an allowed source

- One request at a time, with the source's `spacing` between requests; identified User-Agent with contact details; backoff on 429 and 5xx.
- Every fetcher calls `guard_url(url)` right before a request; `require(id)` refuses red and unknown sources. A new host without a registry
  row is refused by design: add the row first.
- Grey sources: daily job or an admin's manual request only, `daily_cap` a day, never a default.
- Failures stay in the run log: one odd club or game must not stop the job (`fix(daily): isolate each league, club and game`).

## Step 4: provenance and credit

- Provenance goes in `source_id`, `source_key` and `external_id`, never in free-text notes. Wikipedia `source_key` is
  `enwiki:<title>@<revision id>`.
- Disagreement with a second source: `meta.data_issue` as "differs", without the other source's numbers (AGENTS.md §3).
- Keep each credit line where the data shows (`Credits use={[...]}`); `/sources` and `/terms` list them.
- Never collect member data (accounts, wagers, forums, surveys) or sensitive personal data. Holes are fine: log them, do not guess.

## Pitfalls

- The score endpoint shape used by the confirm check (`games[].homeTeam.name.default`, `score`, `gameState`) was written from memory and
  needed one watched run: say so in the hand-off until it has run.
- A Wikipedia template may link to nhl.com or another banned site for a recap: the parser drops those addresses; keep them out of the load.
- A source can change terms: a green row needs a new `checked_on` when its terms are read again.
