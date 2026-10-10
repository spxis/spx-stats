-- The NHL's public web API (api-web.nhle.com/v1): every NHL game since 1917-18
-- (regular season and playoffs) and each season's final standings, as the API
-- publishes them. No licence is published; scores and standings are facts, and
-- the NHL is credited as the source.
create schema if not exists legacy_nhlapi;
comment on schema legacy_nhlapi is 'NHL results and standings from api-web.nhle.com, as published.';

create table legacy_nhlapi.game (
  nhl_game_id       bigint primary key,      -- e.g. 2001020001
  season            text not null,           -- e.g. 20012002
  game_type         smallint not null check (game_type in (2, 3)),   -- 2 regular season, 3 playoffs
  game_date         date not null,           -- the local date the API gives
  away_abbrev       text not null,
  home_abbrev       text not null,
  away_score        smallint,
  home_score        smallint,
  last_period_type  text,                    -- REG, OT or SO
  game_state        text,                    -- FUT, LIVE, FINAL, OFF ...
  venue             text,
  row               jsonb not null           -- the game as published
);
create index nhlapi_game_season_idx on legacy_nhlapi.game (season, game_date);

create table legacy_nhlapi.standing (
  season         text not null,
  as_of          date not null,
  team_abbrev    text not null,
  gp             smallint,
  w              smallint,
  l              smallint,
  ot_losses      smallint,
  ties           smallint,
  points         smallint,
  goals_for      smallint,
  goals_against  smallint,
  home_record    text,                       -- wins-losses-ties-overtime losses, as the API counts them
  road_record    text,
  row            jsonb not null,
  primary key (season, as_of, team_abbrev)
);
