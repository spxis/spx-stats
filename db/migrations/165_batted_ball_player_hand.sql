-- A player's located MLB batted balls split by the side the batter hit from, for the player page's spray charts and its pull / centre / opposite-field shares.
-- DS1 and the working copy only; production never holds it, because the pages read it from Turso (core.batted_ball_player_hand is a Turso table,
-- scripts/release/turso.py). Add-only.
--
-- core.batted_ball_player (migration 072) packs a player's balls by zone and result for a season but not the batter's side, so a switch hitter cannot be split
-- and a pitcher's balls cannot be told as pulled or not. This table has one row for each player, season, role and side: the same packing, the rows of the two
-- sides of one player-season adding up to that table's row (db/checks/105). The side is Retrosheet's (legacy_retrosheet.batted_ball.bat_hand: the side the batter
-- hit from in that at-bat, which for a switch hitter follows the pitcher's hand). `year` is the season's start year, so Turso needs no core.season.
-- Packing: the top of migration 072 (cells and traj). Filled by db/build/237_batted_ball_player_hand.sql.
create table if not exists core.batted_ball_player_hand (
  person_id  bigint not null references core.person on delete cascade,
  season_id  integer not null references core.season on delete cascade,
  year       smallint not null,
  role       text not null check (role in ('bat', 'pit')),    -- bat: balls he hit; pit: balls hit against him. Regular season only
  bat_hand   text not null check (bat_hand in ('L', 'R')),    -- the side the batter hit from
  n          integer not null,
  traj       bytea not null,
  cells      bytea not null,
  source_id  smallint not null references meta.source,
  primary key (person_id, season_id, role, bat_hand)
);
comment on table core.batted_ball_player_hand is 'A player''s located MLB regular-season batted balls, as a batter (bat) and as a pitcher (pit), split by the side the batter hit from: counts by hit-location zone and result, packed in cells. A Turso table (never production).';

-- For a local preview of DS1 (the site reads Turso when TURSO_DATABASE_URL is set, else this view): the packed bytes as hex, which is how Turso holds them.
create or replace view api.batted_ball_player_hand as
select person_id, year, role, bat_hand, n, encode(traj, 'hex') as traj, encode(cells, 'hex') as cells from core.batted_ball_player_hand;
grant select on api.batted_ball_player_hand to anon, authenticated;
