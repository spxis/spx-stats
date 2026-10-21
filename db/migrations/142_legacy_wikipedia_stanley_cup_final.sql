-- The Stanley Cup Final articles of English Wikipedia (CC BY-SA 4.0), 1915 on, as parsed by scripts/stanley_cup_final/parse.py: the infobox of each
-- (final) and its games (game), and what the parser would not take (unparsed: a date that cannot be right, a score the game summary contradicts).
-- Built into core.cup_final / core.cup_final_game by db/build/223_cup_final.sql (migration 143). Add-only, rerunnable.
-- DS1 only: legacy schemas are not published to production. Documented in docs/stanley-cup-finals.md.
create schema if not exists legacy_wikipedia_stanley_cup_final;
comment on schema legacy_wikipedia_stanley_cup_final is 'The Stanley Cup Final articles of English Wikipedia (1915 on) as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_stanley_cup_final.final (
  cup_year        smallint primary key,
  article         text not null,
  revision_id     bigint not null,
  fetched_on      date not null,
  dates_text      text,
  first_day       date,
  last_day        date,
  format          text,
  team1           text not null,           -- the infobox's first team (only the infobox order, not winner or visitor)
  team1_league    text,
  team1_article   text,                    -- the title of the club-season article the infobox links ("1957–58 Montreal Canadiens season")
  team2           text not null,
  team2_league    text,
  team2_article   text,
  team1_games     smallint,
  team2_games     smallint,
  winner          text,
  conn_smythe     text,
  conn_smythe_team text,
  cup_goal_by     text,
  cup_goal_detail text
);
create table if not exists legacy_wikipedia_stanley_cup_final.game (
  cup_year        smallint not null references legacy_wikipedia_stanley_cup_final.final (cup_year) on delete cascade,
  game_no         smallint not null,
  played_on       date,
  team1_score     smallint,
  team2_score     smallint,
  overtime_periods smallint not null default 0,
  venue           text,
  city            text,
  home_side       smallint check (home_side in (1, 2)),
  primary key (cup_year, game_no)
);
create table if not exists legacy_wikipedia_stanley_cup_final.unparsed (
  cup_year  smallint not null,
  what      text not null,
  detail    text not null
);
