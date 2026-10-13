-- Raw World Cup data, as the sources published it. DS1 only: production never holds a legacy_* schema (AGENTS.md section 8).
--   csv_row         every line of every jfjelstul/worldcup CSV (Joshua C. Fjelstul, CC BY-SA 4.0), one jsonb object per line,
--                   keyed by the file name and the line number; the column names and values are exactly the CSV's.
--   of_match        a match line of openfootball/worldcup (CC0) cup.txt / cup_finals.txt, parsed by scripts/worldcup/openfootball.py
--   of_goal         the scorers listed under it
--   of_stadium      the rows of an openfootball stadiums.csv
--   wikipedia_item  the Wikidata item each linked English Wikipedia page belongs to (Wikipedia page properties; CC0 for the item id)
-- Filled by scripts/worldcup/load.py; db/build/200_worldcup.sql builds core.soccer_* from them. Rerunnable.
create schema if not exists legacy_worldcup;
comment on schema legacy_worldcup is 'World Cup datasets exactly as published: jfjelstul/worldcup (CC BY-SA 4.0), openfootball/worldcup (CC0), Wikidata item ids.';

create table if not exists legacy_worldcup.csv_row (
  dataset  text    not null,            -- the CSV's name without .csv: matches, goals, players, ...
  line     integer not null,            -- 1 for the first data row
  data     jsonb   not null check (jsonb_typeof(data) = 'object'),
  primary key (dataset, line)
);
comment on table legacy_worldcup.csv_row is 'One line of a jfjelstul/worldcup CSV: dataset = file name, data = {column: value} as text, exactly as the file has it.';

create table if not exists legacy_worldcup.of_match (
  year          smallint not null,
  seq           integer  not null,      -- order in the file(s), cup.txt first
  file          text     not null,
  stage         text,                   -- as the file's heading names it
  group_name    text,
  match_date    date     not null,
  kickoff       time,
  utc_offset    text,
  match_number  smallint,
  team1         text     not null,
  team2         text     not null,
  score1        smallint not null,
  score2        smallint not null,
  aet           boolean  not null,
  halftime      text,                   -- the text in parentheses: 1-0 or 1-1, 0-0
  pens1         smallint,
  pens2         smallint,
  venue         text,
  comment       text,
  goal_text     text,
  primary key (year, seq)
);
create table if not exists legacy_worldcup.of_goal (
  year    smallint not null,
  seq     integer  not null,
  n       smallint not null,
  side    text     not null check (side in ('home', 'away')),   -- the side credited (an own goal is under the side it counted for)
  scorer  text,
  minute  text,
  kind    text     not null default '',                          -- '', pen, og
  primary key (year, seq, n),
  foreign key (year, seq) references legacy_worldcup.of_match on delete cascade
);
create table if not exists legacy_worldcup.of_stadium (
  year      smallint not null,
  city      text,
  cc        text,                       -- country code as the file gives it (lower case)
  name      text not null,
  capacity  integer,
  wikipedia text,
  wikidata  text,                       -- only the 2026 file lists one
  line      text not null,
  primary key (year, name)
);
create table if not exists legacy_worldcup.wikipedia_item (
  url    text primary key,              -- the Wikipedia link exactly as a jfjelstul CSV has it
  title  text not null,                 -- the page title in it (decoded, spaces)
  qid    text,                          -- Wikidata item of the page (after redirects), null when the page has none
  page   text                           -- the title after redirects
);
