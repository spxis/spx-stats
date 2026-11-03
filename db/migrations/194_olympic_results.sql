-- Olympic results: Games, events, races and every athlete's line in a race (lane, reaction time, time, place, marks, splits), from English Wikipedia's event
-- articles (CC BY-SA 4.0) through legacy_wikipedia_olympics (migration 193; scripts/olympics/; built by db/build/241). Add-only: four tables and two views, no
-- existing object changes. Apply to DS1 first. Production only when the Olympic pages ticket is under way (John, 2026-11-03: data on DS1 to start).
--   core.olympic_games   one row per Games (season and year); held_year is the year it was held (Tokyo's 2020 Games were held in 2021)
--   core.olympic_event   one row per event at a Games (the men's 100 metres at 2008): sport, gender, distance, stroke, the Wikidata item of the event
--   core.olympic_race    one row per heat, quarterfinal, semifinal or final: round, number in the round, wind
--   core.olympic_result  one row per athlete in a race: lane, place, athlete (a person only where a Wikidata id matches), nation, reaction, time, marks, splits
-- Ids are kept on a rerun: the build step upserts on the natural keys below and deletes only rows its source no longer has.
create table if not exists core.olympic_games (
  games_id   integer generated always as identity primary key,
  season     text not null check (season in ('summer', 'winter')),
  year       smallint not null,                    -- the Games' own year (2020), not the year held
  held_year  smallint not null,
  name       text not null,
  host_city  text,
  host_ioc   text,                                 -- the host nation's IOC code (FRG for Munich 1972)
  unique (season, year)
);
comment on table core.olympic_games is 'The Olympic Games. year is the name of the Games, held_year the year they took place.';

create table if not exists core.olympic_event (
  event_id    integer generated always as identity primary key,
  games_id    integer not null references core.olympic_games on delete cascade,
  event_key   text not null,                       -- 100m-m, 100m-w: the key of db/seed/olympic_event.csv
  sport       text not null,                       -- athletics, swimming
  name        text not null,                       -- as the article's infobox writes it: Men's 100 metres
  gender      text not null check (gender in ('men', 'women', 'mixed')),
  distance_m  smallint,
  stroke      text,                                -- swimming only: freestyle, backstroke, breaststroke, butterfly, medley
  qid         text,                                -- the Wikidata item of the event at these Games
  source_id   smallint references meta.source,
  source_key  text not null,                       -- enwiki:<article title>@<revision id>
  unique (games_id, event_key)
);
comment on table core.olympic_event is 'An Olympic event at one Games, from the event article of English Wikipedia (CC BY-SA 4.0). source_key names the article and revision.';

create table if not exists core.olympic_race (
  race_id     integer generated always as identity primary key,
  event_id    integer not null references core.olympic_event on delete cascade,
  round_code  text not null check (round_code in ('prelim', 'heats', 'round2', 'repechage', 'quarterfinals', 'round3', 'semifinals', 'final')),
  round_ord   smallint not null,                   -- the order of the rounds within the event
  round_label text not null,                       -- the heading as the article writes it
  race_no     smallint not null,                   -- the heat or semifinal number; 1 for a final
  heat_label  text,
  wind_ms     numeric(4, 1),                       -- null where the article prints no wind for the race
  wind_text   text,
  place_scope text not null check (place_scope in ('race', 'round')),   -- round: the article ranks the whole round in one table, so place is over the round
  race_date   date,                                -- filled when a source gives it; the articles' schedule tables are not read yet
  unique (event_id, round_ord, race_no)
);
comment on table core.olympic_race is 'One race of an Olympic event: a heat, quarterfinal, semifinal or the final. round_ord orders the rounds; place_scope says whether results.place is within the race or over the round.';

create table if not exists core.olympic_result (
  race_id       integer not null references core.olympic_race on delete cascade,
  row_ord       smallint not null,                 -- the order of the lines in the article's table
  lane          smallint,
  place         smallint,                          -- null for DNS, DNF, DQ and unranked lines
  place_text    text,                              -- the rank cell as printed (T3, -)
  status        text check (status in ('DNS', 'DNF', 'DQ', 'NM', 'DNQ', 'ND')),
  athlete_name  text not null,
  athlete_qid   text,                              -- the Wikidata item of the article the name links to
  wiki_title    text,                              -- that article's title
  person_id     bigint references core.person on delete set null,
  matched_by    text check (matched_by in ('wikidata')),
  nation_ioc    text,                              -- the IOC code as the article writes it
  reaction_s    numeric(5, 3),
  time_s        numeric(7, 3),                     -- electronic time where the article gives both, else the only time
  time_hand_s   numeric(7, 3),                     -- the hand time column, where the article has one
  time_text     text,                              -- the time cell as printed (Unknown, DNS, 12.2, OR)
  marks         text[] not null default '{}',      -- Q q WR OR NR AR PB SB ... as printed
  notes         text,
  splits        jsonb,                             -- [{"m": 50, "s": 24.1}, ...] where a source prints splits (swimming; an interval is {"m": 65, "from": 50, "s": 6.57, "interval": true}); null for the 100 metres
  source_id     smallint references meta.source,
  source_key    text not null,                     -- enwiki:<article title>@<revision id>
  primary key (race_id, row_ord)
);
create index if not exists olympic_result_person_idx on core.olympic_result (person_id) where person_id is not null;
create index if not exists olympic_result_qid_idx on core.olympic_result (athlete_qid) where athlete_qid is not null;
comment on table core.olympic_result is 'An athlete in an Olympic race. person_id is set only where the article the name links to is the Wikidata item of a person of core (db/build/241); otherwise the name stays text.';

-- api.olympic_result: one flat row per athlete line, read with event_id=eq.N or games_year=eq.N and event_key=eq.X.
create or replace view api.olympic_result as
select e.event_id, g.year as games_year, g.name as games_name, g.host_city, e.event_key, e.sport, e.name as event_name, e.gender, e.distance_m, e.stroke,
       r.race_id, r.round_code, r.round_ord, r.round_label, r.race_no, r.wind_ms, r.place_scope, r.race_date,
       x.row_ord, x.lane, x.place, x.place_text, x.status, x.athlete_name, x.person_id, x.nation_ioc, x.reaction_s, x.time_s, x.time_hand_s, x.marks, x.notes, x.splits, x.source_key
from core.olympic_result x
join core.olympic_race r using (race_id)
join core.olympic_event e using (event_id)
join core.olympic_games g using (games_id);
comment on view api.olympic_result is 'Every athlete line of every Olympic race, flat. place is within the race unless place_scope is round. person_id is null where the name is shown as text. Migration 194.';
grant select on api.olympic_result to anon, authenticated;

-- api.olympic_event: the events with their Games.
create or replace view api.olympic_event as
select e.event_id, g.season, g.year as games_year, g.held_year, g.name as games_name, g.host_city, g.host_ioc, e.event_key, e.sport, e.name, e.gender, e.distance_m, e.stroke, e.qid, e.source_key
from core.olympic_event e join core.olympic_games g using (games_id);
comment on view api.olympic_event is 'The Olympic events held at each Games. Migration 194.';
grant select on api.olympic_event to anon, authenticated;
