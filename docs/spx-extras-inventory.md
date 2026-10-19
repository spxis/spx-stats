# SPX extras: what is in John's SportsInteractive folder

Inventory of three folders of John's Dropbox, `Projects/SportsInteractive/` (read-only; paths below are relative to it): `Data/`, `Miscellaneous/`
and `wwwroot extras/`. Made 2026-10-19 by walking every file name and size (6,935 files, about 1.18 GB), opening a few lines of each kind of file to
classify it, and listing the members of every `.zip` and `.rar` without extracting. Nothing was written, moved or deleted there and nothing from it is in
this repository: only loaders, parsers, reference seeds and docs go into git; the data itself belongs in DS1 (`legacy_files.raw_archive`) and Dropbox
(`/Backups/spx-stats/raw/spx-extras/`).

Verdicts: **import** (SPX's own data, not on DS1 yet) · **keep-only** (archive to DS1/Dropbox as raw bytes, build nothing) · **skip** (do not copy at all) ·
**John decides** (SPX's archive of another site's pages: the origin matters, AGENTS.md section 3).

## The finding that shapes everything

The SPX SQL Server backups are already on DS1 as `legacy_spx` (`tbl_games`, `tbl_game_scores`, `tbl_teams`, leagues, seasons, alternate names). These folders
are mostly the scrapers' **inputs** and **outputs** around that database: saved web pages, their parsed CSVs, run logs, and the download packages SPX sold.
So most of the games and teams here are duplicates of rows DS1 holds. What the folders add is (a) raw pages, (b) a few results the database never got,
(c) weekly player-statistics snapshots, because the per-player history tables were emptied before the 2009 backup (migration 006).
Also found on DS1 while checking, not in these folders: `legacy_spx` holds 7,015 European-football fixtures (sport 29, 2004-03 to 2006-07, 92 leagues defined)
of which only 1,435 have a final score, plus college football (1,843 games), college basketball (2,242), the CBL (145), arena football (207) and the NLL (12)
that no `core` build has used (step 100 builds the five leagues only).

## Summary

| Area | Files | Size | What it is | Verdict |
|---|---|---|---|---|
| `Data/efl/` | 4 | 3.3 MB | SPX's 2004 capture of 320 European clubs' results pages (ESPN Soccernet) | John decides, then import (+962 scores) |
| `Data/fifa/` | 9 | 1.0 MB | 2002 World Cup squads, copied from ESPN Soccernet and CNNSI pages | John decides; redundant with the World Cup data we hold |
| `Data/games/*/…soccernet…`, `…bbc…` | about 950 | 150 MB | daily football scoreboards 2005 to 2008-09 (ESPN Soccernet, BBC Sport) | John decides (ESPN never; BBC terms unchecked), keep-only meanwhile |
| `Data/games/` (other) | about 1,500 | 180 MB | daily scoreboards of USA Today, Canoe, TSN, odds pages, scrape logs, `archive.rar` per year | keep-only |
| `Data/mlb`, `nba`, `nfl`, `nhl` | 3,560 | 490 MB | saved stat/roster/injury/schedule pages (CBS, CNNSI, ESPN, Yahoo, USA Today, league sites) and their parsed CSVs | keep-only; John decides if any is ever to be loaded |
| `Data/pub/`, `wwwroot extras/` | 650 | 98 MB | SPX's download packages ("Gold/Free Players", schedules, scores) 2003 to 2008 | John decides (built from third-party pages); only copy of weekly player snapshots |
| `Data/cbb`, `cbl`, `cfb`, `cfl`, `pga` | 23 | 1.0 MB | NCAA basketball/football and CBL/CFL schedules, team insert scripts, a PGA page | keep-only (schedules also in `legacy_spx`) |
| `Data/gaming/` | 9 | 2.2 MB | the wagering game's score scrapes (five sites) | keep-only |
| `Data/Lahman Database/` | 32 | 82 MB | Lahman baseball database v5.3 (2007) | keep-only (we load a newer Lahman) |
| `Data/GeoIP/` | 9 | 101 MB | MaxMind GeoLite country and city tables (2007) | skip (MaxMind licence, no use) |
| `Data/pub/tblForumMessages-…`, `Miscellaneous/tblUIMessages-…` | 3 | 127 MB | forum and site messages | **skip: member data, not opened** |
| `Miscellaneous/` (accounts, addresses, e-mails, PayPal, hosting) | about 30 | 1.4 MB | member and business records, credentials | **skip: member data / credentials, not opened** |
| `Miscellaneous/` (reference) | about 25 | 2 MB | country lists, ISO codes, a 2002-06 NBA score export, SPX history text | keep-only |
| `Miscellaneous/DTS`, `scriptaculous`, `.vsd`/`.doc` | 130 | 11 MB | SQL Server packages, a JS library, design documents | keep-only |

Not in scope (not walked): the other folders next to these in `SportsInteractive/` (`Apps`, `Backup` with a 0.5 GB archive, `Images` with logos and headshots,
`SPX4`, `SQL Scripts`, `Scripts`, `Scripts SQL Deployment`, `Tasks`). Three of them are worth a separate ticket: `Images` (logos and headshots, licences unknown),
`Backup` and `SQL Scripts` (history of the schema).

## Soccer files

| File | Type | Rows | What it holds | Verdict |
|---|---|---|---|---|
| `Data/efl/2004-regular/data/efl-2004-schedules.csv` | CSV, cp1252 | 8,961 | results and fixtures of 243 club pages, 2004-03-17 to 2005-05-14: club page id, date (with kick-off), away, score, home, score, status. Each match is on two clubs' pages: 2,601 distinct matches, 1,086 distinct with a score (status Final, captured about 2004-11-22) | John decides (the pages were ESPN Soccernet's), then import: 962 of the 1,086 land on SPX fixtures that have no score on DS1 (none overlaps a score DS1 already has; the rest name clubs outside SPX's list) |
| `Data/efl/2004-regular/data/EFLGames.txt` | text | 1 | the fetch recipe: a list of 300 ESPN Soccernet club ids and the URL pattern | keep-only (it is the provenance record) |
| `Data/efl/2004-regular/data/efl-2004-schedules.html`, `archive/efl-2004-schedules-20041122.html` | HTML | 2 | the saved pages (2.6 MB and 0.3 MB) the CSV was parsed from | keep-only |
| `Data/fifa/espn_soccer.csv`, `.html`, `.txt` (empty), `links.txt` | CSV/HTML | 8 squads | 2002 World Cup squads (number, name, position, caps, goals, height, weight, age, club) from ESPN Soccernet; the CSV has broken accents | John decides; redundant (World Cup 2002 squads come from jfjelstul) |
| `Data/fifa/cnnsi_soccer.csv`, `.txt`, `.html` | CSV/HTML | 8 squads | the same squads from CNNSI | John decides; redundant |
| `Data/fifa/squad_argentina.txt` | HTML | 1 | one ESPN squad page | keep-only |
| `Data/fifa/cnnsi_hockey.txt` | tab text | about 700 | NHL club rosters from CNNSI, filed here by mistake | keep-only (NHL rosters come from other sources) |
| `Data/nhl/2012-regular/teams-fifa.csv` | CSV | 1,256 | SPX's own `tblTeams` export for the European-football clubs (ids, league, division, conference, names, logo paths) | keep-only: the same rows are in `legacy_spx.tbl_teams` and `xref_sport_team_leagues` |
| `Data/games/*/batch/games-scores-soccernet.html`, `games-scores-bbc.html`, the `archive/html/` dailies, `*/archive.rar` | HTML | 473 days of each, 2007-06 to 2008-09; 136 days of 2005; the 2006 `.rar` | the daily football scoreboards SPX scraped: all matches of the day worldwide, 2005 to 2008-09 | John decides: ESPN Soccernet is never a source; BBC Sport's terms are unchecked. Keep as raw bytes meanwhile; this is where 2006-07 to 2008 European scores (a gap in `legacy_spx`, which stops 2006-07) would come from |
| `Data/gaming/batch/GamingScores-soccernet.html`, `-bbc.html` | HTML | 2 | the same pages for the wagering game | keep-only |

No other soccer: no Premier League, La Liga, Bundesliga, Serie A or Ligue 1 file of its own; those leagues exist only inside the EFL capture and
`legacy_spx`. Details and the plan are in [soccer-europe.md](soccer-europe.md).

## Other sports (all sources named in the file names)

Provenance by file name suffix (count of saved pages or CSVs): CBS SportsLine, CNNSI, ESPN, Yahoo Sports, USA Today, BBC, Canoe, TSN, nfl.com, mlb.com,
nhl.com. Not one is an open licence. ESPN is never a source; Yahoo Sports and USA Today scoreboards are confirm-only (store nothing); the others have no tier
yet. Hence **keep-only**: copy the bytes to DS1 and Dropbox as the record, build nothing, and ask John before anything is loaded.

| Folder | Seasons | What it holds |
|---|---|---|
| `Data/mlb/` | 2003 regular and playoff, 2004, 2005 | batting, pitching, fielding, injuries, rosters, schedule pages (CBS, CNNSI, ESPN, Yahoo, USA Today, mlb.com), parsed CSVs and XML, scrape logs, SQL import scripts |
| `Data/nba/` | 2002-03 to 2007-08 | the same kinds of page; NBA TV schedule; `NBA2004RegularSeason.csv` and the SQL game inserts (SPX's own schedule) |
| `Data/nfl/` | 2002 to 2006 | 1,325 weekly player-statistics pages for 2003, 2004 weekly folders, rosters/injuries/depth charts; two zips of 2282 files (715 MB unpacked) |
| `Data/nhl/` | 2002 to 2008, 2012 | player/goalie/injury pages 2003-04; 2007 and 2008 hold one Yahoo scoreboard page and parsed CSV per day (475 days); 2012 holds `schedule-nhl.csv`, `schedule-mlb.csv`, `teams-*.csv` (SPX's table exports of March 2012) |
| `Data/cfl/` | 2003, 2004 | schedules and a few pages |
| `Data/cfb/`, `Data/cbb/`, `Data/cbl/`, `Data/pga/` | 2003 to 2004 | NCAA football/basketball schedules (SPX-made CSV, one row per team per game) and team insert SQL; the CBL's 2003 schedule; a 2002 PGA page. Games of these are also in `legacy_spx` |

Verdicts above stay keep-only. The one exception to consider (John decides): `Data/nhl/2012-regular/schedule-*.csv` and `teams-*.csv` are exports of SPX's own
tables made after the last SQL backup used for `legacy_spx` (max game date there 2012-04-07); check them against `legacy_spx.tbl_games` before deciding they add nothing.

## SPX download packages

`Data/pub/` (326 files) and `wwwroot extras/pub` + `wwwroot extras/zip` (322 files, 250 zips): the files SPX published for its members and sold as "Gold Players",
"Free Players", schedules, scores, in CSV and XML, 2001 to 2008 (NHL, NBA, MLB, NFL, CFL). Each zip holds one to a few files of the same name (the zips under these three folders list as 1 to 217 members, except two in `Data/nfl/` of about 1,100 pages each; none holds soccer). Their columns are SPX's own (`#PlayerName,ESPNPlayerID,TeamAbbName,…`,
`#LAST UPDATED: 2003/12/31`): season-to-date or weekly player statistics, rosters, injuries. SPX built them from the pages listed above, so the origin is third
party, but they are the **only copy of SPX's weekly player-statistics snapshots 2003 to 2007** (the history tables were emptied). Verdict: John decides; keep-only
meanwhile. `Data/pub/AlternateNames.csv` (302 name pairs), `LastNameMaps.csv` and the `ESPN*Maps.csv` files are SPX's name-matching tables: keep-only (the
alternate-names table is already in `legacy_spx.tbl_alternate_names`).

## Games and gaming

`Data/games/<year>-regular/`: for every year 2003 to 2007 a `batch/` folder (the day's pages), `data/` (parsed `games20NN-scores.csv`, odds CSV, huge `.log` files of
the scrape runs, 9 to 23 MB each) and `archive.rar` (the dated pages of the season: scoreboards of USA Today, Canoe, TSN, BBC, ESPN Soccernet, and betting-line
pages), plus an unpacked `2007-regular/archive/html` with 2,370 dated pages (2007-06 to 2008-09). `Data/gaming/` is the same for the wagering game. These
produced `tblGameScoresRaw` (already on DS1). Keep-only. Betting-line pages (`games-odds-*`) are gambling odds: keep-only, never published.

## Reference files

`Miscellaneous/SPXNBAScores2002-2006.csv` (SPX's own NBA score export, 2007-11-06; duplicates `legacy_spx.tbl_games`), `Countries.txt`, `Countries.xlsx`, `Capitals.txt`,
`SPXISOCodes.txt`, `SPXCountrieMaps.txt` (country map images of an Olympics site: skip), `TimeZones.txt`, `Teams.txt` (a saved Yahoo Sports page: skip),
`ESPNPlayerMaps.txt` (SPX player id to ESPN id: keep-only, the ESPN id tables are on DS1), `Spx History.txt/.doc/.XLS` (a sports-history calendar text: keep-only; not
for the site, its origin is unknown), `TeamConferenceDivisionSeasons Worksheet.sql` and other SQL worksheets, `SPs.txt` (stored procedures), `DTS/` (SQL Server
packages), `scriptaculous-js-1.7.0/` (a JS library): all keep-only. `Data/Lahman Database/` is Lahman v5.3 (25 CSVs, 2007): keep-only, a newer Lahman is already loaded.
`Data/GeoIP/`: MaxMind GeoLite (2007), under MaxMind's own licence; nothing uses it: skip.

## Skipped without opening (member data and credentials)

By file name and type only, never opened, never copied: the account SQL and lists (`2008 Accounts.sql`, `Add New Person Accounts 2007.txt`, `Addresses.txt`,
`Moderator Addresses.txt`, the file named after an e-mail address, `Emails/`, `PayPal/`, `subscriptions.pdf`, the invoice, the pool and payout worksheets), the forum
and site-message tables (`Data/pub/tblForumMessages-20030729.csv`, `tblUIMessages-20030729.csv`, `Miscellaneous/tblUIMessages-20031222.csv`; 127 MB together), the hosting and
registrar notes and anything that looks like a login (`GoDaddy.txt`, `IXWebHosting.txt`, `NetSol Customer Care.txt`, `domains.txt`, `SPX Moving Server Notes.txt`,
`Favourites/`). They must not go to DS1, Dropbox backups of raw data, git or a ticket.

## Decisions for John

1. **ESPN-origin soccer** (`Data/efl/`, `Data/fifa/espn_*`, the Soccernet dailies): load as SPX's archive (`legacy_spx_extras`, flagged ESPN), use only to confirm, or leave as raw bytes? Recommended: raw bytes now; load the EFL capture as confirm-only (it fills 962 scores but stores an ESPN page's facts); never build from the Soccernet dailies.
2. **BBC Sport dailies** (2005 to 2008-09): the only wide football score source of those years in the folder. Terms unchecked; recommend checking BBC's terms once, and until then raw bytes only.
3. **SPX download packages and scraped stat pages** (all sports): raw bytes to DS1 and Dropbox now (one `archive_raw.py` run per folder, about 1 GB), nothing built.
4. **NHL 2012 table exports and the unused `legacy_spx` sports** (college football/basketball, CBL, arena football, NLL): a separate ticket if wanted.
