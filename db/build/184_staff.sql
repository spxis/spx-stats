-- Head coaches (managers in MLB), captains and alternate captains per team season, into core.roster_stint.
--  * MLB: the manager of each side in each Retrosheet game log (fields 90-93), with the dates of the first and last game he managed.
--  * NFL: home_coach / away_coach of each nflverse game, with dates.
--  * NHL, NBA, CFL: the infobox of the club-season article on Wikipedia (legacy_staff.wikipedia_*, scripts/staff/); the NHL also gives
--    the captain and alternate captains. No dates there; several names in one season mean a change during it, in page order.
-- A person is found by core.external_id (retrosheet id; nflverse 'coach:<name>'; wikipedia link title or 'name:<name>'), else by Lahman's retroID
-- or the Wikidata item of the article, else (captains) by name among that club's players of the season, else created (kind 'coach', or 'player' for a captain).
-- Rerunnable: the stints this step wrote are deleted and written again; people it created are kept and found by their external id.
create temp table src on commit drop as
select code, source_id from meta.source where code in ('retrosheet', 'nflverse', 'wikipedia', 'lahman', 'wikidata');
create temp table sid on commit drop as
select (select source_id from src where code = 'retrosheet') as retro, (select source_id from src where code = 'nflverse') as nfl,
       (select source_id from src where code = 'wikipedia') as wiki, (select source_id from src where code = 'lahman') as lahman,
       (select source_id from src where code = 'wikidata') as wikidata;

update meta.source set attribution = attribution || ' Head coaches, captains and alternate captains of NHL, NBA and CFL club seasons from the infoboxes of the "<season> <club> season" articles on English Wikipedia, CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
       notes = notes || ' Coaches and captains: infobox fields of the club-season articles, fetched through the MediaWiki API 2026-10-12.'
where code = 'wikipedia' and attribution not like '%Head coaches, captains%';

delete from core.roster_stint where (role = 'head_coach' or captaincy is not null)
  and source_id in (select retro from sid union select nfl from sid union select wiki from sid);

-- ---- MLB: Retrosheet team code and year -> team_season (as db/build/181)
create temp table retro_ts on commit drop as
select distinct y, c, ts from (
  select substr(source_key, 7, 4)::int y, split_part(source_key, ':', 3) c, home_team_season_id ts from core.game where source_id = (select retro from sid)
  union select substr(source_key, 7, 4)::int, split_part(source_key, ':', 4), away_team_season_id from core.game where source_id = (select retro from sid)) x;
create temp table fr on commit drop as
select entity_id as franchise_id, substr(external_key, 11) as code from core.external_id
where entity_kind = 'franchise' and source_id = (select retro from sid);
create temp table mlb_ts on commit drop as
select y, c, min(ts) as ts from (
  select y, c, ts from retro_ts
  union all
  select s.start_year, cn.team_id, ts.team_season_id
  from legacy_retrosheet.current_name cn join fr on fr.code = cn.franchise_id
  join core.season s on s.league_code = 'mlb' and s.start_year between extract(year from cn.first_game)::int and extract(year from coalesce(cn.last_game, '9999-01-01'))::int
  join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fr.franchise_id
  where not exists (select 1 from retro_ts r where r.y = s.start_year and r.c = cn.team_id)) z
group by y, c;

create temp table mgr_game on commit drop as
select extract(year from game_date)::int as y, visitor as c, fields[90] as k, fields[91] as nm, game_date from legacy_retrosheet.game_log
where game_type <> 'allstar' and fields[90] not in ('', '(none)')
union all
select extract(year from game_date)::int, home, fields[92], fields[93], game_date from legacy_retrosheet.game_log
where game_type <> 'allstar' and fields[92] not in ('', '(none)');

create temp table coach_raw on commit drop as
select t.ts as team_season_id, g.k as key, (select retro from sid) as source_id, (array_agg(g.nm order by g.game_date desc))[1] as name,
       min(g.game_date) as first_on, max(g.game_date) as last_on, 'coach'::text as field, 0 as n
from mgr_game g join mlb_ts t on t.y = g.y and t.c = g.c group by 1, 2;

