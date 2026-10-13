-- A player can hold more than one position (Shohei Ohtani pitches and hits). core.person.primary_position stays the one main
-- position; core.person.positions lists every position the archive knows, the main one first, in lower case.
-- db/build/186_person_positions.sql fills it (Wikidata P413 and the main position). api.people gains `positions` as its last
-- column; until the step has run it falls back to the main position alone, so nothing reads empty. For DS1 and production.
-- The players index on production is 050_player_index_positions.sql. Rerunnable.
begin;

alter table core.person add column if not exists positions text[];
comment on column core.person.positions is 'Every position the archive states for the person, lower case, the main one (primary_position) first. Built by db/build/186_person_positions.sql.';

-- api.people (032) with `positions` added at the end.
create or replace view api.people as
select p.person_id, p.full_name as name, p.kind, p.birth_date, p.death_date, p.birth_place, p.birth_country_code, p.birth_lat, p.birth_lon,
       p.nationality_code, p.height_cm, p.primary_position as position, p.hall_of_fame_year, p.debut_on as debut, p.final_game_on as final,
       (select count(*)::int from core.award_winner w join core.award a using (award_id)
         where w.person_id = p.person_id and a.kind = 'person_award') as award_count,
       (select count(distinct (c.season_id, c.team_season_id))::int
          from (select team_season_id from core.roster_stint where person_id = p.person_id and role = 'player'
                union select team_season_id from core.player_season_stat where person_id = p.person_id) t
          join core.award_winner c on c.team_season_id = t.team_season_id
          join core.award a on a.award_id = c.award_id and a.kind = 'championship') as championship_count,
       sp.seasons_played, sp.first_season, sp.last_season,
       (select array_agg(distinct l order by l) from (
          select s.league_code as l from core.team_season ts join core.season s using (season_id)
           where ts.team_season_id in (select team_season_id from core.roster_stint where person_id = p.person_id
                                       union select team_season_id from core.player_season_stat where person_id = p.person_id)
          union select s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id = p.person_id) x) as leagues,
       coalesce(p.positions, case when p.primary_position is not null then array[lower(p.primary_position)] end) as positions
from core.person p
left join lateral (
  select count(distinct s.season_id)::int as seasons_played, min(s.start_year) as first_season, max(s.start_year) as last_season
  from (select team_season_id from core.roster_stint where person_id = p.person_id and role = 'player'
        union select team_season_id from core.player_season_stat where person_id = p.person_id) t
  join core.team_season ts using (team_season_id) join core.season s using (season_id)) sp on true;
grant select on api.people to anon, authenticated;

commit;
