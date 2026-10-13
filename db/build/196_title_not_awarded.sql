-- Championships that were not awarded, from db/seed/title_not_awarded.csv (run from the repo root, as scripts/build_core.sh does).
-- Rerunnable: the table is only ever fed from the seed, so it is emptied and filled again. Needs migration 060.

drop table if exists pg_temp.seed_title;
create temp table seed_title (
  league text, year smallint, award text, source text, source_url text, reason_en text, reason_fr text, reason_ja text
);
\copy seed_title from 'db/seed/title_not_awarded.csv' with (format csv, header true)

delete from core.title_not_awarded;
insert into core.title_not_awarded (league_code, start_year, award, reason_en, reason_fr, reason_ja, source_id, source_url)
select t.league, t.year, t.award, t.reason_en, nullif(t.reason_fr, ''), nullif(t.reason_ja, ''), src.source_id, nullif(t.source_url, '')
from seed_title t
join meta.source src on src.code = t.source;

-- A seed row that matched no source is a typo: say so.
select 'title_not_awarded seed rows not loaded' as what, (select count(*) from seed_title) - (select count(*) from core.title_not_awarded) as n
where (select count(*) from seed_title) <> (select count(*) from core.title_not_awarded);
