-- European club soccer from the SPX database (legacy_spx, sport 29 "European Football", seasons 2004-05 and 2005-06): core.soccer_* and the
-- league model of migration 139. Rerunnable, matched by stable keys, and it deletes only rows it wrote itself (source spx_database):
--   leagues   ref.league.league_code (premier_league, la_liga, ...), ref.soccer_league_system for the pyramid
--   seasons   core.soccer_tournament.tournament_id = league_code + start year
--   clubs     core.soccer_team.team_id = 'C-' + slug of SPX's club name, kept once given (source_key spx:team:<SPX team id> finds the row again)
--   matches   core.soccer_match.source_key = eu-<yyyymmdd>-<home team_id>-<away team_id>
-- What SPX holds is thin: it scheduled whole seasons but recorded a final score for only part of the games, so a season is listed here only if
-- it has at least 30 final scores, is marked incomplete (complete = false) with a note, and lists only the matches that have a score. Its
-- club lists come from the schedule, so a club is in a season if SPX scheduled a fair share of games for it there (SPX filed friendlies and
-- cross-league fixtures under league seasons; those are left out and counted in meta.data_issue). Fixtures with no score make no
-- soccer_match row (the table needs a score). The cups (UEFA Cup, World Cup 2006) are left to their own sources.
-- SPX wins where it holds a value: a later source (openfootball, Wikipedia) fills the other matches and checks these; it never replaces an SPX score
-- (meta.verification soccer_match, a disagreement a meta.data_issue). Does not touch core.game, core.team_season, core.franchise or any venue table.
begin;

drop table if exists es_league, es_game0, es_dup, es_cnt, es_core, es_game1, es_game, es_season, es_club;

insert into ref.sport (sport_code, name) values ('soccer', 'Soccer') on conflict (sport_code) do nothing;

-- SPX league id -> the league of this model
create temp table es_league (spx_league_id smallint primary key, league_code text not null, system_key text not null, country_code text not null,
  tier smallint not null, name text not null, short_name text not null);
insert into es_league values
  (15, 'premier_league',       'england',     'GB', 1, 'Premier League',        'Premier League'),
  (16, 'efl_championship',     'england',     'GB', 2, 'EFL Championship',      'Championship'),
  (17, 'efl_league_one',       'england',     'GB', 3, 'EFL League One',        'League One'),
  (18, 'efl_league_two',       'england',     'GB', 4, 'EFL League Two',        'League Two'),
  (19, 'national_league',      'england',     'GB', 5, 'National League',       'National League'),
  (23, 'scottish_premiership', 'scotland',    'GB', 1, 'Scottish Premiership',  'Premiership'),
  (24, 'scottish_championship','scotland',    'GB', 2, 'Scottish Championship', 'Championship'),
  (25, 'scottish_league_one',  'scotland',    'GB', 3, 'Scottish League One',   'League One'),
  (26, 'scottish_league_two',  'scotland',    'GB', 4, 'Scottish League Two',   'League Two'),
  (31, 'la_liga',              'spain',       'ES', 1, 'La Liga',               'La Liga'),
  (29, 'bundesliga',           'germany',     'DE', 1, 'Bundesliga',            'Bundesliga'),
  (37, 'serie_a',              'italy',       'IT', 1, 'Serie A',               'Serie A'),
  (27, 'ligue_1',              'france',      'FR', 1, 'Ligue 1',               'Ligue 1'),
  (28, 'eredivisie',           'netherlands', 'NL', 1, 'Eredivisie',            'Eredivisie');

-- every SPX fixture of those leagues: the league is the season's own league (the game's league column when it has no season)
create temp table es_game0 as
select g.game_id, g.game_date::date as d, g.home_team_id, g.away_team_id, l.league_code, l.name as league_name,
       coalesce(substring(se.season_name from '^(\d{4})')::int,
                case when extract(month from g.game_date) >= 7 then extract(year from g.game_date)::int else extract(year from g.game_date)::int - 1 end) as year,
       s.score_home as hg, s.score_away as ag
