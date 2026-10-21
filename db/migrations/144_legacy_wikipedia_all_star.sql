-- The All-Star Game articles of English Wikipedia (CC BY-SA 4.0): each league's list article (NHL, NBA, MLB, Pro Bowl, CFL, WNBA) and the article of every game
-- the list links, as parsed by scripts/all_star/parse.py. Built into core.all_star_* by db/build/224_all_star.sql (migration 145). Add-only, rerunnable.
-- DS1 only: legacy schemas are not published to production. Documented in docs/all-star-games.md.
create schema if not exists legacy_wikipedia_all_star;
comment on schema legacy_wikipedia_all_star is 'The All-Star Game list and game articles of English Wikipedia as parsed. CC BY-SA 4.0.';

-- every article read: its revision id says which text the rows come from
create table if not exists legacy_wikipedia_all_star.page (
  title        text primary key,
  kind         text not null check (kind in ('list', 'game')),
  league       text not null,
  revision_id  bigint not null,
  fetched_on   date not null
);

create table if not exists legacy_wikipedia_all_star.event (
  league        text not null,
  year          smallint not null,            -- the calendar year the event was played (or would have been)
  event_no      smallint not null default 1,  -- 2 for the second game of a year (MLB 1959-62, the NFL's 1940 and 1942)
  article       text references legacy_wikipedia_all_star.page (title),
  status        text not null check (status in ('played', 'cancelled')),
  status_reason text,                         -- lockout, olympics, pandemic, world_cup, war, strike, other
  format        text,                         -- series (the NHL's two series against the Soviet Union), tournament (the NHL's three-game days), null otherwise
  first_day     date,
  last_day      date,
  venue_name    text,
  venue_title   text,                         -- the English Wikipedia article the venue links to
  city_text     text,
  city_title    text,
  host_name     text,
  host_title    text,
  attendance    integer,
  primary key (league, year, event_no)
);

create table if not exists legacy_wikipedia_all_star.game (
  league      text not null,
  year        smallint not null,
  event_no    smallint not null,
  game_no     smallint not null,
  stage       text,                           -- semifinal, final, game 2 ...
  side1       text not null,                  -- as the list prints them, the first printed first
  score1      smallint not null,
  side2       text not null,
  score2      smallint not null,
  decided_by  text check (decided_by in ('OT', 'SO')),
  primary key (league, year, event_no, game_no),
  foreign key (league, year, event_no) references legacy_wikipedia_all_star.event (league, year, event_no) on delete cascade
);

create table if not exists legacy_wikipedia_all_star.mvp (
  league       text not null,
  year         smallint not null,
  event_no     smallint not null,
  seq          smallint not null,
  kind         text,                          -- offense, defense, back, lineman ... when the list says
  name         text not null,
  title        text,                          -- the English Wikipedia article of the player, when the list links one
  team_name    text,
  primary key (league, year, event_no, seq),
  foreign key (league, year, event_no) references legacy_wikipedia_all_star.event (league, year, event_no) on delete cascade
);

create table if not exists legacy_wikipedia_all_star.selection (
  league       text not null,
  year         smallint not null,
  event_no     smallint not null,
  seq          integer not null,
  side         text,                          -- the roster's team or league as the article names it
  role         text,                          -- starter, reserve, replacement, alternate ... as the article groups them
  grp          text,                          -- offense, defense, special teams, pitchers ... when the article groups so
  position     text,
  name         text not null,
  title        text,
  team_name    text,
  team_title   text,
  primary key (league, year, event_no, seq),
  foreign key (league, year, event_no) references legacy_wikipedia_all_star.event (league, year, event_no) on delete cascade
);

-- what the parser would not take: a score, a date that disagrees with the list, a Rosters section it could not read
create table if not exists legacy_wikipedia_all_star.unparsed (
  league  text not null,
  year    smallint,
  what    text not null,
  detail  text not null
);
