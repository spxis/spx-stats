-- The Stanley Cup before the NHL (and its finals against clubs that were never in it), 1893-1926: one row per Cup win, either a
-- challenge series, a league title won while holding the Cup, or one of the annual finals between the league champions.
-- Clubs of those years are mostly outside the five leagues (AHAC, CAHL, FAHL, ECAHA, ECHA, NHA, PCHA, WCHL...), so they are NOT
-- given seasons of a league: this table is the whole record, and winner_franchise_id links a club to the franchise core already holds
-- (the Vancouver Millionaires, the Ottawa Senators of 1903...) so the team and city pages can count the title.
-- A row from 1918 on is also played inside an NHL season (nhl_season_id); the site counts only the rows with none (api.cup_title).
-- Built by db/build/210_stanley_cup_pre_nhl.sql from legacy_wikipedia_stanley_cup (migration 086) and db/seed/stanley_cup_club.csv.
-- Add-only. Documented in docs/stanley-cup-pre-nhl.md.

create table if not exists core.cup_series (
  cup_series_id        integer primary key,            -- cup_year * 100 + seq: stable across rebuilds, so a data release can compare by it
  cup_year             smallint not null,              -- the calendar year the series ended in
  seq                  smallint not null,              -- order within the year, as Wikipedia prints it
  kind                 text     not null check (kind in ('challenge', 'league', 'final')),
  date_text            text     not null,              -- the date as printed ("January 29-31, February 2-4, 1903")
  played_on            date,
  ended_on             date,
  winner_name          text     not null,              -- the name the club wore then (Ottawa Silver Seven, Toronto Hockey Club)
  winner_league        text,                           -- the league it played in then, as printed (AHAC, CAHL, NHA, PCHA, WCHL...)
  winner_club          text     not null,              -- the club under one name (Ottawa Hockey Club for the Silver Seven and the Senators of 1903-1911)
  winner_franchise_id  integer references core.franchise (franchise_id) on delete set null,
  winner_city_slug     text,                           -- a ref.city slug (not a foreign key: ref.city is rebuilt by 197)
  loser_name           text,                           -- null for a league title (no challenger)
  loser_league         text,
  loser_club           text,
  loser_franchise_id   integer references core.franchise (franchise_id) on delete set null,
  loser_city_slug      text,
  format               text,
  score                text,
  counts_as_title      boolean  not null default true, -- false: the club won the series but the Cup went to another club (Montreal HC, 1895)
  nhl_season_id        integer references core.season (season_id) on delete set null,  -- the NHL season this final is part of (1918-1926)
  source_id            smallint not null references meta.source,
  source_key           text     not null,
  unique (cup_year, seq)
);
comment on table core.cup_series is 'A Stanley Cup win, 1893-1926: a challenge series, a league title won while holding the Cup, or a final. Clubs outside the five leagues stay clubs of this table; winner_franchise_id links those core already holds.';
comment on column core.cup_series.counts_as_title is 'False for the one series won by a club that did not get the Cup (Montreal HC beat Queen''s on 9 March 1895, but the trustees had agreed the Victorias, the AHAC champions, would take the Cup).';

-- meta.verification may now be about a Cup series (entity_id = cup_series_id). Widens the check; every kind it allowed stays allowed.
alter table meta.verification drop constraint if exists verification_entity_kind_check;
alter table meta.verification add constraint verification_entity_kind_check check (entity_kind in
  ('franchise', 'franchise_identity', 'team_season', 'season', 'game', 'betting_line', 'person', 'venue', 'player_season_stat', 'soccer_match', 'cup_series'));

create index if not exists cup_series_winner_franchise on core.cup_series (winner_franchise_id) where winner_franchise_id is not null;

-- Every series, with the names the site shows.
create or replace view api.cup_series as
select s.cup_year as year,
       s.seq,
       s.kind,
       s.date_text,
       s.played_on,
       s.ended_on,
       s.winner_name,
       s.winner_league,
       s.winner_club,
       s.winner_franchise_id as winner_franchise,
       s.winner_city_slug as winner_city,
       s.loser_name,
       s.loser_league,
       s.loser_club,
       s.loser_franchise_id as loser_franchise,
       s.loser_city_slug as loser_city,
       s.format,
       s.score,
       s.counts_as_title,
       (s.nhl_season_id is not null) as in_nhl_season,
       src.code as source
from core.cup_series s
join meta.source src on src.source_id = s.source_id;

-- The titles outside any NHL season: a club, a year, how many Cup series it won that year. A club is a franchise where core knows it,
-- else the club's own name. `team` is the name it wore in its last win of the year.
create or replace view api.cup_title as
select s.cup_year as year,
       (array_agg(s.winner_name order by s.seq desc))[1] as team,
       (array_agg(s.winner_league order by s.seq desc))[1] as league,
       s.winner_club as club,
       s.winner_franchise_id as franchise,
       (array_agg(s.winner_city_slug order by s.seq desc))[1] as city,
       count(*)::int as wins,
       min(s.played_on) as first_win
from core.cup_series s
where s.counts_as_title and s.nhl_season_id is null
group by s.cup_year, s.winner_club, s.winner_franchise_id;

comment on view api.cup_title is 'Stanley Cup titles won outside an NHL season (1893-1917): one row per club and year.';

grant select on api.cup_series, api.cup_title to anon, authenticated;