from legacy_spx.tbl_games g
left join legacy_spx.lk_sport_seasons se on se.season_id = g.season_id
join es_league l on l.spx_league_id = coalesce(se.league_id, g.league_id)
left join lateral (select x.score_home, x.score_away from legacy_spx.tbl_game_scores x
                    where x.game_id = g.game_id and x.score_is_final and x.score_home is not null and x.score_away is not null
                    order by x.score_id desc limit 1) s on true
where g.sport_id = 29 and g.game_date is not null and not coalesce(g.game_cancelled, false)
  and g.home_team_id is not null and g.away_team_id is not null and g.home_team_id <> g.away_team_id;

-- one row per date and pair of clubs (SPX filed a few twice), the one with a score first
create temp table es_dup as
select distinct on (d, home_team_id, away_team_id) *
from es_game0 order by d, home_team_id, away_team_id, (hg is null), game_id;

-- SPX filed friendlies and cross-league fixtures under a league's season. The clubs of a league season are the ones with at least half
-- the median number of fixtures there; a fixture between any other pair is left out (and counted in meta.data_issue).
create temp table es_cnt as
select league_code, year, spx_id, count(*) as n
from (select league_code, year, home_team_id as spx_id from es_dup union all select league_code, year, away_team_id from es_dup) u
group by league_code, year, spx_id;
create temp table es_core as
select c.league_code, c.year, c.spx_id
from es_cnt c join (select league_code, year, percentile_cont(0.9) within group (order by n) as top from es_cnt group by 1, 2) m
  using (league_code, year)
where c.n >= 0.4 * m.top;

create temp table es_game1 as
select g.* from es_dup g
where exists (select 1 from es_core c where c.league_code = g.league_code and c.year = g.year and c.spx_id = g.home_team_id)
  and exists (select 1 from es_core c where c.league_code = g.league_code and c.year = g.year and c.spx_id = g.away_team_id);

-- a season is listed only if SPX recorded at least 30 final scores for it; fewer is a stray, not a season
create temp table es_season as
select league_code, year, min(league_name) as league_name, count(*)::int as scheduled, count(hg)::int as scored,
       (select count(*)::int from es_dup d where d.league_code = g.league_code and d.year = g.year) - count(*)::int as left_out
from es_game1 g group by league_code, year having count(hg) >= 30;

create temp table es_game as
select g.* from es_game1 g where exists (select 1 from es_season s where s.league_code = g.league_code and s.year = g.year);

-- ---------------------------------------------------------------- leagues

insert into ref.league (league_code, sport_code, country_code, notes)
select l.league_code, 'soccer', l.country_code, 'Tier ' || l.tier || ' of the ' || l.system_key || ' pyramid'
from es_league l where l.league_code in (select league_code from es_season)
on conflict (league_code) do update set sport_code = excluded.sport_code, country_code = excluded.country_code, notes = excluded.notes;

insert into ref.league_name (league_code, valid_during, name, short_name)
select l.league_code, '(,)', l.name, l.short_name from es_league l where l.league_code in (select league_code from es_season)
on conflict (league_code, valid_during) do update set name = excluded.name, short_name = excluded.short_name;

insert into ref.soccer_league_system (league_code, system_key, country_code, tier)
select l.league_code, l.system_key, l.country_code, l.tier from es_league l where l.league_code in (select league_code from es_season)
on conflict (league_code) do update set system_key = excluded.system_key, country_code = excluded.country_code, tier = excluded.tier;

-- ---------------------------------------------------------------- clubs

create temp table es_club as
with c as (
  select distinct t.team_id as spx_id, t.team_name
  from legacy_spx.tbl_teams t
  where t.team_id in (select home_team_id from es_game union select away_team_id from es_game)
), b as (
  select c.*, replace(core.fold_text(c.team_name), ' ', '-') as base,
         ex.team_id as have_id
  from c left join core.soccer_team ex on ex.source_key = 'spx:team:' || c.spx_id
       and ex.source_id = (select source_id from meta.source where code = 'spx_database')
), d as (
  select b.*, count(*) over (partition by base) as dup,
         exists (select 1 from core.soccer_team x where x.slug = b.base and x.team_id is distinct from b.have_id) as taken
  from b
)
select spx_id, team_name,
       coalesce(have_id, 'C-' || case when dup > 1 or taken then base || '-' || spx_id else base end) as team_id,
       coalesce((select x.slug from core.soccer_team x where x.team_id = d.have_id),
                case when dup > 1 or taken then base || '-' || spx_id else base end) as slug,
       (select min(l.country_code) from es_league l join es_game g on g.league_code = l.league_code
         where d.spx_id in (g.home_team_id, g.away_team_id)) as country_code
