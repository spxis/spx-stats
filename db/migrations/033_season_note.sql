-- Notes about a season: a short or disrupted schedule, cancelled games, anything a reader should know.
-- Filled by db/build/183_season_notes.sql from db/seed/season_note.csv. The site reads api.season_note.
-- franchise_id empty = the whole league's season; set = one club's season.
-- The text is stored per language (EN always; FR and JA when known, the site falls back to EN).
create table if not exists core.season_note (
  season_note_id  integer generated always as identity primary key,
  season_id       integer not null references core.season on delete cascade,
  franchise_id    integer references core.franchise,
  kind            text not null check (kind in ('short_season', 'cancelled_games', 'other')),
  games_planned   smallint check (games_planned > 0),
  games_usual     smallint check (games_usual > 0),
  note_en         text not null,
  note_fr         text,
  note_ja         text,
  source_id       smallint not null references meta.source,
  source_url      text
);
create unique index if not exists season_note_key on core.season_note (season_id, coalesce(franchise_id, 0), kind);
comment on table core.season_note is 'Why a season looks the way it does. Seed: db/seed/season_note.csv.';
comment on column core.season_note.games_planned is 'Regular-season games each team was scheduled to play that season.';
comment on column core.season_note.games_usual is 'The usual number in the years around it.';

create or replace view api.season_note as
select s.league_code as league,
       s.start_year as year,
       n.franchise_id,
       n.kind,
       n.games_planned,
       n.games_usual,
       n.note_en,
       n.note_fr,
       n.note_ja,
       src.code as source,
       n.source_url
from core.season_note n
join core.season s using (season_id)
join meta.source src on src.source_id = n.source_id;

grant select on api.season_note to anon, authenticated;
