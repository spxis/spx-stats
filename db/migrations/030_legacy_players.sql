-- Raw player data, local only (legacy_* never goes to production).
--  legacy_nhlapi.player_season  the NHL's skater and goalie season summaries (api.nhle.com/stats/rest/en), one row per
--                               player, season, game type and club (scripts/players/nhl_fetch.py, nhl_load.py).
--  legacy_people.resume_claim   P54 (teams), P69 (educated at) and P647 (drafted by) statements of the people we hold,
--                               with their dates and draft qualifiers (scripts/players/resume_fetch.py, resume_load.py).
--  legacy_people.resume_item    the clubs, schools and leagues those statements name: label, kinds, league, sport, country.
-- legacy_lahman is made by scripts/players/lahman_load.py (the Lahman database, every column text).
create table if not exists legacy_nhlapi.player_season (
  season     smallint not null,           -- the year the season starts: 2023 is 2023-24
  game_type  smallint not null,           -- 2 regular season, 3 playoffs
  kind       text     not null,           -- skater | goalie
  team_abbrev text    not null,           -- the NHL's tricode for the club; 'TOT' is not stored
  player_id  bigint   not null,           -- the NHL's player id
  full_name  text     not null,
  position   text,                        -- C, L, R, D (skaters); G
  hand       text,                        -- shoots or catches: L, R
  stats      jsonb    not null,           -- the API's row, as received
  primary key (season, game_type, kind, team_abbrev, player_id)
);

create table if not exists legacy_people.resume_claim (
  qid        text not null,
  prop       text not null,               -- P54 | P69 | P647
  n          smallint not null,
  rank       text,
  value_qid  text,
  start_on   date, start_prec smallint,
  end_on     date, end_prec smallint,
  point_on   date, point_prec smallint,   -- P585, the draft date
  ranking    numeric,                     -- P1352, the overall pick
  ordinal    text,                        -- P1545, the round or order
  primary key (qid, prop, n)
);

create table if not exists legacy_people.resume_item (
  qid        text primary key,
  label      text,
  kinds      text[],                      -- P31 and P279 values
  league_qid text,                        -- P118
  sport_qid  text,                        -- P641
  country_qid text                        -- P17
);