from d;

insert into core.soccer_team (team_id, name, slug, country_code, kind, has_men, has_women, source_id, source_key)
select c.team_id, c.team_name, c.slug, c.country_code, 'club', true, false,
       (select source_id from meta.source where code = 'spx_database'), 'spx:team:' || c.spx_id
from es_club c
on conflict (team_id) do update set name = excluded.name, country_code = excluded.country_code, kind = excluded.kind,
  source_key = excluded.source_key
  where core.soccer_team.source_id = excluded.source_id;

-- ---------------------------------------------------------------- seasons and the clubs in them

insert into core.soccer_tournament (tournament_id, league_code, year, name, host_names, host_team_ids, source_id, complete, note)
select s.league_code || s.year, s.league_code, s.year, s.year || '-' || right((s.year + 1)::text, 2) || ' ' || s.league_name, '{}', '{}',
       (select source_id from meta.source where code = 'spx_database'), false,
       format('The SPX database scheduled %s matches of this season and recorded a final score for %s; only those %s are listed, so the season is not complete.',
              s.scheduled, s.scored, s.scored)
from es_season s
on conflict (tournament_id) do update set name = excluded.name, complete = excluded.complete, note = excluded.note
  where core.soccer_tournament.source_id = excluded.source_id;

insert into core.soccer_tournament_team (tournament_id, team_id, team_name)
select distinct g.league_code || g.year, c.team_id, c.team_name
from es_game g join es_club c on c.spx_id in (g.home_team_id, g.away_team_id)
where exists (select 1 from core.soccer_tournament t where t.tournament_id = g.league_code || g.year
                and t.source_id = (select source_id from meta.source where code = 'spx_database'))
on conflict (tournament_id, team_id) do update set team_name = excluded.team_name;

-- ---------------------------------------------------------------- matches

insert into core.soccer_match (source_key, tournament_id, stage_key, stage_order, match_date, home_team_id, away_team_id,
                               home_goals, away_goals, winner_team_id, source_id)
select 'eu-' || to_char(g.d, 'YYYYMMDD') || '-' || h.team_id || '-' || a.team_id,
       g.league_code || g.year, 'regular', 1, g.d, h.team_id, a.team_id, g.hg, g.ag,
       case when g.hg > g.ag then h.team_id when g.hg < g.ag then a.team_id end,
       (select source_id from meta.source where code = 'spx_database')
from es_game g join es_club h on h.spx_id = g.home_team_id join es_club a on a.spx_id = g.away_team_id
where g.hg is not null
  and exists (select 1 from core.soccer_tournament t where t.tournament_id = g.league_code || g.year
                and t.source_id = (select source_id from meta.source where code = 'spx_database'))
on conflict (source_key) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals,
  winner_team_id = excluded.winner_team_id, match_date = excluded.match_date
  where core.soccer_match.source_id = excluded.source_id;

-- rows this step wrote earlier that the SPX data no longer gives
delete from core.soccer_match m
using core.soccer_tournament t
where t.tournament_id = m.tournament_id and t.source_id = (select source_id from meta.source where code = 'spx_database')
  and m.source_id = t.source_id and m.source_key like 'eu-%'
  and not exists (select 1 from es_game g join es_club h on h.spx_id = g.home_team_id join es_club a on a.spx_id = g.away_team_id
                   where g.hg is not null and g.league_code || g.year = m.tournament_id
                     and m.source_key = 'eu-' || to_char(g.d, 'YYYYMMDD') || '-' || h.team_id || '-' || a.team_id);

