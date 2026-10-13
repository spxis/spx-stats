-- Seasons that were not played (a lockout, a strike, a pandemic): a short article on why, and the data the "before and after" page reads.
-- core.season_outage holds one paragraph per missed season, in English with French and Japanese when known, with its source. It has no
-- season row to hang on (the league has no core.season for a year it did not play), so it is keyed by league and start year.
-- Seed: db/seed/season_outage.csv, filled by db/build/195_season_outage.sql.
-- api.team_season_identity gives each club's city and nickname in a season, so the page can tell a move from a rename.
-- api.season_roster lists the players of each club's season with their first, last and number of seasons in that league and their
-- games played, so the page can show who stayed, left, arrived, debuted or finished across the gap. It filters by league and year
-- (a read of the whole view is slow and is cut off by the statement timeout). Rerunnable.

create table if not exists core.season_outage (
  league_code     text not null references ref.league,
  start_year      smallint not null,
  kind            text not null check (kind in ('lockout', 'strike', 'pandemic', 'war', 'other')),
  stopped_on      date,
  cancelled_on    date,
  resumed_on      date,
  games_cancelled integer check (games_cancelled > 0),
  note_en         text not null,
  note_fr         text,
  note_ja         text,
  source_id       smallint not null references meta.source,
  source_url      text,
  primary key (league_code, start_year)
);
comment on table core.season_outage is 'A season a league did not play, and why. Seed: db/seed/season_outage.csv.';
comment on column core.season_outage.stopped_on is 'The day the stoppage began (a lockout or strike), when the source gives one.';
comment on column core.season_outage.cancelled_on is 'The day the season was called off.';
comment on column core.season_outage.resumed_on is 'The first day of play after the stoppage.';
comment on column core.season_outage.games_cancelled is 'Regular-season games of the whole league that were not played, when the source gives the number.';

create or replace view api.season_outage as
select o.league_code as league,
       o.start_year as year,
       o.kind,
       o.stopped_on,
       o.cancelled_on,
       o.resumed_on,
       o.games_cancelled,
       o.note_en,
       o.note_fr,
       o.note_ja,
       src.code as source,
       o.source_url
from core.season_outage o
join meta.source src on src.source_id = o.source_id;

create or replace view api.team_season_identity as
select s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       ts.team_season_id,
       i.location,
       i.nickname,
       i.full_name as team,
       i.region,
       i.country_code
from core.team_season ts
join core.season s using (season_id)
left join core.franchise_identity i using (franchise_identity_id);

drop view if exists api.season_roster;
create view api.season_roster as
select s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       ts.team_season_id,
       p.person_id,
       p.full_name as name,
       p.primary_position as position,
       (select sum(x.games_played)::int from core.player_season_stat x
         where x.team_season_id = ts.team_season_id and x.person_id = p.person_id and x.phase = 'regular' and x.is_total is not true) as games_played,
       sp.first_season,
       sp.last_season,
       sp.seasons_played
from core.team_season ts
join core.season s using (season_id)
cross join lateral (
  select person_id from core.player_season_stat where team_season_id = ts.team_season_id
  union
  select person_id from core.roster_stint where team_season_id = ts.team_season_id and role = 'player') on_team
join core.person p on p.person_id = on_team.person_id
cross join lateral (
  select min(s2.start_year) as first_season, max(s2.start_year) as last_season, count(distinct s2.season_id)::int as seasons_played
  from (select team_season_id from core.player_season_stat where person_id = p.person_id
        union
        select team_season_id from core.roster_stint where person_id = p.person_id and role = 'player') t
  join core.team_season ts2 on ts2.team_season_id = t.team_season_id
  join core.season s2 on s2.season_id = ts2.season_id
  where s2.league_code = s.league_code) sp;
comment on view api.season_roster is 'Players of each club season with their career span in that league. Filter by league and year.';

grant select on api.season_outage, api.team_season_identity, api.season_roster to anon, authenticated;
