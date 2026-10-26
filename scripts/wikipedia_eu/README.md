# European top divisions from English Wikipedia (CC BY-SA 4.0)

Season articles of the Premier League (1992-93 on), La Liga and Serie A (1929-30 on), the Bundesliga (1963-64 on) and Ligue 1 (1932-33 on), through the MediaWiki
API (rendered text, one request at a time, 1.3 s apart, identified User-Agent, backs off on 429/503), and the Wikidata item (CC0) of each club article.
The years of the world wars have no season article (La Liga 1936-39, Serie A 1943-46, Ligue 1 1939-45): `missing.txt` in the raw folder lists them.
Never FBref / Sports Reference, ESPN or a league's own site.

    day=2026-10-25; raw=~/Projects/backups/spx-stats/raw/wikipedia_europe/$day
    python3 -I scripts/wikipedia_eu/fetch.py $raw                     # about 45 minutes; --stage seasons|pageprops, --league, --from, --to
    python3 -I scripts/archive_raw.py wikipedia-europe $raw $day --sql-out archive.sql
    python3 -I scripts/wikipedia_eu/load.py $raw --sql-out load.sql   # makes legacy_wikipedia_europe (DS1 only); prints seasons with no table
    bash scripts/mac/ds1-apply.sh db/build/228_soccer_europe_wikipedia.sql --dry-run     # after 227

`standings.py` reads the final league table (Pos, Team, Pld, W, D, L, GF, GA, GD or GR, Pts, qualification text, the bracket marks C / R / P / O ...). 378 articles all
gave one table (checked: wins + draws + losses = played in every row). The table is stored as Wikipedia has it; where a season's matches are also held, a difference
is a `meta.data_issue`. A club article title with no row in `db/seed/soccer_club_eu.csv` (source wikipedia) stops step 228 and lists the titles.
Not yet read: the second and lower divisions' articles (so promotion and relegation before the openfootball years show only for clubs that came back), the results
cross-tables, scorers and awards. Wikipedia treats a club that went bankrupt and was refounded under a new company as one article (Parma, Palermo, Bari, Reggina);
the seed does the same.
