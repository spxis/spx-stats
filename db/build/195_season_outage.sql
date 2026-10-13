-- Seasons that were not played, from db/seed/season_outage.csv (run from the repo root, as scripts/build_core.sh does). Rerunnable:
-- the table is only ever fed from the seed, so it is emptied and filled again. Needs migration 057.

drop table if exists pg_temp.seed_outage;
create temp table seed_outage (
  league text, year smallint, kind text, stopped_on date, cancelled_on date, resumed_on date, games_cancelled integer,
  source text, source_url text, note_en text, note_fr text, note_ja text
);
\copy seed_outage from 'db/seed/season_outage.csv' with (format csv, header true)

delete from core.season_outage;
insert into core.season_outage (league_code, start_year, kind, stopped_on, cancelled_on, resumed_on, games_cancelled, note_en, note_fr, note_ja, source_id, source_url)
select o.league, o.year, o.kind, o.stopped_on, o.cancelled_on, o.resumed_on, o.games_cancelled, o.note_en, nullif(o.note_fr, ''), nullif(o.note_ja, ''),
       src.source_id, nullif(o.source_url, '')
from seed_outage o
join meta.source src on src.code = o.source;

-- A seed row that matched no source is a typo: say so.
select 'season_outage seed rows not loaded' as what, (select count(*) from seed_outage) - (select count(*) from core.season_outage) as n
where (select count(*) from seed_outage) <> (select count(*) from core.season_outage);
