-- Major-league batting and pitching seasons from the Lahman Baseball Database (legacy_lahman, SABR, CC BY-SA 3.0)
-- into core.person and core.player_season_stat, one row per player, club, season and phase (regular, playoffs).
-- Rerunnable (scripts/players/lahman_load.py first), and safe after scripts/build_core.sh: every key is stable.
--  * A person is matched by Lahman's playerID (core.external_id: entity_kind 'person', source lahman). One Lahman
--    has not met is matched to an existing person only on the same name (accents ignored) and the same birth date; otherwise made.
--  * A club is a team_season. Lahman's retrosheet team code and year find it through the games Retrosheet gave us,
--    or, where we hold no Retrosheet game for that club-year (2002-2011 are SPX's), through the franchise that
--    Retrosheet's current-name list files the code under. Clubs of leagues we do not hold (the Negro leagues, the
--    Players' League, the Union Association, the Federal League) have no team_season: their rows are not loaded.
--  * Postseason rows add every round a player played for a club into one row. Only counting stats are stored;
--    batting average, ERA and the like are worked out where they are shown.
begin;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
values ('lahman', 'Lahman Baseball Database', 'dataset', 'CC BY-SA 3.0',
        'Batting and pitching seasons from the Lahman Baseball Database (SABR, sabr.org/lahman-database), CC BY-SA 3.0.',
        'https://sabr.org/lahman-database/', '1871-01-01', current_date,
        'People, Batting, Pitching, BattingPost, PitchingPost, Teams, CollegePlaying and Schools, 1871-2025, from the parquet files packaged in pylahman 0.7.0 (PyPI), archived in legacy_files.raw_archive.')
on conflict (code) do update set retrieved_on = current_date;
create temp table src on commit drop as select source_id from meta.source where code = 'lahman';

-- Lahman team-year -> team_season
create temp table retro_ts on commit drop as
select distinct y, c, ts from (
  select substr(source_key, 7, 4)::int y, split_part(source_key, ':', 3) c, home_team_season_id ts from core.game where source_id = (select source_id from meta.source where code = 'retrosheet')
  union select substr(source_key, 7, 4)::int, split_part(source_key, ':', 4), away_team_season_id from core.game where source_id = (select source_id from meta.source where code = 'retrosheet')) x;

create temp table fr on commit drop as
select entity_id as franchise_id, substr(external_key, 11) as code from core.external_id
where entity_kind = 'franchise' and source_id = (select source_id from meta.source where code = 'retrosheet');

create temp table lteam on commit drop as
select t.yearid::int as y, t.teamid, coalesce(
         (select min(r.ts) from retro_ts r where r.y = t.yearid::int and r.c = t.teamidretro),
         (select min(ts.team_season_id) from legacy_retrosheet.current_name cn join fr on fr.code = cn.franchise_id
            join core.season s on s.league_code = 'mlb' and s.start_year = t.yearid::int
            join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fr.franchise_id
           where cn.team_id = t.teamidretro and t.yearid::int between extract(year from cn.first_game)::int
                                                              and extract(year from coalesce(cn.last_game, '9999-01-01'))::int)) as team_season_id
from legacy_lahman.teams t;
create index on lteam (y, teamid);

-- People
create temp table lp on commit drop as
select
       trim(coalesce(p.namefirst, '') || ' ' || coalesce(p.namelast, '')) as full_name,
       case when p.birthyear is not null and p.birthmonth is not null and p.birthday is not null
            then make_date(p.birthyear::int, p.birthmonth::int, p.birthday::int) end as birth_date,
       p.*
from legacy_lahman.people p
where exists (select 1 from legacy_lahman.batting b where b.playerid = p.playerid)
   or exists (select 1 from legacy_lahman.pitching b where b.playerid = p.playerid)
   or exists (select 1 from legacy_lahman.battingpost b where b.playerid = p.playerid)
   or exists (select 1 from legacy_lahman.pitchingpost b where b.playerid = p.playerid);

create temp table matched on commit drop as
select lp.playerid, min(cp.person_id) as person_id
from lp join core.person cp on core.fold_text(cp.full_name) = core.fold_text(lp.full_name) and cp.birth_date = lp.birth_date
where lp.birth_date is not null
group by lp.playerid having count(distinct cp.person_id) = 1;

create temp table pp on commit drop as
select lp.playerid, coalesce(x.entity_id, m.person_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id,
       (x.entity_id is not null or m.person_id is not null) as existed, (x.entity_id is not null) as keyed
from lp
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from src) and x.external_key = lp.playerid
left join matched m on x.entity_id is null and m.playerid = lp.playerid;

create temp table country on commit drop as
select * from (values ('USA','US'),('CAN','CA'),('D.R.','DO'),('P.R.','PR'),('Venezuela','VE'),('Cuba','CU'),('México','MX'),('Japan','JP'),
  ('Panama','PA'),('Ireland','IE'),('England','GB'),('Colombia','CO'),('Germany','DE'),('Nicaragua','NI'),('Australia','AU'),('South Korea','KR'),
  ('Canada','CA'),('Scotland','GB'),('Netherlands','NL'),('Taiwan','TW'),('Curacao','CW'),('Italy','IT'),('Aruba','AW'),('Bahamas','BS'),
  ('France','FR'),('Honduras','HN'),('Czech Republic','CZ'),('Brazil','BR'),('Russia','RU'),('Lithuania','LT'),('Wales','GB'),('Sweden','SE'),
  ('South Africa','ZA'),('Norway','NO'),('Spain','ES'),('China','CN'),('Poland','PL'),('Belgium','BE'),('Denmark','DK'),('Greece','GR'),
  ('Peru','PE'),('Jamaica','JM'),('Austria','AT'),('Switzerland','CH'),('Finland','FI'),('Afghanistan','AF'),('Saudi Arabia','SA'),('Guam','GU'),
  ('V.I.','VI'),('Philippines','PH'),('Ecuador','EC'),('Cuba','CU')) v(name, code);

insert into core.person (person_id, full_name, kind, given_name, family_name, birth_date, birth_place, birth_country_code, death_date,
                         height_cm, weight_kg, bats, throws_or_shoots, debut_on, final_game_on, source_id)
overriding system value
select pp.person_id, lp.full_name, 'player', lp.namegiven, lp.namelast, lp.birth_date,
       nullif(concat_ws(', ', lp.birthcity, case when lp.birthcountry in ('USA', 'CAN') then lp.birthstate end), ''),
       (select c.code from country c where c.name = lp.birthcountry limit 1),
       case when lp.deathyear is not null and lp.deathmonth is not null and lp.deathday is not null
            then make_date(lp.deathyear::int, lp.deathmonth::int, lp.deathday::int) end,
       round(lp.height::numeric * 2.54)::smallint, round(lp.weight::numeric * 0.45359237, 1),
       case lp.bats when 'B' then 'S' when 'L' then 'L' when 'R' then 'R' end, case when lp.throws in ('L', 'R') then lp.throws end, lp.debut::date, lp.finalgame::date, (select source_id from src)
from lp join pp using (playerid)
where not pp.existed and lp.full_name <> ''
on conflict (person_id) do nothing;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', pp.person_id, (select source_id from src), pp.playerid from pp join core.person using (person_id) where not pp.keyed
on conflict do nothing;

-- Seasons
delete from core.player_season_stat where source_id = (select source_id from src);

create temp table bat on commit drop as
select pp.person_id, lt.team_season_id, 'regular'::core.season_phase as phase, 'batting' as stat_group,
       sum(b.g::int) as gp, null::int as gs,
       jsonb_strip_nulls(jsonb_build_object('g', sum(b.g::int), 'ab', sum(b.ab::int), 'r', sum(b.r::int), 'h', sum(b.h::int), '2b', sum(b."2b"::int),
         '3b', sum(b."3b"::int), 'hr', sum(b.hr::int), 'rbi', sum(b.rbi::int), 'sb', sum(b.sb::int), 'cs', sum(b.cs::int), 'bb', sum(b.bb::int),
         'so', sum(b.so::int), 'ibb', sum(b.ibb::int), 'hbp', sum(b.hbp::int), 'sh', sum(b.sh::int), 'sf', sum(b.sf::int), 'gidp', sum(b.gidp::int))) as stats
from legacy_lahman.batting b join pp on pp.playerid = b.playerid join lteam lt on lt.y = b.yearid::int and lt.teamid = b.teamid
where lt.team_season_id is not null group by 1, 2
union all
select pp.person_id, lt.team_season_id, 'playoffs', 'batting', sum(b.g::int), null,
       jsonb_strip_nulls(jsonb_build_object('g', sum(b.g::int), 'ab', sum(b.ab::int), 'r', sum(b.r::int), 'h', sum(b.h::int), '2b', sum(b."2b"::int),
         '3b', sum(b."3b"::int), 'hr', sum(b.hr::int), 'rbi', sum(b.rbi::int), 'sb', sum(b.sb::int), 'cs', sum(b.cs::int), 'bb', sum(b.bb::int),
         'so', sum(b.so::int), 'ibb', sum(b.ibb::int), 'hbp', sum(b.hbp::int), 'sh', sum(b.sh::int), 'sf', sum(b.sf::int), 'gidp', sum(b.gidp::int)))
from legacy_lahman.battingpost b join pp on pp.playerid = b.playerid join lteam lt on lt.y = b.yearid::int and lt.teamid = b.teamid
where lt.team_season_id is not null group by 1, 2;

create temp table pit on commit drop as
select pp.person_id, lt.team_season_id, 'regular'::core.season_phase as phase, 'pitching' as stat_group,
       sum(b.g::int) as gp, sum(b.gs::int) as gs,
       jsonb_strip_nulls(jsonb_build_object('w', sum(b.w::int), 'l', sum(b.l::int), 'g', sum(b.g::int), 'gs', sum(b.gs::int), 'cg', sum(b.cg::int),
         'sho', sum(b.sho::int), 'sv', sum(b.sv::int), 'ipouts', sum(b.ipouts::int), 'h', sum(b.h::int), 'er', sum(b.er::int), 'hr', sum(b.hr::int),
         'bb', sum(b.bb::int), 'so', sum(b.so::int), 'bfp', sum(b.bfp::int), 'r', sum(b.r::int), 'wp', sum(b.wp::int), 'bk', sum(b.bk::int), 'hbp', sum(b.hbp::int))) as stats
from legacy_lahman.pitching b join pp on pp.playerid = b.playerid join lteam lt on lt.y = b.yearid::int and lt.teamid = b.teamid
where lt.team_season_id is not null group by 1, 2
union all
select pp.person_id, lt.team_season_id, 'playoffs', 'pitching', sum(b.g::int), sum(b.gs::int),
       jsonb_strip_nulls(jsonb_build_object('w', sum(b.w::int), 'l', sum(b.l::int), 'g', sum(b.g::int), 'gs', sum(b.gs::int), 'cg', sum(b.cg::int),
         'sho', sum(b.sho::int), 'sv', sum(b.sv::int), 'ipouts', sum(b.ipouts::int), 'h', sum(b.h::int), 'er', sum(b.er::int), 'hr', sum(b.hr::int),
         'bb', sum(b.bb::int), 'so', sum(b.so::int), 'bfp', sum(b.bfp::int), 'r', sum(b.r::int), 'wp', sum(b.wp::int), 'bk', sum(b.bk::int), 'hbp', sum(b.hbp::int)))
from legacy_lahman.pitchingpost b join pp on pp.playerid = b.playerid join lteam lt on lt.y = b.yearid::int and lt.teamid = b.teamid
where lt.team_season_id is not null group by 1, 2;

insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total)
select person_id, team_season_id, phase, stat_group, core.stats_pack(stat_group, stats), (select source_id from src), gp, gs, false from bat
union all select person_id, team_season_id, phase, stat_group, core.stats_pack(stat_group, stats), (select source_id from src), gp, gs, false from pit;

-- People made here who played only for clubs we do not hold (Negro leagues, 1880s leagues) have no seasons: drop them.
delete from core.external_id x where x.entity_kind = 'person' and x.source_id = (select source_id from src)
  and not exists (select 1 from core.player_season_stat s where s.person_id = x.entity_id)
  and not exists (select 1 from core.award_winner w where w.person_id = x.entity_id)
  and not exists (select 1 from core.roster_stint r where r.person_id = x.entity_id)
  and exists (select 1 from core.person p where p.person_id = x.entity_id and p.source_id = (select source_id from src));
delete from core.person p where p.source_id = (select source_id from src)
  and not exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = p.person_id and x.source_id = p.source_id);
commit;
