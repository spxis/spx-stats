-- Logo fit (db/migrations/107_logo_fit.sql) from db/seed/logo_fit.csv: how each logo sits in the site's circle, square and table-cell
-- boxes, and which Commons primary mark stands in for a wordmark there. Run from the repo root, as scripts/build_core.sh does.
-- Rerunnable; independent of 175_team_brand.sql (the rows are keyed by the logo file, not by the brand row).
drop table if exists pg_temp.seed_logo_fit;
create temp table seed_logo_fit (logo_file text, league text, team text, wordmark boolean, mark_url text, mark_licence text, mark_page text,
                                 scale numeric, dx numeric, dy numeric, bg text, status text, note text);
\copy seed_logo_fit from 'db/seed/logo_fit.csv' with (format csv, header true)

delete from core.logo_fit;
insert into core.logo_fit (logo_file, league_code, team, wordmark, mark_url, mark_licence, mark_page, scale, dx, dy, bg, status, note)
select logo_file, nullif(league, ''), team, coalesce(wordmark, false), nullif(mark_url, ''), nullif(mark_licence, ''), nullif(mark_page, ''),
       coalesce(scale, 1), coalesce(dx, 0), coalesce(dy, 0), coalesce(nullif(bg, ''), 'auto'), coalesce(nullif(status, ''), 'proposed'), nullif(note, '')
from seed_logo_fit;

select 'logo_fit seed rows not loaded' as what, (select count(*) from seed_logo_fit) - (select count(*) from core.logo_fit) as n
where (select count(*) from seed_logo_fit) <> (select count(*) from core.logo_fit);
-- A row naming a file no brand row carries is a typo or a logo that has since changed.
select 'logo_fit rows matching no logo' as what, count(*) as n from core.logo_fit f
where not exists (select 1 from core.franchise_brand b where core.logo_file(b.logo_url) = f.logo_file)
having count(*) > 0;
