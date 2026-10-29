-- The NHL club(s) each AHL club was affiliated with, season by season (core.team_season_affiliation, migration 160), from the "Affiliation" column of the
-- season articles' standings tables as db/build/229 loaded them (legacy_wikipedia_hockey_minor.team_season.affiliation: "DET", "BOS/CGY", "independent").
-- Runs after 229 (it needs the AHL's franchises and team seasons) and, for the NHL side, after the NHL's identities (core.franchise_identity.abbreviation).
-- Run from the repo root (it reads db/seed/hockey_minor_club.csv, the same club-name table 229 uses). Rerunnable, no begin/commit of its own (a dry run works).
--
-- A code is resolved to an NHL franchise only when exactly one franchise with an NHL membership that season has an identity carrying that abbreviation on
-- November 15 of the season's first year (the date 229 uses to place an identity). Atlanta (two clubs, ATL) and the like are told apart by the year. A code that
-- fits none, or more than one, keeps its label with no parent franchise and is logged in meta.data_issue: never guessed. "independent" has no parent at all.
-- The table's key is (team_season_id, position): there is no id to drift. The step writes and removes only rows of AHL team seasons.

create temp table src as select source_id from meta.source where code = 'wikipedia';
create temp table seed_club (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text, loc text, nick text);
\copy seed_club from 'db/seed/hockey_minor_club.csv' with (format csv, header true)
delete from seed_club where league <> 'ahl';

-- every AHL club name and year -> its team season
create temp table aff_ts as
select distinct on (ts.team_season_id) ts.team_season_id, t.season as yr, t.team_name, t.affiliation
from legacy_wikipedia_hockey_minor.team_season t
join seed_club m on lower(m.club) = lower(t.team_name) and t.season between m.first_year and m.last_year
join core.franchise f on f.source_id = (select source_id from src) and f.source_key = 'ahl:' || substring(m.franchise from 5)
join core.season s on s.league_code = 'ahl' and s.start_year = t.season
join core.team_season ts on ts.franchise_id = f.franchise_id and ts.season_id = s.season_id
where t.league = 'ahl' and t.affiliation is not null and btrim(t.affiliation) <> ''
order by ts.team_season_id, t.team_name;

create temp table aff as
select a.team_season_id, a.yr, a.team_name, p.pos::smallint as pos, btrim(p.code) as code,
       case when btrim(p.code) = 'independent' then array[]::integer[]
            else coalesce((select array_agg(distinct i.franchise_id order by i.franchise_id)
                           from core.franchise_identity i
                           where i.abbreviation = btrim(p.code)
                             and i.valid_during @> make_date(a.yr, 11, 15)
                             and exists (select 1 from core.franchise_league l
                                         where l.franchise_id = i.franchise_id and l.league_code = 'nhl' and l.valid_during @> make_date(a.yr, 11, 15))), array[]::integer[]) end as parents
from aff_ts a
cross join lateral unnest(string_to_array(a.affiliation, '/')) with ordinality as p(code, pos);

-- Rows of an earlier run that are not in this one go; the others are updated in place.
delete from core.team_season_affiliation x
using core.team_season ts, core.season s
where ts.team_season_id = x.team_season_id and s.season_id = ts.season_id and s.league_code = 'ahl'
  and not exists (select 1 from aff where aff.team_season_id = x.team_season_id and aff.pos = x.position);
insert into core.team_season_affiliation (team_season_id, position, label, parent_league_code, parent_franchise_id, source_id)
select a.team_season_id, a.pos, a.code,
       case when cardinality(a.parents) = 1 then 'nhl' end,
       case when cardinality(a.parents) = 1 then a.parents[1] end,
       (select source_id from src)
from aff a
on conflict (team_season_id, position) do update
  set label = excluded.label, parent_league_code = excluded.parent_league_code, parent_franchise_id = excluded.parent_franchise_id, source_id = excluded.source_id
  where (core.team_season_affiliation.label, core.team_season_affiliation.parent_league_code, core.team_season_affiliation.parent_franchise_id)
        is distinct from (excluded.label, excluded.parent_league_code, excluded.parent_franchise_id);

delete from meta.data_issue where source_id = (select source_id from src) and issue like 'AHL affiliation:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', 'ahl:' || a.yr || ':' || a.team_name,
       format('AHL affiliation: "%s" of %s in %s-%s %s', a.code, a.team_name, a.yr, right((a.yr + 1)::text, 2),
              case when cardinality(a.parents) = 0 then 'names no NHL club with that abbreviation that season' else 'names more than one NHL club that season' end),
       'Label kept, no parent club'
from aff a where a.code <> 'independent' and cardinality(a.parents) <> 1;

select 'club seasons with an affiliation' as what, count(distinct team_season_id) from aff
union all select 'affiliation lines', count(*) from aff
union all select 'resolved to an NHL franchise', count(*) from aff where cardinality(parents) = 1
union all select 'independent', count(*) from aff where code = 'independent'
union all select 'logged, not resolved', count(*) from aff where code <> 'independent' and cardinality(parents) <> 1
union all select 'rows in the table (ahl)', count(*) from core.team_season_affiliation x join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'ahl';
