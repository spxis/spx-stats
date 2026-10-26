# European club leagues from openfootball (CC0)

Design and model: [docs/soccer-europe.md](../../docs/soccer-europe.md). Source: the `england`, `deutschland`, `espana`, `italy` and `europe` (France only)
repositories of the openfootball organisation, licence CC0 1.0 (each repository's `LICENSE.md`, kept in the raw folder with the commit id in `MANIFEST.json`).
What is read: England 1992-93 on (Premier League; the lower four divisions from 1998-99; the National League 2015-16 on), Germany 2010-11 on (three
divisions), Spain 2012-13 on and Italy 2013-14 on (two each), France 2014-15 on (two). Scotland and the Netherlands files exist for a few seasons only and are not read.

Run, in this order (everything is rerunnable; the coordinating session runs the DS1 steps):

    day=2026-10-25; raw=~/Projects/backups/spx-stats/raw/openfootball/$day
    python3 -I scripts/openfootball_eu/fetch.py $raw --tarballs ~/Projects/backups/spx-stats/raw/openfootball-tarballs/$day   # 5 tarball downloads, 2 s apart
    python3 -I scripts/openfootball_eu/test_openfootball.py $raw                       # every file's matches against its own header
    python3 -I scripts/archive_raw.py openfootball $raw $day --sql-out archive.sql    # then ds1-apply.sh, then spx-raw-export.sh
    python3 -I scripts/openfootball_eu/load.py $raw --sql-out load.sql                # makes legacy_openfootball (DS1 only)
    bash scripts/mac/ds1-apply.sh db/build/227_soccer_europe_openfootball.sql --dry-run

`db/seed/soccer_club_eu.csv` says which club each spelling is (system, alias, club, source openfootball / spx / wikipedia) and `db/seed/soccer_league_eu.csv` the
divisions, their names by period and the `matches` flag. **Only divisions with `matches` = 1 get their matches built** (the five top divisions: about 33,000 rows,
about 18 MB on production); the others get their seasons and clubs (so promotion and relegation show) and keep their results in `legacy_openfootball`
(about 108,000 matches in all, about 58 MB if all were built). Flip the flag to 1 and rerun 227 to build a division.
A name with no row in the club seed stops step 227 and lists the names.
