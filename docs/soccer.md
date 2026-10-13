# Soccer: the FIFA World Cup

Soccer is the sixth sport on spxn.com (after hockey, basketball, baseball, American and Canadian football). John approved it on
2026-10-13. The first competition is the FIFA World Cup: men's 1930-2022 and women's 1991-2019, with the 2026 men's tournament from
openfootball. The women's 2023 tournament is not in any allowed source we hold (see "Not done").
Major League Soccer (1996 to now), the first club competition, reuses these tables: see [docs/mls.md](mls.md).

## Data model (migration 066, `core.soccer_*`)

A World Cup is not a season of a franchise league, so it does **not** go into `core.season`, `core.game` or `core.team_season`. Doing so would
put national teams into every team list, standings view, venue list and player index of the five leagues. It has its own tables, joined to the
shared ones where the shape fits:

| Table | One row per | Notes |
|---|---|---|
| `core.soccer_team` | national team (country or former state) | men's and women's share the row; `flag_code` is an ISO 3166-1/-2 code Hata draws (`GB-ENG`); `continues_team_id` links Germany to West Germany, Russia to the Soviet Union, and so on |
| `core.soccer_tournament` | World Cup | `tournament_id` `wc1930`, `wwc1991`; `league_code` is `wc` or `wwc` (`ref.league`, sport `soccer`) |
| `core.soccer_tournament_team` | team in a tournament | furthest stage, final position 1-4, host flag |
| `core.soccer_group_standing` | team in a group table | |
| `core.soccer_match` | match | score at the end of play (extra time included), the 90-minute score when known, shootout, winner, stage, group; the stadium as the source names it (`venue_name`, `venue_city`, `venue_country`, `venue_wikidata_id`) |
| `core.soccer_appearance`, `_goal`, `_booking`, `_substitution`, `_penalty_kick` | lineup entry, goal, card, substitution, shootout kick | |
| `core.soccer_squad`, `_manager`, `_match_manager`, `_match_referee`, `_award` | squad member, manager, match manager, match referee, award winner | |
| `core.person` (existing) | player, manager (`kind` coach), referee (`kind` official) | a source id in `core.external_id` (source `jfjelstul_worldcup`, key `P-…`, `M-…`, `R-…`) and, when the Wikipedia link gives one, the Wikidata item (source `wikidata`) |

People are matched to a person the archive already has only with a confirming fact (the same Wikidata item, or the same birth date **and**
the same folded name); never on the name alone. On DS1 on 2026-10-13 that matched 0 of 11,369; all became new `core.person` rows.

**Venues.** The build writes no venue row and never touches `core.venue`, `core.game`, `core.team_season`, `franchise_brand` or `brand_venue_*`.
`core.soccer_match.venue_id` is empty and is for the world stadium dataset to fill by `venue_wikidata_id` later (only where it is null).
The site shows the stadium name as plain text until a venue page exists to link to.

**Second check.** openfootball's own result for each men's match 1930-2022 is compared with jfjelstul's (date, score after extra time,
shootout): `meta.verification` (`entity_kind = 'soccer_match'`) holds confirmed / disputed / not_found, and a disagreement would be a
`meta.data_issue` row (the jfjelstul value is kept). Result: 964 of 964 confirmed, none disputed. The 2026 tournament has no second source.

**2026.** From openfootball (CC0) only: results, extra time, shootouts, venues (with Wikidata ids from its own list) and scorers by name
(`core.soccer_goal.person_id` is null; the file has no player ids). No lineups, squads, cards or managers. Its group tables are computed from
the results by points, goal difference and goals scored (not FIFA's full tie-break rules); "advanced" means the team played a knockout match.

## Sources and credits

- **jfjelstul/worldcup**: Joshua C. Fjelstul, Ph.D., "The Fjelstul World Cup Database", © 2023 Joshua C. Fjelstul, Ph.D.,
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode), https://github.com/jfjelstul/worldcup (commit 35a8667, 2026-06-11).
  The data here is modified: restructured into the archive's tables, people matched to existing records only with a confirming fact,
  and the 90-minute score worked out from the goals. Anything built from it carries the same licence. Every World Cup page carries the credit line
  (`web/src/components/SoccerCredit.tsx`).
- **openfootball/worldcup**: CC0, https://github.com/openfootball/worldcup (commit 19155966, 2026-08-22).
- **Wikidata** item ids (CC0), read through the English Wikipedia page properties of the pages the CSVs link to.
- Never FIFA.com, FBref / Sports Reference, Transfermarkt, ESPN, or the FIFA game ratings. No FIFA or World Cup emblems or logos. No
  sensitive personal data: the men's / women's split is only the competition itself.

