-- General managers and presidents named in the infoboxes of English Wikipedia's club-season articles (CC BY-SA 4.0), as published.
-- Same shape as legacy_staff.wikipedia_staff (migration 039), kept apart so the head-coach and captain rows and db/build/184 are not touched.
-- Filled by scripts/staff/load_office.py from the raw pages already archived by scripts/staff/fetch_wikipedia.py. DS1 and working copies only: production has no legacy_* schemas.
-- Names checked free: no table called wikipedia_office exists in db/migrations or on production.
create table if not exists legacy_staff.wikipedia_office (
  team_season_id  integer not null,
  field           text not null check (field in ('general_manager', 'president')),
  n               smallint not null,
  name            text not null,
  link_title      text,
  note            text,
  primary key (team_season_id, field, n)
);
comment on table legacy_staff.wikipedia_office is 'One row per name in the general manager or president infobox field, in page order; link_title is the wikilink target when there was one.';
