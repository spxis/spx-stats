-- The sports resume of a person: where they studied, the clubs they played for outside our five leagues
-- (junior, minor, college, foreign), and the draft. Clubs outside the leagues have no core.franchise and are not
-- given one: a row names the club, its Wikidata item when it has one, and its level. Seasons in the five leagues
-- are not here: they are core.roster_stint and core.player_season_stat.
create table if not exists core.person_career (
  person_career_id bigint generated always as identity primary key,
  person_id   bigint not null references core.person (person_id) on delete cascade,
  kind        text not null check (kind in ('education', 'club', 'draft')),
  name        text not null,              -- the school or club, or for a draft the team that picked
  club_qid    text,                       -- Wikidata item of the club or school
  level       text check (level in ('high_school', 'college', 'junior', 'minor', 'professional', 'national', 'amateur', 'other')),
  league      text,                       -- OHL, AHL, NCAA, SHL ...
  start_year  smallint,
  end_year    smallint,
  detail      text,                       -- a draft's round and pick
  source_id   smallint not null references meta.source (source_id),
  source_key  text not null,
  unique (source_id, source_key)
);
create index if not exists person_career_person_idx on core.person_career (person_id);
