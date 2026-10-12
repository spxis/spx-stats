-- Raw season-level team statistics as published: NHL API team summary and penalties, nflverse weekly team stats. For the working copy and DS1 only
-- (production has no legacy_* schemas). Read by db/build/185_team_season_stat.sql.
create schema if not exists legacy_team_stats;
comment on schema legacy_team_stats is 'Season-level team statistics as published: NHL API team summary and penalties, nflverse weekly team stats.';

create table if not exists legacy_team_stats.nhl_team_season (
  season_id  integer not null,
  endpoint   text not null check (endpoint in ('summary', 'penalties')),
  team_id    integer not null,
  team_name  text not null,
  row        jsonb not null,
  primary key (season_id, endpoint, team_id)
);

create table if not exists legacy_team_stats.nflverse_team_week (
  season          smallint not null,
  week            smallint not null,
  team            text not null,
  season_type     text not null,
  game_id         text,
  opponent_team   text,
  passing_yards   integer,
  rushing_yards   integer,
  sack_yards_lost integer,
  primary key (season, week, team, season_type)
);
