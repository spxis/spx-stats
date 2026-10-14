-- English Wikipedia's "List of Stanley Cup champions" (CC BY-SA 4.0) as printed, plus the infoboxes of the 1915-1917 finals, for
-- the Cup wins that happened before the NHL existed (1893-1917) and the finals of 1918-1926. DS1 only: production never holds a
-- legacy_* schema (AGENTS.md section 8). Filled by scripts/stanley_cup/parse.py; db/build/210_stanley_cup_pre_nhl.sql reads it. Rerunnable.
create schema if not exists legacy_wikipedia_stanley_cup;
comment on schema legacy_wikipedia_stanley_cup is 'The Stanley Cup champions list and the 1915-1917 final infoboxes of English Wikipedia, as printed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_stanley_cup.series (
  era           text     not null,              -- challenge (1893-1914 table) or final (1915-1926 table)
  cup_year      smallint not null,              -- the calendar year the series ended in (the year Wikipedia files it under)
  seq           smallint not null,              -- order within the year, as printed
  date_text     text     not null,              -- the Date cell (challenge era) or the Year cell (final era)
  played_on     date,                           -- first day, when the cell gives one
  ended_on      date,                           -- last day, when the cell gives one
  winner_text   text     not null,              -- the Winning team cell, markup removed
  winner_name   text     not null,
  winner_league text,                           -- the league in brackets after the name (AHAC, CAHL, NHA, PCHA...), null when none is printed
  loser_text    text,
  loser_name    text,
  loser_league  text,
  kind          text     not null,              -- challenge (a series), league (a league title won while holding the Cup), final (1915-1926)
  format        text,                           -- the Playoff format cell; for a league title the text printed in its place
  score         text,                           -- the Score cell (challenge era) or the Games cell (final era)
  article       text     not null,
  revision_id   bigint,
  fetched_on    date     not null,
  primary key (cup_year, seq)
);
comment on table legacy_wikipedia_stanley_cup.series is 'One row per Cup win in the challenge-era table and one per final of 1915-1926 (the cancelled 1919 final has none). Licence CC BY-SA 4.0 (en.wikipedia.org).';

-- The same article's "Appearances" table for the challenge era: per club the wins and losses (SC, UC), and each year it appeared in
-- (bold = a Cup win that year, n = the number of series). A second reading of the same wins, used to check the series rows.
create table if not exists legacy_wikipedia_stanley_cup.appearance_total (
  club   text primary key,
  wins   smallint not null,
  losses smallint not null
);
create table if not exists legacy_wikipedia_stanley_cup.appearance (
  club     text     not null references legacy_wikipedia_stanley_cup.appearance_total,
  cup_year smallint not null,
  won      boolean  not null,
  n        smallint not null,
  primary key (club, cup_year, won)
);

-- The infobox of the articles about the three finals between the NHA and PCHA champions: an independent write-up of the same series.
create table if not exists legacy_wikipedia_stanley_cup.final_article (
  cup_year     smallint primary key,
  article      text   not null,
  revision_id  bigint,
  fetched_on   date   not null,
  date_text    text,
  team1        text   not null,                 -- the winner (bold in the infobox)
  team1_league text,
  team1_games  smallint not null,
  team2        text   not null,
  team2_league text,
  team2_games  smallint not null
);
