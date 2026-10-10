-- Player season stats from the spx-stats MongoDB of 2015 (Yahoo season
-- tables scraped and parsed by spx-stats). Only the parsed rows are kept, one
-- per player per page, from the latest snapshot of each page: no pages, no
-- HTML. Member collections (users, mailing-list) are never copied.
create schema if not exists legacy_mongo;
comment on schema legacy_mongo is 'Stats parsed by spx-stats/spxn and kept in MongoDB (2013-2015). Only the parsed rows; member data is not here.';

create table legacy_mongo.player_season_stat (
  sport         text not null,
  season_year   integer not null,
  season_type   text not null,
  stat_type     text not null,
  player_key    text not null,
  player_name   text,
  team_key      text,
  stats         jsonb not null,
  as_of         date not null,
  source_note   text,
  source_url    text,
  _seen_in      text[] not null,
  primary key (sport, season_year, season_type, stat_type, player_key, team_key)
);
comment on table legacy_mongo.player_season_stat is 'A player''s season line as spx-stats last parsed it (as_of), from the page named in source_url.';

-- 2012-13 games and player box-score lines from the spxn MongoDB of
-- 2013-07-29 (parsed from Yahoo scoreboards and box scores by spxn's scraper).
create table legacy_mongo.game (
  sport          text not null,
  season         text not null,
  season_type    text not null,
  source_gameid  text not null,
  game_date      date,
  home_team      text,
  away_team      text,
  home_score     integer,
  away_score     integer,
  status         text,
  is_overtime    boolean,
  is_shootout    boolean,
  is_cancelled   boolean,
  source_url     text,
  _seen_in       text[] not null,
  primary key (sport, source_gameid)
);
comment on table legacy_mongo.game is 'spxn games: a score as spxn parsed it from the scoreboard in source_url.';

create table legacy_mongo.player_game_stat (
  sport          text not null,
  season         text not null,
  season_type    text not null,
  source_gameid  text not null,
  game_date      date,
  team           text,
  opponent       text,
  player_key     text not null,
  player_name    text,
  full_name      text,
  stats          jsonb not null,
  source_url     text,
  _seen_in       text[] not null,
  primary key (sport, source_gameid, player_key, stats)
);
comment on table legacy_mongo.player_game_stat is 'spxn player box-score lines; stats holds the columns spxn parsed, named as in its header.';
