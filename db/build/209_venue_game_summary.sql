-- Games played at each venue, by league and season, and the games of each season's final (migration 083): core.venue_game_season and core.venue_final_game,
-- built from api.venue_game (migrations 067, 073, 075). Run from the repo root, as scripts/build_core.sh does, after step 199 (game venues). Rerunnable: both
-- tables are emptied and rebuilt. Rerun it after a season is loaded or scores change, then release both tables (AGENTS.md section 8, item 5).
--
-- A game counts when it was played (status final). A season's final is found as step 165 finds the champion: the games between the two teams of the season's
-- last playoff game (the NFL and CFL: that game alone), and only in a season that has a championship on record in core.award_winner.
begin;

create temp table venue_final as
with po as (
  select g.game_id, g.season_id, g.game_date, g.home_team_season_id h, g.away_team_season_id a, s.league_code
  from core.game g join core.season s using (season_id)
  where g.phase = 'playoffs' and g.status <> 'cancelled'
), last_game as (
  select distinct on (season_id) season_id, league_code, game_id as last_id, h, a
  from po order by season_id, game_date desc, game_id desc
)
select p.game_id, p.season_id
from last_game l
join po p on p.season_id = l.season_id and ((p.h = l.h and p.a = l.a) or (p.h = l.a and p.a = l.h))
where (l.league_code not in ('nfl', 'cfl', 'afl', 'aafc') or p.game_id = l.last_id)
  and exists (select 1 from core.award_winner w join core.award aw on aw.award_id = w.award_id and aw.kind = 'championship' where w.season_id = l.season_id);
create unique index on venue_final (game_id);

delete from core.venue_final_game;
delete from core.venue_game_season;

insert into core.venue_game_season (venue_id, league_code, season_id, games, regular_games, playoff_games, final_games, first_date, last_date)
select vg.venue_id, vg.league, vg.season_id,
       count(*),
       count(*) filter (where vg.phase = 'regular'),
       count(*) filter (where vg.phase = 'playoffs'),
       count(f.game_id),
       min(vg.game_date), max(vg.game_date)
from api.venue_game vg
left join venue_final f on f.game_id = vg.game_id
where vg.venue_id is not null and vg.status = 'final'
group by vg.venue_id, vg.league, vg.season_id;

insert into core.venue_final_game (game_id, venue_id, season_id)
select vg.game_id, vg.venue_id, vg.season_id
from api.venue_game vg
join venue_final f on f.game_id = vg.game_id
where vg.venue_id is not null and vg.status = 'final';

select 'venue game seasons' as what, count(*) as n from core.venue_game_season
union all select '  venues', count(distinct venue_id) from core.venue_game_season
union all select '  games', sum(games) from core.venue_game_season
union all select '  final games', sum(final_games) from core.venue_game_season
union all select 'venue final games', count(*) from core.venue_final_game;

commit;
