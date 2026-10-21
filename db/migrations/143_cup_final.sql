-- The Stanley Cup Final of each year from 1915, from English Wikipedia (CC BY-SA 4.0; legacy_wikipedia_stanley_cup_final, migration 142). Why: the game
-- rows of the NHL's finals in core.game come from the NHL API (a source that may be read to confirm, never republished), so the open record of a final is
-- its own pair of tables:
--   * core.cup_final: one row per final (teams, games won, dates, format, the Conn Smythe winner, who scored the Cup winner), key cup_year.
--   * core.cup_final_game: one row per game (day, each team's score, overtime periods, arena and city, which team was at home), key (cup_year, game_no).
-- The keys are the year and the game number, so a rebuild changes no id. A final points at core.cup_series (1915-1926), at the NHL season it is part of
-- (1918 on), at the two clubs' franchises and team seasons, and at the Conn Smythe row of core.award_winner; a game points at the core.game that holds the
-- same game when the two clubs' playoff games there are exactly as many as the article lists. Nothing in core.game is written or copied.
-- Built by db/build/223_cup_final.sql. Add-only, rerunnable. DS1 and production. Documented in docs/stanley-cup-finals.md.
create table if not exists core.cup_final (
  cup_year               smallint primary key,
  cup_series_id          integer references core.cup_series (cup_series_id) on delete set null,
  nhl_season_id          integer references core.season (season_id) on delete set null,
  first_day              date,
  last_day               date,
  dates_text             text,
  format                 text,
  team1_name             text not null,
  team1_league           text,
  team1_franchise_id     integer references core.franchise (franchise_id) on delete set null,
  team1_team_season_id   integer references core.team_season (team_season_id) on delete set null,
  team2_name             text not null,
  team2_league           text,
  team2_franchise_id     integer references core.franchise (franchise_id) on delete set null,
  team2_team_season_id   integer references core.team_season (team_season_id) on delete set null,
  team1_games            smallint,
  team2_games            smallint,
  winner_side            smallint check (winner_side in (1, 2)),   -- null: no winner (1919, the series was stopped by the influenza epidemic)
  conn_smythe_name       text,
  conn_smythe_team       text,
  conn_smythe_award_winner_id bigint references core.award_winner (award_winner_id) on delete set null,
  cup_goal_by            text,
  cup_goal_detail        text,
  source_id              smallint not null references meta.source,
  source_key             text not null
);
comment on table core.cup_final is 'The Stanley Cup Final of each year from 1915, from English Wikipedia (CC BY-SA 4.0). team1/team2 are the infobox order, winner_side says which won.';
create index if not exists cup_final_nhl_season on core.cup_final (nhl_season_id) where nhl_season_id is not null;

create table if not exists core.cup_final_game (
  cup_year          smallint not null references core.cup_final (cup_year) on delete cascade,
  game_no           smallint not null,
  played_on         date,
  team1_score       smallint,
  team2_score       smallint,
  overtime_periods  smallint not null default 0,
  home_side         smallint check (home_side in (1, 2)),         -- null: a neutral ground, or the article does not say
  venue_name        text,
  venue_city        text,
  game_id           bigint references core.game (game_id) on delete set null,
  source_id         smallint not null references meta.source,
  source_key        text not null,
  primary key (cup_year, game_no)
);
comment on table core.cup_final_game is 'A game of a Stanley Cup Final from English Wikipedia (CC BY-SA 4.0); game_id is the same game in core.game when the two agree on how many were played.';
create index if not exists cup_final_game_game on core.cup_final_game (game_id) where game_id is not null;

create or replace view api.cup_final as
select f.cup_year as year,
       f.first_day, f.last_day, f.format,
       f.team1_name, f.team1_league, f.team1_franchise_id as team1_franchise,
       f.team2_name, f.team2_league, f.team2_franchise_id as team2_franchise,
       f.team1_games, f.team2_games, f.winner_side,
       f.conn_smythe_name, f.conn_smythe_team, f.cup_goal_by, f.cup_goal_detail,
       (f.nhl_season_id is not null) as in_nhl_season,
       src.code as source
from core.cup_final f join meta.source src on src.source_id = f.source_id;

create or replace view api.cup_final_game as
select g.cup_year as year, g.game_no, g.played_on,
       g.team1_score, g.team2_score, g.overtime_periods, g.home_side,
       g.venue_name, g.venue_city, g.game_id,
       src.code as source
from core.cup_final_game g join meta.source src on src.source_id = g.source_id;

grant select on api.cup_final, api.cup_final_game to anon, authenticated;