delete from core.soccer_tournament_team tt
using core.soccer_tournament t
where t.tournament_id = tt.tournament_id and t.source_id = (select source_id from meta.source where code = 'spx_database')
  and not exists (select 1 from es_game g join es_club c on c.spx_id in (g.home_team_id, g.away_team_id)
                   where g.league_code || g.year = tt.tournament_id and c.team_id = tt.team_id);

delete from core.soccer_match m using core.soccer_tournament t
where t.tournament_id = m.tournament_id and t.source_id = (select source_id from meta.source where code = 'spx_database') and m.source_id = t.source_id
  and not exists (select 1 from es_season s where s.league_code || s.year = t.tournament_id);
delete from core.soccer_tournament_team tt using core.soccer_tournament t
where t.tournament_id = tt.tournament_id and t.source_id = (select source_id from meta.source where code = 'spx_database')
  and not exists (select 1 from es_season s where s.league_code || s.year = t.tournament_id);
delete from core.soccer_tournament t
where t.source_id = (select source_id from meta.source where code = 'spx_database') and t.league_code in (select league_code from es_league)
  and not exists (select 1 from es_season s where s.league_code || s.year = t.tournament_id)
  and not exists (select 1 from core.soccer_match m where m.tournament_id = t.tournament_id);

-- clubs and leagues this step made earlier that no listed season uses any more
delete from core.soccer_team t
where t.source_key like 'spx:team:%' and t.source_id = (select source_id from meta.source where code = 'spx_database')
  and not exists (select 1 from core.soccer_tournament_team x where x.team_id = t.team_id)
  and not exists (select 1 from core.soccer_match m where t.team_id in (m.home_team_id, m.away_team_id));
delete from ref.soccer_league_system s
where s.league_code in (select league_code from es_league)
  and not exists (select 1 from core.soccer_tournament t where t.league_code = s.league_code);
delete from ref.league_name n
where n.league_code in (select league_code from es_league)
  and not exists (select 1 from core.soccer_tournament t where t.league_code = n.league_code);
delete from ref.league l
where l.league_code in (select league_code from es_league)
  and not exists (select 1 from core.soccer_tournament t where t.league_code = l.league_code);

-- ---------------------------------------------------------------- what the data says about itself

delete from meta.data_issue where source_id = (select source_id from meta.source where code = 'spx_database') and entity_kind = 'soccer_season';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'soccer_season', s.league_code || s.year,
       format('SPX scheduled %s matches and recorded a final score for %s', s.scheduled, s.scored),
       'Only the matches with a final score are listed; the season is marked incomplete'
from es_season s where s.scored < s.scheduled;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'soccer_season', s.league_code || s.year || ':left_out',
       format('%s SPX fixtures filed under this league season are between clubs that do not play in it', s.left_out),
       'Left out'
from es_season s where s.left_out > 0;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'soccer_season', 'duplicates',
       format('%s SPX fixtures repeat a date and pair of clubs', (select count(*) from es_game0) - (select count(*) from
         (select 1 from es_game0 group by d, home_team_id, away_team_id) z)),
       'One row kept, the one with a score'
where (select count(*) from es_game0) > (select count(*) from (select 1 from es_game0 group by d, home_team_id, away_team_id) z);

-- a club in two leagues of one season would be a mis-filed fixture
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_database'), 'soccer_season', 'club:' || c.team_id || ':' || x.year,
       'Club has SPX fixtures in two leagues of one season: ' || x.leagues, 'Both kept; check against a reference source'
from (select spx_id, year, string_agg(distinct league_code, ', ') as leagues
        from (select home_team_id spx_id, year, league_code from es_game union all select away_team_id, year, league_code from es_game) u
       group by spx_id, year having count(distinct league_code) > 1) x
join es_club c on c.spx_id = x.spx_id;

commit;

select 'soccer europe', format('%s leagues, %s seasons, %s clubs, %s matches',
  (select count(*) from ref.soccer_league_system),
  (select count(*) from core.soccer_tournament t where t.source_id = (select source_id from meta.source where code = 'spx_database')),
  (select count(*) from core.soccer_team where source_key like 'spx:team:%'),
  (select count(*) from core.soccer_match where source_key like 'eu-%'));