## Pages (web/)

`/soccer` (sport page), `/worldcup` (every tournament: host, champion, runner-up, final, top scorer), `/worldcup/<year>` (groups, knockout rounds,
teams, matches, top scorers, awards, stadiums, squads), `/worldcup/<year>/match/<id>-<slug>` (goals, shootout, cards, lineups with substitutions,
referee), `/worldcup/teams`, `/worldcup/team/<slug>` (record, every tournament, every match), `/worldcup/player/<slug>-<id>` (a person's tournaments).
`/players/<id>` of a person with no league of the five goes to their World Cup page. All are kept pages (`app/[locale]/s`, with `q/` twins under
`/worldcup`); the Soccer link is in the header, the footer and on the home page. Flags are Hata's, drawn once in `/soccer-flags.svg` (some
drawings with a coat of arms are over 100 KB). Stadium names are plain text until the world stadium dataset has a page to link to
(`/venue/Q<venue_wikidata_id>`, see the comment in `worldcup/[year]/match/[match]/page.tsx`). With no soccer data in production the pages say
so and nothing breaks.

## Size

On DS1 (2026-10-13): `core.soccer_*` 17.5 MB; 11,369 new people and 22,442 external ids about 9 MB with indexes; 964 verification rows
about 1 MB. After `api.refresh()` the players index gains the 11,369 people (about 6 MB with its indexes). Estimated on production: about
35 MB of the 500 MB plan.

The five-league lists must not show those people: they have no league tag, so `leagues` is null in the index. Every player-list query
(`playerQuery` and `PLAYER_LISTED` in `web/src/lib/listQuery.ts`: `/players`, `/api/players`, `/suggest`, the year span, counts and
paging) filters on `leagues <> '{}'`; `pnpm test:playerlist` keeps it so. A future `api.player_index` rebuild (built `_new`, then
swapped) should give soccer people their own league tag (`wc`, `wwc`) and the lists then choose it by league, not by this filter.

Row counts on DS1: 31 tournaments (30 from jfjelstul + 2026), 93 teams, 1,352 matches (1,248 + 104), 3,945 goals (3,637 + 308),
27,432 lineup entries, 13,843 squad entries, 3,178 cards, 10,222 substitution rows, 396 shootout kicks, 11,369 people.

## Commands

Raw files live outside the repo in `~/Projects/backups/spx-stats/raw/worldcup/<day>/` (see `scripts/worldcup/README.md`):

    python3 -I scripts/worldcup/fetch.py                    # jfjelstul CSVs, openfootball files, Wikidata items
    python3 -I scripts/archive_raw.py worldcup <raw dir> <day> --sql-out archive.sql      # DS1 raw_archive, then the Dropbox copy
    python3 -I scripts/worldcup/load.py <raw dir> --sql-out load.sql                       # legacy_worldcup (DS1 only)
    bash scripts/mac/ds1-apply.sh db/migrations/065_legacy_worldcup.sql && bash scripts/mac/ds1-apply.sh db/migrations/066_soccer.sql
    bash scripts/mac/ds1-apply.sh db/build/200_worldcup.sql
    bash scripts/mac/ds1-apply.sh db/checks/070_soccer.sql --dry-run     # must print no problem rows

Production only through a data release (AGENTS.md section 8, item 5), after migration 066 is on production (item 4; add-only, and it widens the
`meta.verification.entity_kind` check by `soccer_match`). Tables: `meta.source,ref.sport,ref.league,ref.league_name,core.person,core.external_id,`
`core.soccer_team,core.soccer_tournament,core.soccer_tournament_team,core.soccer_group_standing,core.soccer_match,core.soccer_appearance,`
`core.soccer_goal,core.soccer_booking,core.soccer_substitution,core.soccer_penalty_kick,core.soccer_match_manager,core.soccer_match_referee,`
`core.soccer_squad,core.soccer_manager,core.soccer_award,meta.verification,meta.data_issue`.

## Not done

- Women's 2023: neither allowed source has it. A Wikipedia (CC BY-SA 4.0) load would be a separate ticket.
- Lineups, cards and managers for 2026.
- A country page for a nation across men's and women's merged with its predecessor (`continues_team_id` is stored, not yet used to merge records).
- Linking stadium names to venue pages: waits for the world stadium dataset (join by `venue_wikidata_id`).
