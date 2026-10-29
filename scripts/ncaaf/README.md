# College football (NCAA Division I-A / FBS), 2000 on

English Wikipedia (CC BY-SA 4.0) only. CollegeFootballData (`legacy_cfbd`, DS1) is a cross-check, never a source of values; ESPN and Sports Reference are not used.
A season is the year it starts in (2005 = the 2005 season, which ended in January 2006). League code `ncaaf`, its own seasons, never counted in the NFL's.

    fetch.py      the season article, its conference standings templates and every team-season article (10 titles a request, 2.5 s apart)
    parse.py      standings templates, team infoboxes, {{CFB schedule entry}} rows and the compact {{CFB schedule}} layout; pairs the two teams' logs of a game
    season.py     parse a year from the cache -> archive-<year>.sql + load-<year>.sql (nothing is written to a database)
    crosscheck.py counts and agreement against a local CFBD extract (a CSV outside the repository); copies no value
    test_parse.py offline tests

Order (the coordinating session applies each file with `bash scripts/mac/ds1-apply.sh`):

    1. python3 -I scripts/ncaaf/fetch.py --range 2000 2025 all          raw folder ~/Projects/backups/spx-stats/raw/wikipedia_ncaaf/<day>/ (about 45 minutes)
    2. python3 -I scripts/ncaaf/season.py --out <dir> --range 2000 2025  writes the 52 files
    3. db/migrations/159_legacy_wikipedia_ncaaf.sql                      schema legacy_wikipedia_ncaaf (DS1 only)
    4. archive-<year>.sql for each year (raw wikitext into legacy_files.raw_archive as wikipedia-ncaaf/<year>/<kind>/<file>), then load-<year>.sql
    5. db/build/230_ncaaf_from_wikipedia.sql                             core rows (run from the repo root: it reads db/seed/ncaaf_*.csv)
    6. after-load steps for the league (not 165, which skips the league, and not 178, which leaves it alone: 230 writes the champion and the alignment), 172, 183, 190, 191, 192, 209, refresh api.season_summary
    7. db/build/231_ncaaf_cfbd_check.sql                                 optional: score agreement with legacy_cfbd.game, as meta.verification and meta.data_issue

Rules the data follows: a team outside the division (FCS and lower) that a division team played is a franchise with a team season in the pseudo conference
"Non-FBS opponents", a member of the league (core.franchise_league) only in the seasons it was in the division; the overall record in the standings counts the
bowl games and the conference championship game; a neutral-site game lists its teams in name order; the national champion is the winner of the national
championship game. A renamed program is one franchise: db/seed/ncaaf_program.csv (final before the first run on DS1: a changed key makes a new franchise).

The Playoff and the postseason: a bowl, a College Football Playoff game and the national championship game are phase playoffs, a conference championship game is regular season.
A Playoff game carries its round in the label ("Sugar Bowl (CFP Quarterfinal)", "Rose Bowl (CFP Semifinal)", "College Football Playoff (CFP First Round)"; the final is "College Football Playoff National Championship"); every season from 2014 has its tags (`test_parse.py`).
A game both teams' articles tell with dates apart (a typo of the day, month or year) is one game when each side has just one such game and the score is the same score; the home side's date is kept, a date outside the season loses to one inside it.
A published record that differs from the games is left out and logged by 230 (the NCAA's vacated wins: UNC 2008-09, Ohio State 2010, Louisiana-Lafayette 2011-14, Notre Dame 2012, Arizona State 2021, Michigan State 2022-24, FIU 2005; and UTEP 2003, whose article lists a loss to Cal Poly the published 2-10 does not count).
