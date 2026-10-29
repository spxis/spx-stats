-- The NHL club (or clubs) a minor-league club was affiliated with in a season: core.team_season_affiliation, read by api.team_season_affiliation.
-- One row per affiliated club: a season with two parent clubs ("BOS/CGY") has positions 1 and 2. `label` is the affiliation as the source prints it
-- ("BOS", "independent"). `parent_franchise_id` is set only when the code names exactly one NHL franchise whose identity in that season carries it
-- (core.franchise_identity.abbreviation); a code that names none, or more than one, is left empty and logged in meta.data_issue, never guessed.
-- 'independent' has no parent league and no parent franchise. A minor-league club is never an NHL franchise: this table is the only link between them.
-- The key is the team season and the position, so a rerun keeps every row. Filled by db/build/232_ahl_affiliation.sql (the AHL first).
-- On production: apply this file, then a data release of core.team_season_affiliation (AGENTS.md section 8, item 5).
-- Rerunnable.

create table if not exists core.team_season_affiliation (
  team_season_id      integer not null references core.team_season on delete cascade,
  position            smallint not null check (position between 1 and 4),
  label               text not null,
  parent_league_code  text references ref.league,
  parent_franchise_id integer references core.franchise,
  source_id           smallint references meta.source,
  primary key (team_season_id, position),
  check (parent_franchise_id is null or parent_league_code is not null)
);
create index if not exists team_season_affiliation_parent_idx on core.team_season_affiliation (parent_franchise_id) where parent_franchise_id is not null;
comment on table core.team_season_affiliation is 'The parent club(s) of a minor-league team season (AHL first). Built by db/build/232_ahl_affiliation.sql from the source standings; an unresolved code has no parent franchise.';

create or replace view api.team_season_affiliation as
select s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       a.position,
       a.label,
       a.parent_league_code as parent_league,
       a.parent_franchise_id,
       i.full_name as team,
       pi.full_name as parent_team
from core.team_season_affiliation a
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
left join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id
left join core.franchise_identity pi on pi.franchise_id = a.parent_franchise_id and pi.valid_during @> make_date(s.start_year, 11, 15);
comment on view api.team_season_affiliation is 'The parent NHL club(s) of a minor-league club in a season (parent_franchise_id empty when the code is independent or could not be placed with certainty). Migration 160.';

grant select on api.team_season_affiliation to anon, authenticated;
