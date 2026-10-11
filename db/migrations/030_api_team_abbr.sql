-- Team abbreviations, era by era, for the site's monograms, phone tables, calendars and map labels.
-- One row per identity of a franchise (core.franchise_identity), with the dates it was in use.
create or replace view api.team_abbr as
select fl.league_code as league,
       i.franchise_id,
       lower(i.valid_during) as valid_from,
       upper(i.valid_during) as valid_to,
       i.abbreviation
from core.franchise_identity i
join core.franchise_league fl on fl.franchise_id = i.franchise_id
where i.abbreviation is not null;

grant select on api.team_abbr to anon, authenticated;
