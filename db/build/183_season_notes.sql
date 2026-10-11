-- Season notes from db/seed/season_note.csv (run from the repo root, as scripts/build_core.sh does). Rerunnable:
-- the table is only ever fed from the seed, so it is emptied and filled again.
-- A franchise_key is '<source code>:<source key>' (as in core.franchise.source_key), empty for a league-wide note.

drop table if exists pg_temp.seed_note;
create temp table seed_note (
  league text, year smallint, franchise_key text, kind text, games_planned smallint, games_usual smallint,
  source text, source_url text, note_en text, note_fr text, note_ja text
);
\copy seed_note from 'db/seed/season_note.csv' with (format csv, header true)

delete from core.season_note;
insert into core.season_note (season_id, franchise_id, kind, games_planned, games_usual, note_en, note_fr, note_ja, source_id, source_url)
select s.season_id, f.franchise_id, n.kind, n.games_planned, n.games_usual, n.note_en, nullif(n.note_fr, ''), nullif(n.note_ja, ''),
       src.source_id, nullif(n.source_url, '')
from seed_note n
join core.season s on s.league_code = n.league and s.start_year = n.year
join meta.source src on src.code = n.source
left join meta.source fsrc on fsrc.code = split_part(n.franchise_key, ':', 1)
left join core.franchise f on f.source_id = fsrc.source_id and f.source_key = split_part(n.franchise_key, ':', 2)
where coalesce(n.franchise_key, '') = '' or f.franchise_id is not null;

-- A seed row that matched no season, source or franchise is a typo: say so.
select 'season_note seed rows not loaded' as what, (select count(*) from seed_note) - (select count(*) from core.season_note) as n
where (select count(*) from seed_note) <> (select count(*) from core.season_note);
