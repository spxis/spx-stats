-- NHL skater and goalie seasons from the NHL's stats API (legacy_nhlapi.player_season, credited "NHL") into
-- core.person and core.player_season_stat, one row per player, club, season and phase (regular, playoffs).
-- Rerunnable, and safe after scripts/build_core.sh has rebuilt team_seasons: every key it uses is stable.
--  * A person is found in this order, and a new one is made only when none fits:
--      1. the NHL's player id (core.external_id: entity_kind 'person', source nhl_api);
--      2. when that id is gone (145 clears the source's external ids on a rerun): the person who already holds the same season lines
--         (club season, phase, group and numbers equal) in core.player_season_stat from this source, if that person is the single best
--         fit for the player and the player the single best fit for the person;
--      3. a person of this source with no NHL id left and the same name (accents ignored) and shooting hand, if that pair is the only one;
--      4. a person Wikidata says played ice hockey whose name (accents ignored) is unique among both the NHL's players and ours.
--    A new person gets the name and hand the API states (the position is set by db/build/186_person_positions.sql). Dates and places
--    of birth are not in the API's summary: they stay empty. The NHL id is written back for every player, so 1 holds on the next run.
--  * A club is a team_season, found by the NHL's tricode for the season (core.franchise_identity.abbreviation).
--  * Only counting stats are stored; rates (GAA, SV%, points per game) are worked out where they are shown.
--  * The season lines are upserted by their key and rows that did not change are not written; lines the API no longer gives are deleted.
begin;

create temp table src on commit drop as select source_id from meta.source where code = 'nhl_api';
update meta.source set notes = notes || E'\nPlayer season summaries from api.nhle.com/stats/rest/en (skater and goalie summary), 1917-18 to 2025-26.'
 where code = 'nhl_api' and notes not like '%Player season summaries%';

-- Names are matched with accents and punctuation ignored (core.fold_text).
create temp table nhl_player on commit drop as
select distinct on (player_id) player_id, full_name, core.fold_text(full_name) as n, position, hand
from legacy_nhlapi.player_season order by player_id, season desc, game_type desc;

create temp table name_count on commit drop as select n, count(*) as k from nhl_player group by n;

create temp table hockey on commit drop as
select p.person_id, core.fold_text(p.full_name) as n
from core.person p
join core.external_id x on x.entity_kind = 'person' and x.entity_id = p.person_id and x.source_id = (select source_id from meta.source where code = 'wikidata')
join legacy_people.claim c on c.qid = x.external_key and c.prop = 'P641' and c.value_qid = 'Q41466'
group by p.person_id, core.fold_text(p.full_name);

create temp table hockey_unique on commit drop as select n, min(person_id) as person_id from hockey group by n having count(*) = 1;

create temp table nhl_key on commit drop as
select external_key as k, entity_id as person_id from core.external_id
where entity_kind = 'person' and source_id = (select source_id from src);

-- the season lines of this run, before they belong to a person
create temp table lines on commit drop as
select ps.player_id, ts.team_season_id,
       case ps.game_type when 3 then 'playoffs'::core.season_phase else 'regular'::core.season_phase end as phase,
       ps.kind as stat_group,
       core.stats_pack(ps.kind, jsonb_strip_nulls(case ps.kind
         when 'skater' then jsonb_build_object('gp', ps.stats->'gamesPlayed', 'g', ps.stats->'goals', 'a', ps.stats->'assists', 'pts', ps.stats->'points',
              'pim', ps.stats->'penaltyMinutes', 'pm', ps.stats->'plusMinus', 'sog', ps.stats->'shots', 'ppg', ps.stats->'ppGoals',
              'shg', ps.stats->'shGoals', 'gwg', ps.stats->'gameWinningGoals')
         else jsonb_build_object('gp', ps.stats->'gamesPlayed', 'gs', ps.stats->'gamesStarted', 'w', ps.stats->'wins', 'l', ps.stats->'losses',
              't', ps.stats->'ties', 'otl', ps.stats->'otLosses', 'ga', ps.stats->'goalsAgainst', 'sa', ps.stats->'shotsAgainst',
              'sv', ps.stats->'saves', 'so', ps.stats->'shutouts', 'toi', ps.stats->'timeOnIce') end)) as stats,
       (ps.stats->>'gamesPlayed')::smallint as games_played, (ps.stats->>'gamesStarted')::smallint as games_started
from legacy_nhlapi.player_season ps
join core.season s on s.league_code = 'nhl' and s.start_year = ps.season
join core.franchise_identity fi on fi.abbreviation = ps.team_abbrev and fi.valid_during @> make_date(ps.season, 10, 1)
join core.team_season ts on ts.season_id = s.season_id and ts.franchise_identity_id = fi.franchise_identity_id;

-- 2. players without an NHL id on file, and the person who already holds the same season lines
create temp table vote0 on commit drop as
select l.player_id, o.person_id, count(*) as v
from lines l
join core.player_season_stat o on o.source_id = (select source_id from src) and o.team_season_id = l.team_season_id
 and o.phase = l.phase and o.stat_group = l.stat_group and o.stats = l.stats
where not exists (select 1 from nhl_key where k = l.player_id::text)
  and not exists (select 1 from nhl_key where nhl_key.person_id = o.person_id)
group by 1, 2;
create temp table vote on commit drop as
select player_id, person_id from (
  select player_id, person_id,
         row_number() over (partition by player_id order by v desc) as rp,
         v - coalesce(lead(v) over (partition by player_id order by v desc), 0) as dp,
         row_number() over (partition by person_id order by v desc) as rq,
         v - coalesce(lead(v) over (partition by person_id order by v desc), 0) as dq
  from vote0) z
where rp = 1 and dp > 0 and rq = 1 and dq > 0;

-- 3. a person of this source with no NHL id and no season lines matched above, the same name and hand, alone on both sides
create temp table loose_person on commit drop as
select p.person_id, core.fold_text(p.full_name) as n, p.throws_or_shoots as h
from core.person p
where p.source_id = (select source_id from src) and p.kind = 'player'
  and not exists (select 1 from nhl_key where nhl_key.person_id = p.person_id)
  and not exists (select 1 from vote where vote.person_id = p.person_id);
create temp table loose_player on commit drop as
select np.player_id, np.n, case when np.hand in ('L', 'R') then np.hand end as h
from nhl_player np
where not exists (select 1 from nhl_key where k = np.player_id::text)
  and not exists (select 1 from vote where vote.player_id = np.player_id);
create temp table named on commit drop as
select lp.player_id, pe.person_id
from loose_player lp join loose_person pe on pe.n = lp.n and pe.h is not distinct from lp.h
where (select count(*) from loose_player x where x.n = lp.n and x.h is not distinct from lp.h) = 1
  and (select count(*) from loose_person x where x.n = pe.n and x.h is not distinct from pe.h) = 1;

create temp table pp on commit drop as
select np.player_id, np.full_name, np.position, np.hand,
       coalesce(x.person_id, vote.person_id, named.person_id, hu.person_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id,
       (x.person_id is not null or vote.person_id is not null or named.person_id is not null or hu.person_id is not null) as existed,
       (x.person_id is not null) as keyed
from nhl_player np
left join nhl_key x on x.k = np.player_id::text
left join vote on x.person_id is null and vote.player_id = np.player_id
left join named on x.person_id is null and vote.person_id is null and named.player_id = np.player_id
left join name_count nc on nc.n = np.n
left join hockey_unique hu on x.person_id is null and vote.person_id is null and named.person_id is null and nc.k = 1 and hu.n = np.n;

insert into core.person (person_id, full_name, kind, throws_or_shoots, source_id)
overriding system value
select person_id, full_name, 'player', case when hand in ('L', 'R') then hand end, (select source_id from src)
from pp where not existed
on conflict (person_id) do nothing;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', person_id, (select source_id from src), player_id::text from pp where not keyed
on conflict do nothing;

-- Seasons: what we state is rebuilt from the API's rows each run; a line whose numbers did not change is not written.
create temp table new_pss (like core.player_season_stat including all) on commit drop;
insert into new_pss (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total)
select pp.person_id, l.team_season_id, l.phase, l.stat_group, l.stats, (select source_id from src), l.games_played, l.games_started, false
from lines l join pp on pp.player_id = l.player_id
on conflict (person_id, team_season_id, phase, stat_group, source_id) do update
  set stats = core.stats_merge(new_pss.stats, excluded.stats),
      games_played = coalesce(new_pss.games_played, 0) + coalesce(excluded.games_played, 0);

delete from core.player_season_stat o
where o.source_id = (select source_id from src)
  and not exists (select 1 from new_pss n where n.person_id = o.person_id and n.team_season_id = o.team_season_id
                  and n.phase = o.phase and n.stat_group = o.stat_group and n.source_id = o.source_id);

insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total)
select person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total from new_pss
on conflict (person_id, team_season_id, phase, stat_group, source_id) do update
  set stats = excluded.stats, games_played = excluded.games_played, games_started = excluded.games_started, is_total = excluded.is_total
  where (core.player_season_stat.stats, core.player_season_stat.games_played, core.player_season_stat.games_started, core.player_season_stat.is_total)
        is distinct from (excluded.stats, excluded.games_played, excluded.games_started, excluded.is_total);

commit;
