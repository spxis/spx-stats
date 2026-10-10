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
