-- Follows 067_game_venue.sql. core.franchise_home_venue gets a fourth basis, 'games': periods built from the venue the games themselves show
-- (the Retrosheet park, the nflverse stadium or the NHL API venue most of a club's home games had in a season), which step 199 adds to the
-- chain step 198 builds from the seeds, core.franchise_brand and core.franchise_venue. legacy_game_venue.home_prelim keeps step 198's chain so
-- that a rerun of step 199 alone starts from it (DS1 and working copy only).
-- On production: apply this file (the alter is add-only: one more value allowed) before the release of core.franchise_home_venue.
alter table core.franchise_home_venue drop constraint if exists franchise_home_venue_basis_check;
alter table core.franchise_home_venue add constraint franchise_home_venue_basis_check check (basis in ('games', 'seed', 'brand', 'wikidata'));
comment on table core.franchise_home_venue is 'The venue a club played its home games in, by period: games (the venue most home games had in a season), else seed (Wikipedia or dated Wikidata, checked), else franchise_brand, else franchise_venue; cut to the days the venue stood; a city item is never a venue.';

create table if not exists legacy_game_venue.home_prelim (
  franchise_id  integer not null,
  venue_id      integer not null,
  valid_during  daterange not null,
  basis         text not null,
  source_id     smallint not null,
  primary key (franchise_id, valid_during)
);
