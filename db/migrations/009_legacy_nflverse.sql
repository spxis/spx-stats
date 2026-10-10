-- nflverse's NFL games (1999 on, regular season and playoffs), as published
-- in nflverse/nfldata games.csv. nflverse data is licensed CC BY 4.0.
create schema if not exists legacy_nflverse;
comment on schema legacy_nflverse is 'nflverse (github.com/nflverse) NFL data, as published. CC BY 4.0.';
create table legacy_nflverse.game (
  game_id      text primary key,        -- e.g. 1999_01_MIN_ATL
  season       integer not null,
  game_type    text not null,           -- REG, WC, DIV, CON, SB
  week         integer,
  gameday      date not null,
  gametime     text,
  away_team    text not null,
  away_score   integer,
  home_team    text not null,
  home_score   integer,
  location     text,                    -- Home or Neutral
  overtime     boolean,
  stadium      text,
  row          jsonb not null           -- every column of the line, as published
);

create table legacy_nflverse.team (
  season     integer not null,
  team       text not null,             -- nflverse code, e.g. LV
  full_name  text not null,
  location   text,
  nickname   text,
  row        jsonb not null,
  primary key (season, team)
);
