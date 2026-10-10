-- Championships and awards: what each one is called (and was called), and who
-- won it each season. A team wins a championship; a person wins most awards,
-- usually while playing for a team.

create type core.award_kind as enum ('championship', 'team_award', 'person_award');

create table core.award (
  award_id      integer generated always as identity primary key,
  league_code   text not null references ref.league,
  code          text not null unique check (code ~ '^[a-z0-9_]+$'),  -- e.g. nhl_stanley_cup
  name          text not null,                                         -- its name today
  kind          core.award_kind not null,
  description   text,
  first_season  smallint,
  source_id     smallint references meta.source
);
comment on table core.award is 'A championship, trophy or award of one league.';

create table core.award_name (
  award_id      integer not null references core.award on delete cascade,
  seasons       int4range not null,          -- the start years it bore this name
  name          text not null,
  source_id     smallint references meta.source,
  primary key (award_id, seasons),
  exclude using gist (award_id with =, seasons with &&)
);
comment on table core.award_name is 'An award''s earlier names, by the seasons it bore them.';

create table core.award_winner (
  award_winner_id  bigint generated always as identity primary key,
  award_id         integer not null references core.award on delete cascade,
  season_id        integer not null references core.season,
  team_season_id   integer references core.team_season,   -- the champion, or the person's team
  person_id        bigint references core.person,
  winner_name      text not null,                          -- as the source names the winner
  note             text,                                   -- a shared award, a series result
  source_id        smallint not null references meta.source,
  source_key       text not null,
  unique (award_id, season_id, winner_name, source_id)
);
create index award_winner_season_idx on core.award_winner (season_id);
comment on table core.award_winner is 'Who won an award in a season, according to one source. Two sources that agree confirm each other in meta.verification.';

alter table core.external_id drop constraint external_id_entity_kind_check;
alter table core.external_id add constraint external_id_entity_kind_check check (entity_kind in
  ('franchise', 'team_season', 'venue', 'person', 'game', 'season', 'award', 'award_winner'));
