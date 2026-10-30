-- The club leaders of a CFL club season (passing, rushing, receiving) from the club-season article on English Wikipedia (CC BY-SA 4.0), shown on the club's
-- season page. Add-only: one table, one view. Apply to DS1 first, then production (the table is empty until a data release fills it). The site hides the
-- section while api.team_season_leader is missing (a 404) or empty, so the site works before and after. No existing object changes.
--   core.team_season_leader   one row per player line of a leaders table: team season, category, order in the article, the name as written, the person only
--                             where the match is certain (db/build/238), the figures as text by key
-- About 700 rows, a few hundred KB with its key.
create table if not exists core.team_season_leader (
  team_season_id integer  not null references core.team_season on delete cascade,
  category       text     not null check (category in ('passing', 'rushing', 'receiving', 'offence')),
  ord            smallint not null,
  name           text     not null,
  person_id      bigint references core.person on delete set null,   -- a person deleted leaves the line, as text (the next run of db/build/238 sets matched_by and qid again)
  matched_by     text check (matched_by in ('wikidata', 'roster')),   -- wikidata: the article the name links to is the person's Wikidata item; roster: the one person of that name on the club's roster that season
  qid            text,                                                -- the Wikidata item of the linked article, when it names one
  stats          jsonb    not null,
  source_id      smallint references meta.source,
  source_key     text     not null,                                   -- enwiki:<article title>@<revision id>
  primary key (team_season_id, category, ord)
);
comment on table core.team_season_leader is 'Club leaders of a CFL club season as the club-season article on English Wikipedia (CC BY-SA 4.0) lists them. person_id is set only where the match is certain; otherwise the name is shown as text (db/build/238).';

-- api.team_season_leader: read with team_season_id=eq.N.
create or replace view api.team_season_leader as
select team_season_id, category, ord, name, person_id, stats, source_key
from core.team_season_leader;
comment on view api.team_season_leader is 'The club leaders of a club season (passing, rushing, receiving; offence for the BC Lions'' combined table), in the article''s order. person_id is null where the name is shown as text; source_key names the article and its revision (enwiki:<title>@<revision id>). Read with team_season_id=eq.N (migration 175).';
grant select on api.team_season_leader to anon, authenticated;
