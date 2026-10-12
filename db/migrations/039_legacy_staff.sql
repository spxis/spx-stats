-- Head coaches and captains from the infoboxes of English Wikipedia's club-season articles (NHL, NBA, CFL), as published.
-- Raw files stay outside the repository; this keeps what was read from them. For the working copy and DS1 only (production has no legacy_* schemas).
-- MLB managers (Retrosheet game logs) and NFL coaches (nflverse games) are read from the legacy tables that already hold them.
create schema if not exists legacy_staff;
comment on schema legacy_staff is 'Coach and captain names read from Wikipedia club-season infoboxes (CC BY-SA 4.0).';

create table if not exists legacy_staff.wikipedia_page (
  team_season_id  integer primary key,
  league          text not null,
  season_year     smallint not null,
  requested_title text not null,
  page_title      text,
  revid           bigint,
  sha256          text,
  status          text not null check (status in ('ok', 'missing', 'no_infobox', 'no_staff'))
);

create table if not exists legacy_staff.wikipedia_staff (
  team_season_id  integer not null,
  field           text not null check (field in ('coach', 'captain', 'alt_captain')),
  n               smallint not null,
  name            text not null,
  link_title      text,
  note            text,
  primary key (team_season_id, field, n)
);
comment on table legacy_staff.wikipedia_staff is 'One row per name in the infobox field, in page order; link_title is the wikilink target when there was one.';

-- Franchise lists ("List of <club> head coaches"): who coached in which seasons, used only for seasons whose infobox gave no coach.
create table if not exists legacy_staff.wikipedia_list (
  list_title   text not null,
  n            smallint not null,
  name         text not null,
  link_title   text,
  years        smallint[] not null,
  primary key (list_title, n)
);
