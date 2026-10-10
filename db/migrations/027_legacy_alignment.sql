-- Raw league alignment (conference and division membership) as the sources gave it, before it is read into
-- core.conference, core.division and core.team_season.conference_id / division_id by db/build/pending/178_alignment.sql.
-- The SPX, NHL API, Retrosheet and nflverse rows are read straight from their own legacy schemas; only what had to be
-- downloaded lands here: the standings templates of English Wikipedia (CC BY-SA 4.0), kept exactly as served in
-- legacy_files.raw_archive (name 'alignment/2026-10-10/<league>.jsonl') and read into these two tables by
-- scripts/alignment/load_wikipedia.py.
create schema if not exists legacy_alignment;

-- One row per standings template of a season article: which group of teams it draws.
create table if not exists legacy_alignment.wikipedia_template (
  league_code  text     not null,
  season       smallint not null,           -- start year of the season
  article      text     not null,           -- the season article that transcludes the template
  template     text     not null,           -- e.g. '1985 AL East standings'
  kind         text     not null check (kind in ('conference', 'division')),
  grp          text     not null,           -- the conference or division as the template names it: 'AL East', 'Atlantic', 'East'
  parent_grp   text,                        -- for a division, the conference it sits in when the template says so
  fetched_on   date     not null,
  primary key (league_code, season, template)
);

-- The teams each template lists, in the order shown.
create table if not exists legacy_alignment.wikipedia_team (
  league_code  text     not null,
  season       smallint not null,
  template     text     not null,
  position     smallint not null,
  team_name    text     not null,           -- as the template writes it ('Seattle SuperSonics', 'Boston Celtics')
  primary key (league_code, season, template, position),
  foreign key (league_code, season, template) references legacy_alignment.wikipedia_template (league_code, season, template) on delete cascade
);
create index if not exists wikipedia_team_name_idx on legacy_alignment.wikipedia_team (league_code, season, team_name);
