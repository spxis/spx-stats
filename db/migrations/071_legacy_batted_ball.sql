-- Retrosheet batted balls with a hit location (DS1 and the working copy only: production has no legacy_* schemas).
-- Source: Retrosheet's play-by-play event files, events/<year>eve.zip (regular season), <year>post.zip and <year>as.zip, 1986-2025, parsed by
-- scripts/retrosheet/events.py. Retrosheet's notice: "The information used here was obtained free of charge from and is copyrighted by
-- Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org."
--
--   legacy_retrosheet.batted_ball           one row per batted ball in play whose play carries a trajectory and a zone code (about 4.0 million
--                                           rows, 1986-2025). Retrosheet ids are kept; db/build/202_batted_ball.sql maps them to core.
--   legacy_retrosheet.batted_ball_coverage  per season and game type: plays, balls in play, with a trajectory, with a zone code, located on
--                                           one of the 68 zones. Dense from 1989 (about 90% of balls in play 1989-1999, 95% or more 2000-2025);
--                                           1986-88 are partial (16%, 12% and 44% of balls in play). Anything the table does not hold is a hole, not a zero.
-- Load order and commands: the comment at the top of db/build/202_batted_ball.sql.
create schema if not exists legacy_retrosheet;

create table if not exists legacy_retrosheet.batted_ball (
  game_id    text not null,         -- Retrosheet game id: home team, date, game number (BAL198704060)
  seq        integer not null,      -- the number of the play in its game (NP lines not counted)
  season     smallint not null,
  game_type  text not null check (game_type in ('regular', 'post', 'allstar')),
  inning     smallint not null,
  half       smallint not null check (half in (0, 1)),   -- 0 the visitors bat, 1 the home team
  batter     text not null,         -- Retrosheet player id (mcdoo001)
  pitcher    text,                  -- the fielding team's pitcher at the time
  bat_team   text,                  -- Retrosheet team id (TEX)
  fld_team   text,
  result     text not null check (result in ('out', 'single', 'double', 'triple', 'home_run', 'error', 'fielders_choice')),
  traj       text not null check (traj in ('G', 'L', 'F', 'P', 'BG', 'BP', 'BL')),   -- ground ball, line drive, fly ball, pop-up; B = bunt
  zone       text,                  -- one of Retrosheet's 68 zones (ref.hit_zone); null when the code has no sure place on the diagram
  zone_raw   text,                  -- the code as the file writes it, when it is not the same as zone (7M, 8LD, 13S, 78XDW, 3L...)
  bat_hand   text check (bat_hand in ('L', 'R')),        -- the side the batter hit from (a switch hitter against the pitcher's hand)
  pit_hand   text check (pit_hand in ('L', 'R', 'B')),
  sac        text check (sac in ('SF', 'SH')),           -- sacrifice fly or hit
  dp         boolean not null,      -- the play was a double or triple play
  primary key (game_id, seq)
);
comment on table legacy_retrosheet.batted_ball is 'Batted balls in play that carry a trajectory and a hit-location zone in Retrosheet''s event files, 1986-2025. Ids are Retrosheet''s.';
comment on column legacy_retrosheet.batted_ball.zone is 'Retrosheet''s 68-zone diagram (retrosheet.org/location.htm); codes the diagram does not draw are mapped to the zone they refine, the original in zone_raw.';

create table if not exists legacy_retrosheet.batted_ball_coverage (
  season          smallint not null,
  game_type       text not null,
  plays           integer not null,      -- plays of the season's event files (no-play lines excluded)
  balls_in_play   integer not null,      -- singles, doubles, triples, home runs, errors, fielder's choices and outs on a fielder's play
  with_trajectory integer not null,
  with_zone       integer not null,      -- a trajectory followed by a zone code of any kind
  located         integer not null,      -- the zone is one of the 68
  primary key (season, game_type)
);
comment on table legacy_retrosheet.batted_ball_coverage is 'How much of each season''s balls in play carry a trajectory and a zone in the event files; the rest are holes.';
