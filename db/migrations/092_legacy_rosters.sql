-- The players of a league's clubs as Wikidata (CC0) answers: who has a "member of sports team" (P54) statement for a club of the league, the
-- statements about each of them (birth and death, birthplace, citizenship, height, position, hand, teams with their dates), and the
-- places, countries and positions those name. One row per item and one per statement, in the shape of legacy_people (025), kept apart
-- from it because scripts/people/load.py replaces legacy_people whole. core is filled by db/build/179_players_wikidata.sql.
-- Fetch: scripts/rosters/wd_fetch.py; load: scripts/rosters/wd_load.py (archives the raw answers in legacy_files.raw_archive).
-- Nothing about ethnicity, religion, health, sex or gender, family or politics is fetched or stored. Add-only; rerunnable.
create schema if not exists legacy_rosters;
comment on schema legacy_rosters is 'Players of the NBA and CFL clubs, their facts and teams, from Wikidata (CC0). Loaded by scripts/rosters/wd_load.py.';

create table if not exists legacy_rosters.item (
  qid          text primary key,
  label        text,
  enwiki_title text,
  fetched_on   date not null
);

create table if not exists legacy_rosters.redirect (
  from_qid text primary key,
  to_qid   text not null
);

create table if not exists legacy_rosters.claim (
  qid        text not null,
  prop       text not null,
  n          smallint not null,
  rank       text,
  value_qid  text,
  value_on   date,
  value_prec smallint,
  value_num  numeric,
  unit_qid   text,
  value_lat  double precision,
  value_lon  double precision,
  value_text text,
  start_on   date, start_prec smallint,
  end_on     date, end_prec   smallint,
  point_on   date, point_prec smallint,
  primary key (qid, prop, n)
);
create index if not exists wd_roster_claim_prop_idx on legacy_rosters.claim (prop, value_qid);

-- The clubs of each league (a club's Wikidata item and English label) and the players listed for them.
create table if not exists legacy_rosters.league_team (
  league_code text not null,
  team_qid    text not null,
  label       text,
  primary key (league_code, team_qid)
);

create table if not exists legacy_rosters.league_player (
  league_code text not null,
  qid         text not null,
  queried_on  date not null,
  primary key (league_code, qid)
);

-- The rosters English Wikipedia (CC BY-SA 4.0) gives each club season: one row per player listed in the article's Roster section (src
-- 'roster') or its first Player statistics table (src 'stats'), as parsed by scripts/rosters/wp_parse.py. page_title and revid cite the
-- article revision each row was read from. link_title is the article the name links to; wp_title says which Wikidata item that article is.
create table if not exists legacy_rosters.wp_article (
  league_code text not null,
  season      smallint not null,           -- first year of the season
  club        text not null,               -- the club's name that season, as asked for
  page_title  text not null,
  revid       bigint,
  revised_at  timestamptz,           -- the revision's timestamp
  missing     boolean not null default false,
  has_roster  boolean not null default false,
  has_stats   boolean not null default false,
  primary key (league_code, season, club)
);

create table if not exists legacy_rosters.wp_roster (
  league_code text not null,
  season      smallint not null,
  club        text not null,
  src         text not null check (src in ('roster', 'stats')),
  ord         smallint not null,
  name        text not null,
  link_title  text,
  number      text,
  pos         text,
  dob         date,
  height_in   smallint,
  weight_lb   smallint,
  college     text,
  note        text,
  primary key (league_code, season, club, src, ord)
);

create table if not exists legacy_rosters.wp_title (
  title          text primary key,         -- a link title as the article names it
  resolved_title text,                     -- after redirects
  qid            text,
  disambiguation boolean not null default false,
  missing        boolean not null default false
);
