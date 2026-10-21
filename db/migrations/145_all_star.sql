-- Every All-Star Game of the NHL, NBA, MLB, NFL (the Pro Bowl), CFL and WNBA, from English Wikipedia (CC BY-SA 4.0; legacy_wikipedia_all_star, migration 144).
--   * core.all_star_event: one row per event (league, calendar year, event number) -- when it was played or why it was not, where, its host club, the attendance.
--   * core.all_star_game: the games of an event (one for most; three for the NHL's 2016-2024 mini-tournaments; two for the series against the Soviet Union).
--   * core.all_star_mvp: the Most Valuable Player(s) of an event, linked to core.person when the player can be named for certain.
--   * core.all_star_selection: the players picked for each side where the game article lists its rosters, linked to core.person the same way.
-- The keys are the league, the year, the event and game numbers (and the line number of a roster), so a rebuild changes no id. A season is pointed at, and a
-- venue by core.venue (whose source_key is the Wikidata id); nothing in core.game is written. Built by db/build/224_all_star.sql. Add-only, rerunnable.
-- DS1 and production. Documented in docs/all-star-games.md.
create table if not exists core.all_star_event (
  league_code        text not null,
  year               smallint not null,
  event_no           smallint not null default 1,
  season_id          integer references core.season (season_id) on delete set null,
  status             text not null check (status in ('played', 'cancelled')),
  status_reason      text,
  format             text,
  first_day          date,
  last_day           date,
  venue_name         text,
  city_text          text,
  venue_id           integer references core.venue (venue_id) on delete set null,
  venue_wikidata_id  text,
  host_name          text,
  host_franchise_id  integer references core.franchise (franchise_id) on delete set null,
  attendance         integer,
  source_id          smallint not null references meta.source,
  source_key         text not null,
  primary key (league_code, year, event_no)
);
comment on table core.all_star_event is 'An All-Star Game event (league, calendar year, number) from English Wikipedia (CC BY-SA 4.0): played, or cancelled with the reason.';
create index if not exists all_star_event_season on core.all_star_event (season_id) where season_id is not null;

create table if not exists core.all_star_game (
  league_code        text not null,
  year               smallint not null,
  event_no           smallint not null,
  game_no            smallint not null,
  stage              text,
  side1_name         text not null,
  side1_score        smallint not null,
  side1_franchise_id integer references core.franchise (franchise_id) on delete set null,
  side2_name         text not null,
  side2_score        smallint not null,
  side2_franchise_id integer references core.franchise (franchise_id) on delete set null,
  decided_by         text check (decided_by in ('OT', 'SO')),
  source_id          smallint not null references meta.source,
  source_key         text not null,
  primary key (league_code, year, event_no, game_no),
  foreign key (league_code, year, event_no) references core.all_star_event (league_code, year, event_no) on delete cascade
);
comment on table core.all_star_game is 'A game of an All-Star event; side1 is the side the list prints first, side1_franchise_id is set only when the side is one club.';

create table if not exists core.all_star_mvp (
  league_code   text not null,
  year          smallint not null,
  event_no      smallint not null,
  seq           smallint not null,
  kind          text,
  name          text not null,
  team_name     text,
  person_id     bigint references core.person (person_id) on delete set null,
  source_id     smallint not null references meta.source,
  source_key    text not null,
  primary key (league_code, year, event_no, seq),
  foreign key (league_code, year, event_no) references core.all_star_event (league_code, year, event_no) on delete cascade
);
comment on table core.all_star_mvp is 'The Most Valuable Player(s) of an All-Star event as the list names them; person_id only when the player is known for certain.';
create index if not exists all_star_mvp_person on core.all_star_mvp (person_id) where person_id is not null;

create table if not exists core.all_star_selection (
  league_code   text not null,
  year          smallint not null,
  event_no      smallint not null,
  seq           integer not null,
  side          text,
  role          text,
  grp           text,
  position      text,
  name          text not null,
  team_name     text,
  person_id     bigint references core.person (person_id) on delete set null,
  source_id     smallint not null references meta.source,
  source_key    text not null,
  primary key (league_code, year, event_no, seq),
  foreign key (league_code, year, event_no) references core.all_star_event (league_code, year, event_no) on delete cascade
);
comment on table core.all_star_selection is 'A player named on an All-Star roster in the game article; person_id only when the player is known for certain.';
create index if not exists all_star_selection_person on core.all_star_selection (person_id) where person_id is not null;

create or replace view api.all_star_event as
select e.league_code as league, e.year, e.event_no, s.start_year as season_year, e.status, e.status_reason, e.format, e.first_day, e.last_day,
       e.venue_name, e.city_text, e.venue_wikidata_id, e.host_name, e.host_franchise_id as host_franchise, e.attendance,
       src.code as source
from core.all_star_event e
join meta.source src on src.source_id = e.source_id
left join core.season s on s.season_id = e.season_id;

create or replace view api.all_star_game as
select g.league_code as league, g.year, g.event_no, g.game_no, g.stage,
       g.side1_name, g.side1_score, g.side1_franchise_id as side1_franchise,
       g.side2_name, g.side2_score, g.side2_franchise_id as side2_franchise,
       g.decided_by
from core.all_star_game g;

create or replace view api.all_star_mvp as
select m.league_code as league, m.year, m.event_no, m.seq, m.kind, m.name, m.team_name, m.person_id
from core.all_star_mvp m;

create or replace view api.all_star_selection as
select x.league_code as league, x.year, x.event_no, x.seq, x.side, x.role, x.grp, x.position, x.name, x.team_name, x.person_id
from core.all_star_selection x;

grant select on api.all_star_event, api.all_star_game, api.all_star_mvp, api.all_star_selection to anon, authenticated;
