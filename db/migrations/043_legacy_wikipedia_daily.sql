-- Daily scores from English Wikipedia (CC BY-SA 4.0) and nflverse (CC BY 4.0), read by scripts/daily/run.py --apply.
-- Raw first, as it came: every page revision used (page, with the exact wikitext kept in legacy_files.raw_archive), every
-- game row parsed from it (claim), and the games the claims were paired into and cross-checked as (game). The core games
-- are built from these by db/build/152_games_from_wikipedia_daily.sql.
-- DS1 only: legacy_* schemas are not published to production. Rerunnable (create ... if not exists).
-- The archive of raw downloads (scripts/archive_raw.py fills it) exists on DS1 already; a fresh database gets it here.
create schema if not exists legacy_files;
create table if not exists legacy_files.raw_archive (name text primary key, saved_on date not null, sha256 text not null, data bytea not null);

create schema if not exists legacy_wikipedia_daily;
comment on schema legacy_wikipedia_daily is 'Game scores read from the NHL, NBA, MLB, NFL and CFL clubs'' season articles on en.wikipedia.org (CC BY-SA 4.0) and from nflverse (CC BY 4.0), by scripts/daily.';

-- One row per page revision used. A club's season article is a page; so is the MLB postseason article; so is the
-- season's slice of nflverse's games.csv (its rows verbatim, with the file's header line).
create table if not exists legacy_wikipedia_daily.page (
  page_id       integer generated always as identity primary key,
  source        text not null check (source in ('wikipedia', 'nflverse')),
  league        text not null check (league in ('nhl', 'nba', 'mlb', 'nfl', 'cfl')),
  season        smallint not null,                       -- start year of the season
  kind          text not null check (kind in ('team', 'league', 'file')),
  title         text not null,                           -- the article's title; 'games.csv' for nflverse
  club          text,                                    -- a club's article: the club's current full name
  revision      text not null,                           -- Wikipedia revision id; for nflverse the sha256 of the season's rows
  revision_at   timestamptz,                             -- when that revision was saved on Wikipedia
  sha256        text not null,                           -- of the bytes kept in the archive
  bytes         integer not null,
  archive_name  text not null references legacy_files.raw_archive (name),
  fetched_at    timestamptz not null,
  loaded_at     timestamptz not null default now(),
  unique (source, title, revision)
);
comment on table legacy_wikipedia_daily.page is 'A page revision as downloaded; its exact bytes are legacy_files.raw_archive.data under archive_name. Wikipedia: authors are each article''s history.';

-- One row per game row of a page, as the parser read it (clubs already matched to their current full names).
create table if not exists legacy_wikipedia_daily.claim (
  claim_id      bigint generated always as identity primary key,
  page_id       integer not null references legacy_wikipedia_daily.page on delete cascade,
  row_no        integer not null,                        -- order read from the page
  game_date     date not null,
  teams         text[] not null,                         -- the two clubs
  home          text,                                    -- null when the page does not say who hosted
  score         jsonb,                                   -- {club: points}; null until played
  status        text not null check (status in ('final', 'scheduled', 'postponed', 'cancelled', 'suspended')),
  phase         text not null,                           -- regular, playoffs (preseason rows are read and kept too)
  round         text,
  neutral       boolean not null default false,
  overtime      boolean,
  shootout      boolean,
  ot_periods    smallint,
  doubleheader  smallint,
  inconsistent  text,                                    -- the row contradicts itself (colour against score)
  src           text,                                    -- the table row's text
  unique (page_id, row_no)
);
create index if not exists claim_page_idx on legacy_wikipedia_daily.claim (page_id);

-- The latest paired and cross-checked games of each league-season, replaced whole on every run.
create table if not exists legacy_wikipedia_daily.game (
  source_key    text primary key,                        -- wpdaily:<league>:<season>:<phase>:<date>:<home>:<away>:<n>
  league        text not null,
  season        smallint not null,
  phase         text not null,
  round         text,
  game_date     date not null,
  home_name     text not null,                           -- current full club names; with home_known false the order means nothing
  away_name     text not null,
  home_known    boolean not null,
  neutral       boolean not null,
  status        text not null,
  home_score    smallint,
  away_score    smallint,
  overtime      boolean,
  shootout      boolean,
  ot_periods    smallint,
  doubleheader  smallint,
  confidence    text not null check (confidence in ('confirmed', 'single', 'resolved', 'disputed', 'scheduled')),
  dissent       text[] not null default '{}',            -- what the sources that lost say
  notes         text[] not null default '{}',
  sources       text[] not null,
  provenance    text[] not null,                         -- '<page title>@<revision>' of every claim behind the game
  built_at      timestamptz not null default now()
);
create index if not exists game_league_season_idx on legacy_wikipedia_daily.game (league, season);
comment on table legacy_wikipedia_daily.game is 'confirmed: two or more sources agree. single: one source. resolved: sources differ but nflverse agrees with a club page. disputed: sources differ, nothing applied.';
