-- College football: Wikipedia's scores checked against CollegeFootballData (legacy_cfbd.game on DS1), a cross-check only (John, 2026-10-28: the site shows
-- Wikipedia's data). For every game of db/build/230 that CFBD also lists (same season, the same two programs, a day apart at most: CFBD's times are UTC)
-- it writes one meta.verification row on the game, field 'score': 'confirmed' when the two agree, 'disputed' when they do not. A disputed game also
-- gets a meta.data_issue row saying that CFBD differs, kept Wikipedia's. No CFBD value is copied: their_value stays empty and the issue text carries
-- no number. CFBD's own team and game ids are not read (ESPN's ids, never stored); teams are matched on name, db/seed/ncaaf_cfbd_name.csv holds the
-- names that are not simply the school's name.
-- Run from the repo root after 230, and after legacy_cfbd.game is loaded (scripts/grey/cfbd_load.py). Rerunnable: it takes back its own rows first.
begin;

create temp table cf as select source_id from meta.source where code = 'cfbd';
create temp table wp as select source_id from meta.source where code = 'wikipedia';
create function pg_temp.flat(x text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(replace(x, '&', 'and')), 'áàâäãåéèêëíìîïóòôöõúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]', '', 'g')
$$;

delete from meta.verification v using core.game g
where v.entity_kind = 'game' and v.entity_id = g.game_id and v.source_id = (select source_id from cf) and g.source_key like 'wpncaaf:%';
delete from meta.data_issue where source_id = (select source_id from cf) and issue ~ '^NCAAF:';

create temp table seed_cfbd (cfbd_name text, program text);
\copy seed_cfbd from 'db/seed/ncaaf_cfbd_name.csv' with (format csv, header true)

-- Our side: each game with the programs of its two teams.
create temp table og as
select g.game_id, g.source_key, s.start_year yr, g.game_date, g.home_score, g.away_score,
       substr(hf.source_key, 7) hp, substr(af.source_key, 7) ap
from core.game g join core.season s using (season_id)
join core.team_season ht on ht.team_season_id = g.home_team_season_id join core.franchise hf on hf.franchise_id = ht.franchise_id
join core.team_season at on at.team_season_id = g.away_team_season_id join core.franchise af on af.franchise_id = at.franchise_id
where s.league_code = 'ncaaf' and g.source_id = (select source_id from wp) and g.source_key like 'wpncaaf:%';

-- CFBD's team names -> a program: the seed, else the one program that ever had the school's name (CFBD gives today's name for every season).
create temp table cnames as
select distinct season, n from (select season, home_team n from legacy_cfbd.game union select season, away_team from legacy_cfbd.game) x
where season in (select distinct yr from og);
create temp table cmap as
select c.season, c.n, coalesce(sd.program, (select min(substr(f.source_key, 7)) from core.franchise_identity i join core.franchise f using (franchise_id)
                                            where f.source_key like 'ncaaf:%' and pg_temp.flat(i.location) = pg_temp.flat(c.n)
                                            having count(distinct f.franchise_id) = 1)) program
from cnames c left join seed_cfbd sd on sd.cfbd_name = c.n;

create temp table cg as
select g.season yr, (g.start_date at time zone 'UTC')::date d, h.program hp, a.program ap, g.home_points, g.away_points
from legacy_cfbd.game g
join cmap h on h.season = g.season and h.n = g.home_team
join cmap a on a.season = g.season and a.n = g.away_team
where h.program is not null and a.program is not null and g.home_points is not null and g.away_points is not null;

-- one CFBD game for each of ours: the nearest date of the same two programs
create temp table pairs as
select distinct on (o.game_id) o.game_id, o.source_key,
       case when c.hp = o.hp then c.home_points else c.away_points end as c_home,
       case when c.hp = o.hp then c.away_points else c.home_points end as c_away,
       o.home_score, o.away_score
from og o join cg c on c.yr = o.yr and ((c.hp = o.hp and c.ap = o.ap) or (c.hp = o.ap and c.ap = o.hp)) and abs(c.d - o.game_date) <= 1
order by o.game_id, abs(c.d - o.game_date);

insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', game_id, 'score', case when (c_home, c_away) = (home_score, away_score) then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from cf), null
from pairs;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from cf), 'game', source_key, 'NCAAF: CollegeFootballData differs from Wikipedia on the score', 'Kept Wikipedia''s score'
from pairs where (c_home, c_away) is distinct from (home_score, away_score);

select 'our games' k, count(*)::bigint n from og
union all select 'matched in CFBD', count(*) from pairs
union all select 'confirmed', count(*) from pairs where (c_home, c_away) = (home_score, away_score)
union all select 'disputed', count(*) from pairs where (c_home, c_away) is distinct from (home_score, away_score)
union all select 'CFBD games with a team no program answers', count(*) from legacy_cfbd.game g
  where g.season in (select distinct yr from og) and exists (select 1 from cmap m where m.season = g.season and m.program is null and m.n in (g.home_team, g.away_team))
union all select 'CFBD names no program answers', count(distinct n) from cmap where program is null;
commit;
