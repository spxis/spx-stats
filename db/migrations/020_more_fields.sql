-- Fields and tables for data we want to collect over time. Everything here is
-- optional: columns are nullable (or default false) and new tables start empty,
-- so nothing existing changes. Loaders fill them as sources are found.
-- Playoff series and rounds
create table if not exists core.series (
  series_id        bigint generated always as identity primary key,
  season_id        integer not null references core.season,
  round_label      text not null,                 -- 'Stanley Cup Final', 'Wild Card', 'Grey Cup'
  round_number     smallint,
  best_of          smallint check (best_of > 0),  -- null for single-game rounds
  conference_id    integer references core.conference,
  higher_seed_team_season_id integer references core.team_season,
  lower_seed_team_season_id  integer references core.team_season,
  higher_seed      smallint,
  lower_seed       smallint,
  winner_team_season_id      integer references core.team_season,
  higher_seed_wins smallint,
  lower_seed_wins  smallint,
  source_id        smallint not null references meta.source,
  source_key       text not null,
  unique (source_id, source_key)
);

alter table core.game
  add column if not exists series_id            bigint references core.series,
  add column if not exists series_game_number   smallint,
  add column if not exists round_label          text,
  add column if not exists game_number          smallint,          -- doubleheader, 1 or 2
  add column if not exists attendance           integer check (attendance >= 0),
  add column if not exists duration_minutes     smallint check (duration_minutes > 0),
  add column if not exists ended_at             timestamptz,
  add column if not exists overtime_periods     smallint check (overtime_periods >= 0),
  add column if not exists decided_by           text check (decided_by in
                                    ('regulation','overtime','shootout','tie','forfeit','shortened','called')),
  add column if not exists home_seed            smallint,
  add column if not exists away_seed            smallint,
  add column if not exists is_all_star          boolean not null default false,
  add column if not exists is_outdoor           boolean,
  add column if not exists is_international     boolean,
  add column if not exists temperature_c        numeric(4,1),
  add column if not exists wind_kph             smallint,
  add column if not exists wind_direction       text,
  add column if not exists sky                  text,
  add column if not exists precipitation        text,
  add column if not exists roof_state           text check (roof_state in ('open','closed','dome','none')),
  add column if not exists surface              text;

-- Team box score: one row per team per game, sport-specific totals in jsonb
create table if not exists core.team_game_stat (
  game_id         bigint not null references core.game on delete cascade,
  team_season_id  integer not null references core.team_season,
  stat_group      text not null default 'team',
  stats           jsonb not null check (jsonb_typeof(stats) = 'object'),
  source_id       smallint not null references meta.source,
  primary key (game_id, team_season_id, stat_group, source_id)
);
comment on table core.team_game_stat is 'Team totals in one game (shots, first downs, runs/hits/errors). Keys are the standard stat names used across sources.';

-- Officials (people with kind = official; see person.kind)
alter table core.person add column if not exists kind text not null default 'player'
  check (kind in ('player','coach','official','executive','owner'));
alter table core.person
  add column if not exists nickname text, add column if not exists nationality_code text references ref.country,
  add column if not exists bats text check (bats in ('L','R','S')),
  add column if not exists throws_or_shoots text check (throws_or_shoots in ('L','R')),
  add column if not exists debut_on date, add column if not exists final_game_on date,
  add column if not exists primary_position text, add column if not exists hall_of_fame_year smallint;

create table if not exists core.game_official (
  game_id     bigint not null references core.game on delete cascade,
  person_id   bigint not null references core.person,
  assignment  text not null,                  -- 'referee', 'linesman', 'home_plate', 'umpire_1b', 'back_judge'
  jersey_number smallint,
  source_id   smallint not null references meta.source,
  primary key (game_id, person_id, assignment)
);

-- Who dressed, started, scratched
create table if not exists core.game_lineup (
  game_id         bigint not null references core.game on delete cascade,
  person_id       bigint not null references core.person,
  team_season_id  integer not null references core.team_season,
  status          text not null check (status in ('started','played','dressed','scratched','injured','dnp')),
  position        text,
  batting_order   smallint,                   -- baseball
  jersey_number   smallint,
  source_id       smallint not null references meta.source,
  primary key (game_id, person_id)
);