-- ---- NFL: nflverse games
insert into coach_raw
select team_season_id, 'coach:' || nm, (select nfl from sid), nm, min(d), max(d), 'coach', 0
from (
  select g.home_team_season_id as team_season_id, n.row->>'home_coach' as nm, n.gameday::date as d
  from legacy_nflverse.game n join core.external_id x on x.entity_kind = 'game' and x.source_id = (select nfl from sid) and x.external_key = n.game_id
  join core.game g on g.game_id = x.entity_id
  union all
  select g.away_team_season_id, n.row->>'away_coach', n.gameday::date
  from legacy_nflverse.game n join core.external_id x on x.entity_kind = 'game' and x.source_id = (select nfl from sid) and x.external_key = n.game_id
  join core.game g on g.game_id = x.entity_id) z
where nm is not null and nm <> '' group by 1, 2, 3, 4;

-- ---- NHL, NBA, CFL: Wikipedia infoboxes
insert into coach_raw
select w.team_season_id, coalesce(w.link_title, 'name:' || w.name), (select wiki from sid), w.name, null, null, w.field, w.n
from legacy_staff.wikipedia_staff w join core.team_season ts using (team_season_id);

-- ---- people
create temp table cand on commit drop as
select key, source_id, (array_agg(name order by length(name) desc))[1] as name, bool_or(field <> 'coach') as captain
from coach_raw group by 1, 2;
create temp table lp on commit drop as
select retroid, min(playerid) as playerid from legacy_lahman.people where retroid is not null and retroid <> '' group by 1;
create temp table pp on commit drop as
select c.key, c.source_id, c.name, c.captain,
       coalesce(x.entity_id, via_lahman.entity_id, via_wikidata.entity_id) as person_id
from cand c
left join core.external_id x on x.entity_kind = 'person' and x.source_id = c.source_id and x.external_key = c.key
left join lp on c.source_id = (select retro from sid) and lp.retroid = c.key
left join core.external_id via_lahman on via_lahman.entity_kind = 'person' and via_lahman.source_id = (select lahman from sid) and via_lahman.external_key = lp.playerid
left join lateral (select e.entity_id from legacy_people.item i join core.external_id e on e.entity_kind = 'person' and e.source_id = (select wikidata from sid) and e.external_key = i.qid
                   where c.source_id = (select wiki from sid) and i.enwiki_title = c.key limit 1) via_wikidata on true;

-- A captain not otherwise known: the club's player of that season with the same name
update pp set person_id = m.person_id
from (select c.key, min(psp.person_id) as person_id
      from coach_raw c join pp on pp.key = c.key and pp.source_id = c.source_id and pp.person_id is null
      join core.player_season_stat psp on psp.team_season_id = c.team_season_id
      join core.person p on p.person_id = psp.person_id and core.fold_text(p.full_name) = core.fold_text(c.name)
      where c.field <> 'coach' group by c.key having count(distinct psp.person_id) = 1) m
where pp.key = m.key and pp.person_id is null;

create temp table newp on commit drop as
select key, source_id, name, captain, nextval(pg_get_serial_sequence('core.person', 'person_id')) as person_id from pp where person_id is null;
insert into core.person (person_id, full_name, kind, source_id)
overriding system value
select person_id, name, case when captain then 'player' else 'coach' end, source_id from newp;
update pp set person_id = newp.person_id from newp where pp.key = newp.key and pp.source_id = newp.source_id;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', person_id, source_id, key from pp
on conflict do nothing;

-- ---- stints
insert into core.roster_stint (person_id, team_season_id, role, valid_during, source_id)
select pp.person_id, c.team_season_id, 'head_coach', case when c.first_on is not null then daterange(c.first_on, c.last_on, '[]') end, c.source_id
from coach_raw c join pp on pp.key = c.key and pp.source_id = c.source_id
where c.field = 'coach'
order by c.team_season_id, c.first_on nulls first, c.n;

insert into core.roster_stint (person_id, team_season_id, role, captaincy, source_id)
select distinct on (pp.person_id, c.team_season_id, c.field) pp.person_id, c.team_season_id, 'player', case c.field when 'captain' then 'C' else 'A' end, c.source_id
from coach_raw c join pp on pp.key = c.key and pp.source_id = c.source_id
where c.field in ('captain', 'alt_captain')
order by pp.person_id, c.team_season_id, c.field, c.n;

select 'head_coach stints' as what, count(*) from core.roster_stint where role = 'head_coach'
union all select 'captaincy stints', count(*) from core.roster_stint where captaincy is not null;
