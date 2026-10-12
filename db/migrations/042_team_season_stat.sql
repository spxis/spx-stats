-- Season-level team statistics: one row per team season (and phase) with a few figures in jsonb, like core.player_season_stat.
-- NHL (NHL API): pp_pct, pk_pct (percent), pim, shots_for_pg, shots_against_pg. MLB (Lahman): ab, h, avg, hr, bb, so, r, ra, er, era, sv.
-- NFL (nflverse): yds, yds_against, pass_yds, rush_yds. Small by design (about 6,000 rows); core.team_game_stat stays for per-game figures.
create table if not exists core.team_season_stat (
  team_season_id integer not null references core.team_season on delete cascade,
  phase          core.season_phase not null default 'regular',
  games_played   smallint,
  stats          jsonb not null,
  source_id      smallint not null references meta.source,
  primary key (team_season_id, phase, source_id)
);
comment on table core.team_season_stat is 'A club''s season totals and rates (power play %, penalty minutes, batting average, ERA, yards ...) as the source publishes them. Built by db/build/185_team_season_stat.sql.';

create or replace view api.team_season_stat as
select t.team_season_id,
       s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       t.phase,
       t.games_played,
       t.stats,
       src.code as source
from core.team_season_stat t
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join meta.source src on src.source_id = t.source_id;

grant select on api.team_season_stat to anon, authenticated;
