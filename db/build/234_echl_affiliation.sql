-- The NHL club(s) each ECHL club was affiliated with, season by season (core.team_season_affiliation, migration 160), from the club cell of the season articles' standings tables as
-- db/build/233 loaded them (legacy_wikipedia_hockey_minor.team_season: affiliation "DET/SJS" and affiliation_links "Detroit Red Wings/San Jose Sharks", migration 163). The articles
-- print the NHL club(s) in the standings of 2005-06 to 2012-13 and of 2014-15 on (2013-14 and the seasons before 2005-06 print none).
-- Runs after 233 (it needs the ECHL's franchises and team seasons) and, for the NHL side, after the NHL's identities (core.franchise_identity). Run from the repo root (it reads
-- db/seed/hockey_minor_club.csv, the same club-name table 233 uses). Rerunnable, no begin/commit of its own (a dry run works).
--
-- A line is resolved to an NHL franchise only with certainty. First by the article the standings link to ("Los Angeles Kings"): exactly one franchise with an NHL membership that season
-- has an identity of that name on November 15 of the season's first year (the date 233 uses to place an identity); failing that, exactly one such franchise that has the name in any
-- year (an article names a club it has since renamed by its name today). Only when the cell links nothing, by the abbreviation, as 232 does it:
-- exactly one franchise carries it that day. A line that fits none, or more than one, keeps its label with no parent franchise and is logged in meta.data_issue: never guessed.
-- "independent" has no parent at all. Positions run in the order the article prints the clubs. The label of a placed club is its abbreviation that season (the article's "LA" is "LAK"). The AHL club an ECHL club shared with its NHL parent is not loaded: the articles
-- name it only where it changed (core.team_season_affiliation can hold it, as a position after the NHL clubs with parent_league_code 'ahl').
-- The table's key is (team_season_id, position): there is no id to drift. The step writes and removes only rows of ECHL team seasons.

create temp table src as select source_id from meta.source where code = 'wikipedia';
create temp table seed_club (club text, league text, first_year int, last_year int, franchise text, country text, display text, note text, loc text, nick text);
\copy seed_club from 'db/seed/hockey_minor_club.csv' with (format csv, header true)
delete from seed_club where league <> 'echl';

-- every ECHL club name and year -> its team season
create temp table aff_ts as
select distinct on (ts.team_season_id) ts.team_season_id, t.season as yr, t.team_name, t.affiliation, t.affiliation_links
from legacy_wikipedia_hockey_minor.team_season t
join seed_club m on lower(m.club) = lower(t.team_name) and t.season between m.first_year and m.last_year
join core.franchise f on f.source_id = (select source_id from src) and f.source_key = 'echl:' || substring(m.franchise from 5)
join core.season s on s.league_code = 'echl' and s.start_year = t.season
join core.team_season ts on ts.franchise_id = f.franchise_id and ts.season_id = s.season_id
where t.league = 'echl' and t.affiliation is not null and btrim(t.affiliation) <> ''
order by ts.team_season_id, t.team_name;

create temp table aff0 as
select a.team_season_id, a.yr, a.team_name, p.pos::smallint as pos, btrim(p.code) as code, nullif(btrim(l.link), '') as link
from aff_ts a
cross join lateral unnest(string_to_array(a.affiliation, '/')) with ordinality as p(code, pos)
left join lateral unnest(string_to_array(coalesce(a.affiliation_links, ''), '/')) with ordinality as l(link, pos) on l.pos = p.pos;

create temp table aff as
select a.*,
       case when a.code = 'independent' then array[]::integer[]
            when a.link is not null and cardinality(that_year.ids) > 0 then that_year.ids
            when a.link is not null then any_year.ids
            else coalesce(by_code.ids, array[]::integer[]) end as parents
from aff0 a
-- the club's name that season ...
cross join lateral (select coalesce(array_agg(distinct i.franchise_id order by i.franchise_id), array[]::integer[]) as ids
                    from core.franchise_identity i
                    where a.link is not null and core.fold_text(i.full_name) = core.fold_text(a.link)
                      and i.valid_during @> make_date(a.yr, 11, 15)
                      and exists (select 1 from core.franchise_league l where l.franchise_id = i.franchise_id and l.league_code = 'nhl' and l.valid_during @> make_date(a.yr, 11, 15))) that_year
-- ... else the name an article uses today for a club that had another name then (the Utah Hockey Club of 2024-25 is linked as the Utah Mammoth): the one NHL club of that season with that name in any year
cross join lateral (select coalesce(array_agg(distinct i.franchise_id order by i.franchise_id), array[]::integer[]) as ids
                    from core.franchise_identity i
                    where a.link is not null and core.fold_text(i.full_name) = core.fold_text(a.link)
                      and exists (select 1 from core.franchise_league l where l.franchise_id = i.franchise_id and l.league_code = 'nhl' and l.valid_during @> make_date(a.yr, 11, 15))) any_year
cross join lateral (select array_agg(distinct i.franchise_id order by i.franchise_id) as ids
                    from core.franchise_identity i
                    where a.link is null and i.abbreviation = a.code
                      and i.valid_during @> make_date(a.yr, 11, 15)
                      and exists (select 1 from core.franchise_league l where l.franchise_id = i.franchise_id and l.league_code = 'nhl' and l.valid_during @> make_date(a.yr, 11, 15))) by_code;

-- Rows of an earlier run that are not in this one go; the others are updated in place.
delete from core.team_season_affiliation x
using core.team_season ts, core.season s
where ts.team_season_id = x.team_season_id and s.season_id = ts.season_id and s.league_code = 'echl'
  and not exists (select 1 from aff where aff.team_season_id = x.team_season_id and aff.pos = x.position);
insert into core.team_season_affiliation (team_season_id, position, label, parent_league_code, parent_franchise_id, source_id)
select a.team_season_id, a.pos,
       -- the label of a placed club is its abbreviation that season ("LAK" where the article prints "LA"), so db/checks/104 holds; any other label is as printed
       coalesce((select i.abbreviation from core.franchise_identity i where cardinality(a.parents) = 1 and i.franchise_id = a.parents[1] and i.valid_during @> make_date(a.yr, 11, 15) limit 1), a.code),
       case when cardinality(a.parents) = 1 then 'nhl' end,
       case when cardinality(a.parents) = 1 then a.parents[1] end,
       (select source_id from src)
from aff a
on conflict (team_season_id, position) do update
  set label = excluded.label, parent_league_code = excluded.parent_league_code, parent_franchise_id = excluded.parent_franchise_id, source_id = excluded.source_id
  where (core.team_season_affiliation.label, core.team_season_affiliation.parent_league_code, core.team_season_affiliation.parent_franchise_id)
        is distinct from (excluded.label, excluded.parent_league_code, excluded.parent_franchise_id);

delete from meta.data_issue where source_id = (select source_id from src) and issue like 'ECHL affiliation:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'team_season', 'echl:' || a.yr || ':' || a.team_name,
       format('ECHL affiliation: "%s"%s of %s in %s-%s %s', a.code, coalesce(' (' || a.link || ')', ''), a.team_name, a.yr, right((a.yr + 1)::text, 2),
              case when cardinality(a.parents) = 0 then 'names no NHL club that season' else 'names more than one NHL club that season' end),
       'Label kept, no parent club'
from aff a where a.code <> 'independent' and cardinality(a.parents) <> 1;

select 'club seasons with an affiliation' as what, count(distinct team_season_id) from aff
union all select 'affiliation lines', count(*) from aff
union all select 'resolved to an NHL franchise', count(*) from aff where cardinality(parents) = 1
union all select 'independent', count(*) from aff where code = 'independent'
union all select 'logged, not resolved', count(*) from aff where code <> 'independent' and cardinality(parents) <> 1
union all select 'rows in the table (echl)', count(*) from core.team_season_affiliation x join core.team_season ts using (team_season_id) join core.season s using (season_id) where s.league_code = 'echl';
