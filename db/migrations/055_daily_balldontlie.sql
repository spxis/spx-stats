-- balldontlie (free tier) as a source of the NBA schedule and scores for the daily job (scripts/daily/balldontlie.py).
-- legacy_wikipedia_daily.page.source may now also be 'balldontlie': the season's games as the API returned them, kept in
-- legacy_files.raw_archive under balldontlie/<day>/games-<season>.<sha12>.json, one page row per distinct content (title 'games.json',
-- revision = the sha256). DS1 only, like the rest of legacy_wikipedia_daily. Rerunnable.
begin;
alter table legacy_wikipedia_daily.page drop constraint if exists page_source_check;
alter table legacy_wikipedia_daily.page add constraint page_source_check check (source in ('wikipedia', 'nflverse', 'balldontlie'));
comment on schema legacy_wikipedia_daily is 'Game scores read from the NHL, NBA, MLB, NFL and CFL clubs'' season articles on en.wikipedia.org (CC BY-SA 4.0), from nflverse (CC BY 4.0) and, for the NBA, from balldontlie (free tier), by scripts/daily.';
commit;
