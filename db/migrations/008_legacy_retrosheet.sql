-- Retrosheet game logs (MLB 1871 on, regular season and postseason) and its
-- team list, exactly as published. Retrosheet's notice: "The information used
-- here was obtained free of charge from and is copyrighted by Retrosheet.
-- Interested parties may contact Retrosheet at www.retrosheet.org."
create schema if not exists legacy_retrosheet;
comment on schema legacy_retrosheet is 'Retrosheet (www.retrosheet.org) game logs and team list, as published.';

create table legacy_retrosheet.game_log (
  game_date       date not null,
  game_number     text not null,       -- 0 single, 1/2/3 of a double- or triple-header, A/B three-team
  game_type       text not null,       -- regular, wildcard, division, lcs, worldseries, allstar, tiebreaker
  visitor         text not null,       -- Retrosheet team id, e.g. NYA
  visitor_league  text,
  visitor_game    integer,
  home            text not null,
  home_league     text,
  home_game       integer,
  visitor_score   integer,
  home_score      integer,
  outs            integer,
  day_night       text,
  completion      text,
  forfeit         text,
  protest         text,
  park_id         text,
  attendance      integer,
  minutes         integer,
  fields          text[] not null,     -- all 161 fields of the line, as published
  source_file     text not null,
  primary key (game_date, home, visitor, game_number, game_type)
);

create table legacy_retrosheet.team (
  team_id       text not null,         -- e.g. NYA (HOU is listed once for each league)
  league        text,
  city          text,
  nickname      text,
  first_year    integer,
  last_year     integer,
  primary key (team_id, league)
);

create table legacy_retrosheet.current_name (
  franchise_id  text not null,         -- the current franchise's id, e.g. ANA
  team_id       text not null,         -- the id the team played under then
  league        text,
  division      text,
  city          text,
  nickname      text,
  alt_nickname  text,
  first_game    date,
  last_game     date,
  home_city     text,
  home_state    text,
  primary key (franchise_id, team_id, first_game)
);
