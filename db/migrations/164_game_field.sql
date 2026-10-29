-- The plays of a game, drawn on the game's own field: where each MLB batted ball went (Retrosheet's hit-location zones) and each NFL drive
-- (nflverse). DS1 and the working copy only; production never holds any of it, because the pages read it from Turso (core.game_field is a
-- Turso table, scripts/release/turso.py) and production is too small for a row per game. Add-only.
--
--   legacy_nflverse.pbp_drive  one row per drive of nflverse's play-by-play (pbp release, play_by_play_<year>.csv.gz, 1999-2025), loaded by
--                              scripts/nflverse/pbp_drive.py. nflverse's notice: "nflverse (CC BY 4.0), data from NFL.com". Ids are nflverse's.
--   core.game_field            one row per game and kind, a few hundred bytes to a few kilobytes of compact text that the game page draws:
--                              'mlb_balls' (db/build/235, from legacy_retrosheet.batted_ball, migration 071) and 'nfl_drives' (db/build/236).
--                              The text formats are written at the top of each build step and read by web/src/lib/fieldPlays.ts.
--   api.game_field             the same rows for a local preview of DS1 (the site reads Turso when TURSO_DATABASE_URL is set, else this view).

create schema if not exists legacy_nflverse;

create table if not exists legacy_nflverse.pbp_drive (
  game_id       text not null,            -- nflverse game id (season_week_away_home)
  drive         smallint not null,        -- nflverse's drive number in the game
  season        smallint not null,
  week          smallint,
  season_type   text not null check (season_type in ('REG', 'POST')),
  posteam       text,                     -- the club with the ball (nflverse's current codes)
  defteam       text,
  posteam_type  text not null check (posteam_type in ('home', 'away')),
  qtr           smallint,                 -- the quarter it began in (5 is overtime)
  clock         text,                     -- the game clock when it began, mm:ss
  top_secs      smallint,                 -- time of possession in seconds
  plays         smallint,                 -- nflverse's play count (penalties and no-plays included)
  first_downs   smallint,
  result        text,                     -- nflverse's fixed_drive_result: Touchdown, Field goal, Missed field goal, Punt, Turnover, Turnover on downs, End of half, Safety, Opp touchdown
  scored        boolean,                  -- the drive ended with a score
  start_yd      smallint,                 -- yards from the opponent's end line at its first scrimmage play (the line of scrimmage)
  end_yd        smallint,                 -- the same where it ended: 0 for a touchdown, the line of scrimmage of a kick, a turnover or the last play
  los           text,                     -- the line of scrimmage of each pass, run, kneel, spike, field goal and punt of the drive, in order, space separated
  primary key (game_id, drive)
);
comment on table legacy_nflverse.pbp_drive is 'NFL drives from nflverse play-by-play (pbp release), 1999-2025. CC BY 4.0, data from NFL.com. Ids are nflverse''s.';
comment on column legacy_nflverse.pbp_drive.los is 'Yards from the opponent''s end line at the start of each scrimmage play of the drive; the first is start_yd.';

create table if not exists core.game_field (
  game_id  bigint not null references core.game on delete cascade,
  kind     text not null check (kind in ('mlb_balls', 'nfl_drives')),
  season   smallint not null,            -- the season of the game (the park's fence and the field's markings are those of the year)
  n        smallint not null,            -- how many marks: balls in play, drives
  data     text not null,                -- the marks as compact text (the format is at the top of the build step)
  primary key (game_id, kind)
);
comment on table core.game_field is 'What the game page draws on the game''s field: MLB batted balls by Retrosheet zone and NFL drives. A Turso table (never production).';

create or replace view api.game_field as select game_id, kind, season, n, data from core.game_field;
grant select on api.game_field to anon, authenticated;
