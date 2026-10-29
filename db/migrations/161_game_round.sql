-- api.game_round: the name a game carries beyond its date: a bowl game (Rose Bowl), a College Football Playoff semifinal, a conference
-- championship game, the national championship game. core.game.round_label holds it for college football (db/build/230); no other league
-- fills it, so the view is small (about 1,100 rows for 26 seasons). api.games is unchanged. Add-only: a new view, nothing dropped or replaced.
-- Read by league and year (the season page's postseason) or by game_id (a game's page). Rerunnable.

create or replace view api.game_round as
select s.league_code as league, s.start_year as year, g.game_id, g.round_label
from core.game g
join core.season s using (season_id)
where g.round_label is not null and g.status <> 'cancelled';

comment on view api.game_round is 'One row per game that has a round label: a bowl game, a playoff round or a conference championship game of college football. Not every game of a postseason has one, and a league with no named rounds has none.';
grant select on api.game_round to anon, authenticated;