-- Draft and transactions
create table if not exists core.draft_pick (
  draft_pick_id     bigint generated always as identity primary key,
  league_code       text not null references ref.league,
  draft_year        smallint not null,
  round             smallint,
  overall_pick      smallint,
  team_season_id    integer references core.team_season,       -- drafting team in its draft season
  original_franchise_id integer references core.franchise,      -- pick traded
  person_id         bigint references core.person,
  player_name       text not null,
  position          text,
  amateur_team      text,
  source_id         smallint not null references meta.source,
  source_key        text not null,
  unique (source_id, source_key)
);

create table if not exists core.transaction (
  transaction_id  bigint generated always as identity primary key,
  league_code     text not null references ref.league,
  effective_on    date not null,
  kind            text not null check (kind in
                    ('trade','signing','release','waiver','callup','assignment','retirement','suspension','draft','other')),
  person_id       bigint references core.person,
  from_franchise_id integer references core.franchise,
  to_franchise_id   integer references core.franchise,
  group_key       text,                         -- ties the legs of one trade together
  description     text,
  source_id       smallint not null references meta.source,
  source_key      text not null,
  unique (source_id, source_key)
);

-- Venue history of physical features
create table if not exists core.venue_feature (
  venue_id      integer not null references core.venue on delete cascade,
  valid_during  daterange not null,
  surface       text,
  roof          text check (roof in ('open','dome','retractable')),
  capacity      integer check (capacity > 0),
  dimensions    jsonb,                          -- fences, field length/width, end-zone depth
  source_id     smallint references meta.source,
  primary key (venue_id, valid_during),
  exclude using gist (venue_id with =, valid_during with &&)
);
alter table core.venue add column if not exists time_zone text, add column if not exists kind text,
  add column if not exists address text, add column if not exists postal_code text;

-- Standing additions
alter table core.standing
  add column if not exists is_final boolean not null default false,
  add column if not exists conference_rank smallint, add column if not exists league_rank smallint,
  add column if not exists wildcard_rank smallint, add column if not exists seed smallint,
  add column if not exists regulation_wins smallint, add column if not exists overtime_wins smallint,
  add column if not exists shootout_wins smallint, add column if not exists shootout_losses smallint,
  add column if not exists win_pct numeric(5,4), add column if not exists points_pct numeric(5,4),
  add column if not exists clinch_status text, add column if not exists elimination_number smallint,
  add column if not exists conference_record text, add column if not exists division_record text,
  add column if not exists neutral_record text, add column if not exists streak_kind char(1), add column if not exists streak_length smallint,
  add column if not exists extra jsonb check (extra is null or jsonb_typeof(extra) = 'object');

-- Season rules (what 'tie' and 'OT loss' meant that year)
alter table core.season
  add column if not exists points_system text, add column if not exists overtime_rule text,
  add column if not exists ties_allowed boolean, add column if not exists playoff_format jsonb,
  add column if not exists rules_version jsonb;

-- Stat table promotion of the universal columns
alter table core.player_season_stat add column if not exists games_played smallint, add column if not exists games_started smallint;
alter table core.player_game_stat add column if not exists team_season_id integer references core.team_season,
  add column if not exists started boolean, add column if not exists position text;

-- external_id: add kinds
alter table core.external_id drop constraint if exists external_id_entity_kind_check;
alter table core.external_id add constraint external_id_entity_kind_check check (entity_kind in
  ('franchise','team_season','venue','person','game','season','award','award_winner','series','draft_pick','transaction'));

-- Play-by-play, if ever collected: one table for every sport, details in jsonb.
create table if not exists core.game_event (
  game_id         bigint not null references core.game on delete cascade,
  sequence        integer not null,
  period          smallint,
  clock_seconds   integer,
  event_kind      text not null,
  team_season_id  integer references core.team_season,
  person_ids      bigint[],
  details         jsonb check (details is null or jsonb_typeof(details) = 'object'),
  source_id       smallint not null references meta.source,
  primary key (game_id, sequence, source_id)
);
comment on table core.game_event is 'Play-by-play events (goals, plays, at-bats, drives), one row per event.';
