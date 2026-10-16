-- NFL player statistics by club and season from nflverse (legacy_nflverse.player_stat, migration 099; CC BY 4.0; scripts/player_stats/nflverse_stats_*.py),
-- 1999 on, into core.player_season_stat: one row per player, club, season, phase (regular, playoffs) and stat group. Rerunnable, and safe after
-- scripts/build_core.sh has rebuilt team seasons: every key it uses is stable. Run after 150 and 151 (the NFL team seasons) and 181_players_nflverse (the
-- people), before 185_person_merge, 186 and 190.
--  * A person is found by the NFL's player id as nflverse publishes it (core.external_id: entity_kind 'person', source nflverse, key = gsis id), which
--    181_players_nflverse.sql wrote from the rosters. A player nflverse's rosters have not met is not made here and not matched on a name: his lines are
--    left out and counted in meta.data_issue.
--  * A club is the franchise of nflverse's code (core.external_id: entity_kind 'franchise', source nflverse, 'team:<code>', written by 150) in that
--    season. nflverse's player files use today's code for every year (LV for the Oakland years, LAC for San Diego, LA for St. Louis); 150 keys those codes
--    to the same franchises as their old ones.
--  * A player who played for two clubs in a season has one line per club (nflverse's weekly file names the club of each week; the loader adds the weeks of
--    each club), so nothing is credited to a club he did not play for in that game. is_total stays false: there is no combined line.
--  * Groups, one row each where the player has anything in it (so a quarterback has passing and rushing rows, a receiver receiving and rushing):
--    passing, rushing, receiving, defense, kicking, punting. Keys are short (cmp att yds td int sck ...), counting numbers only; rates are worked out
--    where they are shown. 'gp' and games_played are the weeks the club has a line for the player (nflverse's own games count); it undercounts a
--    lineman who played without a recorded stat.
--  * A key exists only where nflverse recorded that column that season (legacy_nflverse.player_stat_column): tracking numbers such as air yards, targets
--    or tackles for loss are absent in the years nflverse has none, never zero. Inside a kept column a player with nothing has 0.
--  * stat_basis 'total' (season totals). source_key is empty (the source is nflverse's season file, named by the season).
-- Provenance: the source is nflverse; nothing is written in free text. What could not be placed is in meta.data_issue (entity_kind 'stat_team',
-- 'stat_player', 'stat_roster'), with counts.
begin;

update meta.source set
  attribution = attribution || ' Player statistics from nflverse-data (github.com/nflverse/nflverse-data, release "stats_player"), CC BY 4.0.',
  notes = coalesce(notes, '') || ' Player statistics by season (stats_player_week/reg/post_<season>.csv, 1999-2025) fetched 2026-10-14; archived in legacy_files.raw_archive under nflverse_player_stats/.'
where code = 'nflverse' and attribution not like '%Player statistics from nflverse-data%';
create temp table nsrc on commit drop as select source_id from meta.source where code = 'nflverse';

delete from core.player_season_stat
where source_id = (select source_id from nsrc) and stat_group in ('passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting');

-- group, nflverse column, short key
create temp table gcol (grp text, col text, key text) on commit drop;
insert into gcol values
  ('passing', 'completions', 'cmp'), ('passing', 'attempts', 'att'), ('passing', 'passing_yards', 'yds'), ('passing', 'passing_tds', 'td'),
  ('passing', 'passing_interceptions', 'int'), ('passing', 'sacks_suffered', 'sck'), ('passing', 'sack_yards_lost', 'sckyds'),
  ('passing', 'passing_first_downs', 'fd'), ('passing', 'passing_2pt_conversions', '2pt'), ('passing', 'passing_air_yards', 'ay'),
  ('passing', 'passing_yards_after_catch', 'yac'),
  ('rushing', 'carries', 'att'), ('rushing', 'rushing_yards', 'yds'), ('rushing', 'rushing_tds', 'td'), ('rushing', 'rushing_fumbles', 'fum'),
  ('rushing', 'rushing_fumbles_lost', 'fl'), ('rushing', 'rushing_first_downs', 'fd'), ('rushing', 'rushing_2pt_conversions', '2pt'),
  ('receiving', 'receptions', 'rec'), ('receiving', 'targets', 'tgt'), ('receiving', 'receiving_yards', 'yds'), ('receiving', 'receiving_tds', 'td'),
  ('receiving', 'receiving_fumbles', 'fum'), ('receiving', 'receiving_fumbles_lost', 'fl'), ('receiving', 'receiving_first_downs', 'fd'),
  ('receiving', 'receiving_air_yards', 'ay'), ('receiving', 'receiving_yards_after_catch', 'yac'), ('receiving', 'receiving_2pt_conversions', '2pt'),
  ('defense', 'def_tackles_solo', 'tkl'), ('defense', 'def_tackle_assists', 'ast'), ('defense', 'def_tackles_for_loss', 'tfl'), ('defense', 'def_sacks', 'sck'),
  ('defense', 'def_sack_yards', 'sckyds'), ('defense', 'def_qb_hits', 'qbh'), ('defense', 'def_interceptions', 'int'),
  ('defense', 'def_interception_yards', 'intyds'), ('defense', 'def_pass_defended', 'pd'), ('defense', 'def_fumbles_forced', 'ff'),
  ('defense', 'fumble_recovery_opp', 'fr'), ('defense', 'def_tds', 'td'), ('defense', 'def_safeties', 'sfty'),
  ('kicking', 'fg_made', 'fgm'), ('kicking', 'fg_att', 'fga'), ('kicking', 'fg_long', 'fgl'), ('kicking', 'fg_made_40_49', 'fg40'),
  ('kicking', 'fg_made_50_59', 'fg50'), ('kicking', 'fg_made_60_', 'fg60'), ('kicking', 'pat_made', 'xpm'), ('kicking', 'pat_att', 'xpa'),
  ('punting', 'pt_att', 'punts'), ('punting', 'pt_yards', 'yds'), ('punting', 'pt_long', 'long'), ('punting', 'pt_inside_20', 'in20'),
  ('punting', 'pt_touchback', 'tb'), ('punting', 'pt_blocked', 'blk');

create function pg_temp.n(s jsonb, k text) returns numeric language sql immutable as $$ select coalesce((s ->> k)::numeric, 0) $$;

-- ---- 1. Club lines with their person and team season --------------------------------------------------------------------------------
create temp table ln on commit drop as
select ps.*, pe.entity_id as person_id, ts.team_season_id,
       case ps.season_type when 'POST' then 'playoffs' else 'regular' end::core.season_phase as phase
from legacy_nflverse.player_stat ps
left join core.external_id pe on pe.entity_kind = 'person' and pe.source_id = (select source_id from nsrc) and pe.external_key = ps.gsis_id
left join core.external_id fe on fe.entity_kind = 'franchise' and fe.source_id = (select source_id from nsrc) and fe.external_key = 'team:' || ps.team
left join core.season s on s.league_code = 'nfl' and s.start_year = ps.season
left join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fe.entity_id;

-- ---- 2. One row per group the player has something in ---------------------------------------------------------------------------------
create temp table rows on commit drop as
select l.person_id, l.team_season_id, l.phase, g.grp, l.season, l.games, l.gsis_id,
       jsonb_build_object('gp', l.games) || coalesce((
         select jsonb_object_agg(m.key, pg_temp.n(l.stats, m.col))
         from gcol m join legacy_nflverse.player_stat_column c on c.season = l.season and c.col = m.col
         where m.grp = g.grp and (m.col not in ('fg_long', 'pt_long') or pg_temp.n(l.stats, m.col) > 0)), '{}'::jsonb) as stats
from ln l
cross join (values ('passing'), ('rushing'), ('receiving'), ('defense'), ('kicking'), ('punting')) g(grp)
where l.person_id is not null and l.team_season_id is not null
  and case g.grp
        when 'passing' then pg_temp.n(l.stats, 'attempts') > 0
        when 'rushing' then pg_temp.n(l.stats, 'carries') > 0
        when 'receiving' then pg_temp.n(l.stats, 'receptions') > 0 or pg_temp.n(l.stats, 'targets') > 0
        when 'defense' then pg_temp.n(l.stats, 'def_tackles_solo') + pg_temp.n(l.stats, 'def_tackle_assists') + pg_temp.n(l.stats, 'def_sacks')
                            + pg_temp.n(l.stats, 'def_interceptions') + pg_temp.n(l.stats, 'def_pass_defended') + pg_temp.n(l.stats, 'def_fumbles_forced')
                            + pg_temp.n(l.stats, 'fumble_recovery_opp') + pg_temp.n(l.stats, 'def_tds') + pg_temp.n(l.stats, 'def_tackles_for_loss')
                            + pg_temp.n(l.stats, 'def_qb_hits') + pg_temp.n(l.stats, 'def_safeties') > 0
        when 'kicking' then pg_temp.n(l.stats, 'fg_att') > 0 or pg_temp.n(l.stats, 'pat_att') > 0
        when 'punting' then pg_temp.n(l.stats, 'pt_att') > 0 end;

-- Two player ids that point at one person (a record merged before this step) would give one line twice: the line with more games is kept, the
-- other is counted below.
create temp table rows1 on commit drop as
select distinct on (person_id, team_season_id, phase, grp) *
from rows order by person_id, team_season_id, phase, grp, games desc, gsis_id;

insert into core.player_season_stat (person_id, team_season_id, phase, stat_group, stats, source_id, games_played, games_started, is_total, stat_basis, source_key)
select person_id, team_season_id, phase, grp, core.stats_pack(grp, stats), (select source_id from nsrc), games, null, false, 'total', null from rows1;

-- ---- 3. What could not be placed ------------------------------------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from nsrc) and entity_kind in ('stat_team', 'stat_player', 'stat_roster');

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'stat_team', 'nflverse_stats:' || l.team || ':' || min(l.season),
       format('nflverse player statistics with team code %s in %s-%s (%s club lines) fit no NFL team season we hold', l.team, min(l.season), max(l.season), count(*)),
       'Left out'
from ln l where l.team_season_id is null group by l.team;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'stat_player', 'nflverse_stats:no_person',
       format('%s club lines of %s players in nflverse''s player statistics have a player id no roster of ours carries (%s of the lines are in 1999-2005); first ids: %s',
              count(*), count(distinct gsis_id), count(*) filter (where season <= 2005),
              (select string_agg(x, ', ') from (select distinct gsis_id as x from ln where person_id is null and team_season_id is not null order by 1 limit 8) e)),
       'Left out: never matched on a name'
from ln where person_id is null and team_season_id is not null having count(*) > 0;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'stat_player', 'nflverse_stats:two_ids_one_person',
       format('%s statistic lines come from a second nflverse player id that points at a person already holding the same club season', (select count(*) from rows) - (select count(*) from rows1)),
       'Kept the line with more games'
where (select count(*) from rows) > (select count(*) from rows1);

-- a player with lines for a club the nflverse roster of that season does not list him on: counted, not decided
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'stat_roster', 'nflverse_stats:not_on_roster',
       format('%s player-club-seasons have statistics for a club whose nflverse roster of that season does not list the player (of %s that were checked)', bad, n),
       'Kept: the statistics name the club of each game'
from (select count(*) filter (where not exists (select 1 from core.roster_stint r where r.person_id = d.person_id and r.team_season_id = d.team_season_id)) as bad, count(*) as n
      from (select distinct person_id, team_season_id from ln where person_id is not null and team_season_id is not null) d) z
where bad > 0;

select (select count(*) from core.player_season_stat where source_id = (select source_id from nsrc) and stat_group in ('passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting')) as stat_rows,
       (select count(distinct person_id) from core.player_season_stat where source_id = (select source_id from nsrc) and stat_group in ('passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting')) as players,
       (select count(*) from ln where person_id is null) as lines_without_person, (select count(*) from ln where team_season_id is null) as lines_without_team_season;
commit;
