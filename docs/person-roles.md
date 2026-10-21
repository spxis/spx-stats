# People with several careers: assistants, front office, coaching playoffs (phase 2)

Phase 1 (live, 0.149) shows a person's Player and Coach chips, the playing and coaching career sections, head-coach stints from
`api.team_season_staff` and coaching awards. Phase 2 adds what that page lacks: executive roles, assistant coaches and a head
coach's playoff record. This page is the proposal, the sources checked, and what the first loadable part does.

## What is built now

| Part | Source | New objects | Status |
|---|---|---|---|
| General managers and presidents, NHL / NBA / CFL | the infoboxes of the club-season articles already fetched on 2026-10-12 (English Wikipedia, CC BY-SA 4.0); no new request | `legacy_staff.wikipedia_office` (migration 147, DS1 only), `db/build/188_staff_office.sql`, role `president` (migration 148) | built, tested on a scratch Postgres |
| A head coach's playoff record | derived from `core.game`, `core.series` and the `head_coach` stints; no outside source | `core.coach_playoff_record` (148), `db/build/189_coach_playoff_record.sql` | built, tested on a scratch Postgres |
| The person page | `api.person_staff`, `api.coach_playoff_record` (148) | a "Front office and staff" section and a Front office chip; Playoffs and Series columns in the coaching table | built; every part is hidden while its view is empty or missing |

Counts the loader reads from the saved pages: 3,522 general-manager names (NHL 1,713 club seasons, NBA 1,269, CFL 383) and 350
president names (NBA 286, CFL 60, NHL 1). The infobox seldom names assistants (4 pages in 4,069), so assistants are not in this part.

## Sources checked

| Source | What it gives for our five leagues | Use |
|---|---|---|
| English Wikipedia club-season infobox, `general manager` / `GM` and `president` fields (CC BY-SA 4.0) | GM on about 3,460 NHL, NBA and CFL club seasons, president on about 350; undated, one season at a time | **Used now** (build 188) |
| Wikidata P286 head coach (CC0), on the club, with start and end | NHL 105 statements, NBA 94, MLB 184, NFL 215 (dated: nearly all) | cross-check of head coaches and the way to put dates on them; not needed for new rows |
| Wikidata P505 general manager (CC0), on the club | NHL 45, NBA 2, MLB 16, NFL 28 | too thin to be the source; use to confirm and to add MLB and NFL GMs |
| Wikidata P6087 coach of sports team (CC0), on the person, with start and end | NHL 40, NBA 153, MLB 182, NFL 109 (74 NBA people, 71 MLB) | the only structured assistant-coach source; thin, and it includes head coaches |
| Wikipedia coaching-staff tables ("Staff" section and staff templates of NFL and MLB club-season articles) | assistants and coordinators for part of the NFL and MLB, undated within the season | candidate for assistants; needs a parser and a look at how regular the pages are |
| Retrosheet, nflverse, Lahman | head coaches only (already used by build 184) | none for assistants |
| NHL, NBA, MLB statsapi, Sports Reference, ESPN | | not used: red or banned sources (AGENTS.md section 3) |

Counts for Wikidata are from live SPARQL on 2026-10-21 over the clubs of each league (P118) and the clubs they replaced.

## Table design

No new stint table. `core.roster_stint` already is the place: it has `person_id`, `team_season_id`, `role`, `position`, `valid_during`,
`source_id`, and the build steps and `ingest.row_id_map` (migrations 136, 146) already know its key (source, person, team season, role, nth).
Every query that means players filters `role = 'player'`, so new roles cannot leak into rosters (checked in migrations 026 to 127).

- `role = 'general_manager'` (already allowed), `'president'` (added in 148), `'coach'` for an assistant with the job title in `position`
  ("Offensive coordinator", "Pitching coach"). `head_coach` stays as it is, and `api.team_season_staff` is not changed.
- `core.person.kind = 'executive'` (already allowed) for someone created only because he is named as GM or president.
- `api.person_staff` shows these three roles per person and season; `api.coach_playoff_record` is the playoff record.
- Dates: `valid_during` stays empty for an infobox row (the article names a season, not days). Wikidata rows carry dates.

## How a person is matched

Never on a name alone.

1. The wikilink title in the infobox against `core.external_id` (source `wikipedia`): the people that builds 177, 179 and 184 already made.
2. Else the Wikidata item of that article (`legacy_people.item.enwiki_title`) against `core.external_id` (source `wikidata`).
3. Else a new person (kind `executive`) keyed `name:<name>@<franchise id>`: an unlinked name is one person within one franchise and never
   across clubs. Two clubs with the same unlinked name give two people; `185_person_merge.sql` can join them later on a confirming fact.
4. Wikidata statements (follow-up) are matched through the Wikidata id only.

## Playoff record as coach (derived, no outside data)

For each final playoff game of a club season the head coach is: the one whose dated stint holds the game date; else the club's only head
coach that season (`basis = sole`); else, when every head-coach stint of the season is dated (MLB, NFL), the one whose stint ends last
(`basis = dated`). A season with several undated head coaches (NHL, NBA, CFL mid-season changes: 17% of NHL club seasons) gets no row, because
the archive cannot say who coached the playoffs. A series is counted for the coach of the club's last game in it. The site sums the
rows over a stint, so the record column is blank for a stint with no attributable season. Playoff games the archive lacks are not
counted (the note on the page says so). It is wholly rebuilt by one step, so a rerun cannot drift.

## Load order (coordinating session)

1. Migration 147 (legacy, DS1 only), then 148 on DS1 and on production (add-only; the role check is widened, every row passes).
2. `python3 -I scripts/staff/load_office.py --out <file>`, then `bash scripts/mac/ds1-apply.sh <file> --force`.
3. `188_staff_office.sql`, then `189_coach_playoff_record.sql` through `ds1-apply.sh`; then `221_row_id_map.sql` so the new stints are remembered.
4. Release `core.person, core.external_id, core.roster_stint, core.coach_playoff_record, meta.source` (the tables the steps touch).
5. Deploy the site after 148 is on production (`api.person_staff` must exist; without it the page simply hides the sections).

## Remaining

- **Assistant coaches.** Needs a source decision (John): Wikipedia staff tables for the NFL and MLB (more rows, parser work, undated),
  Wikidata P6087 (clean, dated, about 500 statements), or both. Recommendation: Wikidata P6087 first (small, CC0, dated, matched by
  Wikidata id), then NFL staff tables if the pages prove regular.
- **MLB and NFL general managers.** NHL, NBA and CFL come from infoboxes already saved. MLB club-season articles have not been fetched
  (about 2,600 titles, 25 a request, 2 s apart); NFL after 1998 has no saved article. Wikidata P505 adds about 40 clubs.
- **Head coaches with dates for NHL, NBA, CFL** from Wikidata P286 would let a mid-season change be split and give those seasons a playoff coach.
- **Showing the people elsewhere:** a club-season page could list its GM and president (`api.person_staff` by `team_season_id`).
- Assistants, GMs and presidents are not yet in `/players` (the list is players only) or in the sitemap.
