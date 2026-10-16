-- NHL skater and goalie seasons from the NHL's stats API (legacy_nhlapi.player_season, credited "NHL") into
-- core.person and core.player_season_stat, one row per player, club, season and phase (regular, playoffs).
-- Rerunnable, and safe after scripts/build_core.sh has rebuilt team_seasons: every key it uses is stable.
--  * A person is matched by the NHL's player id (core.external_id: entity_kind 'person', source nhl_api). A player
--    the NHL id has not met is matched to an existing person only when Wikidata says that person played ice hockey
--    and their name (accents ignored) is unique among both the NHL's players and ours; otherwise a new person is made, with the name and
--    hand the API states (the position is set by db/build/186_person_positions.sql). Dates and places of birth are not in the API's summary: they stay empty.
--  * A club is a team_season, found by the NHL's tricode for the season (core.franchise_identity.abbreviation).
--  * Only counting stats are stored; rates (GAA, SV%, points per game) are worked out where they are shown.
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

create temp table pp on commit drop as
select np.player_id, np.full_name, np.position, np.hand,
       coalesce(x.entity_id, hu.person_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id,
       (x.entity_id is not null or hu.person_id is not null) as existed,
       (x.entity_id is not null) as keyed
from nhl_player np
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from src) and x.external_key = np.player_id::text
left join name_count nc on nc.n = np.n
left join hockey_unique hu on x.entity_id is null and nc.k = 1 and hu.n = np.n;

insert into core.person (person_id, full_name, kind, throws_or_shoots, source_id)
overriding system value
select person_id, full_name, 'player', case when hand in ('L', 'R') then hand end, (select source_id from src)
from pp where not existed
on conflict (person_id) do nothing;

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', person_id, (select source_id from src), player_id::text from pp where not keyed
on conflict do nothing;

-- Seasons: what we state is rebuilt from the API's rows each run.
delete from core.player_season_stat where source_id = (select source_id from src);

insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total)
select pp.person_id, ts.team_season_id,
       case ps.game_type when 3 then 'playoffs'::core.season_phase else 'regular'::core.season_phase end,
       ps.kind,
       core.stats_pack(ps.kind, jsonb_strip_nulls(case ps.kind
         when 'skater' then jsonb_build_object('gp', ps.stats->'gamesPlayed', 'g', ps.stats->'goals', 'a', ps.stats->'assists', 'pts', ps.stats->'points',
              'pim', ps.stats->'penaltyMinutes', 'pm', ps.stats->'plusMinus', 'sog', ps.stats->'shots', 'ppg', ps.stats->'ppGoals',
              'shg', ps.stats->'shGoals', 'gwg', ps.stats->'gameWinningGoals')
         else jsonb_build_object('gp', ps.stats->'gamesPlayed', 'gs', ps.stats->'gamesStarted', 'w', ps.stats->'wins', 'l', ps.stats->'losses',
              't', ps.stats->'ties', 'otl', ps.stats->'otLosses', 'ga', ps.stats->'goalsAgainst', 'sa', ps.stats->'shotsAgainst',
              'sv', ps.stats->'saves', 'so', ps.stats->'shutouts', 'toi', ps.stats->'timeOnIce') end)),
       (select source_id from src), (ps.stats->>'gamesPlayed')::smallint, (ps.stats->>'gamesStarted')::smallint, false
from legacy_nhlapi.player_season ps
join pp on pp.player_id = ps.player_id
join core.season s on s.league_code = 'nhl' and s.start_year = ps.season
join core.franchise_identity fi on fi.abbreviation = ps.team_abbrev and fi.valid_during @> make_date(ps.season, 10, 1)
join core.team_season ts on ts.season_id = s.season_id and ts.franchise_identity_id = fi.franchise_identity_id
on conflict (person_id, team_season_id, phase, stat_group, source_id) do update
  set stats = core.stats_merge(core.player_season_stat.stats, excluded.stats),
      games_played = coalesce(core.player_season_stat.games_played, 0) + coalesce(excluded.games_played, 0);

commit;
