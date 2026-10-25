-- Raw loads of the grey and green sources that scripts/grey/ reads (cfbd, hockeytech, wnba_stats), as parsed: one table of games each, one row per game,
-- replaced by its own key on a rerun. Provenance in source_key ('cfbd:<id>', 'hockeytech:<league>:<id>', 'wnba_stats:<id>'). The raw answers are archived first
-- (scripts/archive_raw.py); nothing here is built into core yet. DS1 only: legacy schemas are not published to production.
-- Tiers (migration 153): cfbd is green (a free key, credit, no bulk redistribution), hockeytech and wnba_stats are grey (no terms found; wnba_stats is on hold
-- until John decides, scripts/grey/common.py HOLDS). Never the PWHL (client_code pwhl is refused). Add-only, rerunnable. Needs migration 153.
create schema if not exists legacy_cfbd;
comment on schema legacy_cfbd is 'CollegeFootballData.com games (green: free key, credit "College football data from CollegeFootballData.com", no bulk redistribution).';
create table if not exists legacy_cfbd.game (
  game_id          bigint primary key,
  season           smallint not null,
  week             smallint,
  season_type      text,
  start_date       timestamptz,
  completed        boolean,
  neutral_site     boolean,
  conference_game  boolean,
  attendance       integer,
  venue_id         integer,
  venue            text,
  home_id          integer,
  home_team        text not null,
  home_conference  text,
  home_points      smallint,
  away_id          integer,
  away_team        text not null,
  away_conference  text,
  away_points      smallint,
  fetched_on       date not null,
  source_key       text not null unique
);

create schema if not exists legacy_hockeytech;
comment on schema legacy_hockeytech is 'HockeyTech league feeds other than the PWHL (grey area: no terms found, backup or cross-check only).';
create table if not exists legacy_hockeytech.game (
  client_code  text not null check (client_code in ('ahl', 'echl', 'ohl', 'whl', 'lhjmq')),
  game_id      text not null,
  season_id    text,
  game_date    date not null,
  home_team    text not null,
  away_team    text not null,
  home_goals   smallint,
  away_goals   smallint,
  status       text,
  overtime     boolean,
  shootout     boolean,
  venue        text,
  fetched_on   date not null,
  source_key   text not null unique,
  primary key (client_code, game_id)
);

create schema if not exists legacy_wnba_stats;
comment on schema legacy_wnba_stats is 'stats.wnba.com league game log (grey area, on hold until John decides whether the source is red).';
create table if not exists legacy_wnba_stats.game (
  game_id     text primary key,
  season_id   text,
  game_date   date not null,
  home_abbr   text not null,
  home_name   text,
  away_abbr   text not null,
  away_name   text,
  home_pts    smallint not null,
  away_pts    smallint not null,
  fetched_on  date not null,
  source_key  text not null unique
);

insert into meta.source (code, name, kind, licence, attribution, url, tier, terms_note, evidence_url) values
  ('cfbd', 'CollegeFootballData.com', 'api', 'Free API key; credit required; no bulk redistribution', 'College football data from CollegeFootballData.com', 'https://collegefootballdata.com/', 'green',
   'Seeded green by John 2026-10-19; a key is needed.', 'https://collegefootballdata.com/'),
  ('hockeytech', 'HockeyTech league feeds (not the PWHL)', 'api', 'No terms found', null, 'https://lscluster.hockeytech.com/', 'grey',
   'Grey for leagues other than the PWHL only; the PWHL is never fetched.', null),
  ('wnba_stats', 'stats.wnba.com', 'api', 'No terms found; the WNBA Terms of Use bar database use of NBA Statistics', null, 'https://stats.wnba.com/', 'grey',
   'On hold until John decides whether this makes it red.', 'https://www.wnba.com/terms-of-use')
on conflict (code) do nothing;
