-- A champion a source names for a season in which core holds no team seasons (the NFL before 1999) has no franchise, so the
-- league page, the season page and the team page cannot link or count the title. Where the champion's name belongs to exactly
-- one franchise of that league (the full name, or the name ends with the nickname), the franchise gets an empty team season
-- there (no games, no standings) and the champion row links to it. Runs after the champions are written (165, 171).
--  * Only a season where no champion row has a team season yet is touched.
--  * A name that fits no franchise or more than one is left unlinked.
--  * The empty team season carries no identity, so the team keeps its nearest known name; the champion row keeps the name the source printed.
-- A champion who was never in the league is logged: the all-time page counts league clubs only.
-- Safe to run again.
begin;

create temp table pending as
select w.award_winner_id, w.season_id, w.winner_name, w.source_id, a.league_code
from core.award_winner w join core.award a using (award_id)
where a.kind = 'championship' and w.team_season_id is null
  and not exists (select 1 from core.award_winner o join core.award oa using (award_id)
                  where oa.kind = 'championship' and oa.league_code = a.league_code and o.season_id = w.season_id and o.team_season_id is not null);

create temp table pick as
select p.award_winner_id, p.season_id, p.source_id, min(i.franchise_id) as franchise_id
from pending p
join core.franchise_league fl on fl.league_code = p.league_code
join core.franchise_identity i on i.franchise_id = fl.franchise_id
where lower(p.winner_name) = lower(i.full_name) or lower(p.winner_name) like '% ' || lower(i.nickname)
group by p.award_winner_id, p.season_id, p.source_id
having count(distinct i.franchise_id) = 1;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct franchise_id, season_id, source_id from pick
on conflict (franchise_id, season_id) do nothing;

update core.award_winner w set team_season_id = t.team_season_id
from pick k join core.team_season t on t.franchise_id = k.franchise_id and t.season_id = k.season_id
where w.award_winner_id = k.award_winner_id;

-- A champion whose franchise never had a regular-season standing in the league (it met league clubs in the final but was not a member).
create temp table new_outside as
select w.source_id, 'award_winner'::text as entity_kind, 'final:' || s.league_code || ':' || s.start_year || ':outside' as entity_key,
       format('%s %s: %s won the final but never played a regular season in the %s, so the all-time page (league clubs only) has one title fewer than the champions list',
              upper(s.league_code), s.start_year, w.winner_name, upper(s.league_code)) as issue,
       'Kept as champion; not counted among the league clubs'::text as resolution
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
join core.team_season ts on ts.team_season_id = w.team_season_id
where a.kind = 'championship' and w.source_id = (select source_id from meta.source where code = 'spx_stats_derived')
  -- (in this league: a club of the PCHA or WCHL that won the NHL's Stanley Cup final has standings, but not in the NHL)
  and not exists (select 1 from core.team_season t join core.season ls on ls.season_id = t.season_id and ls.league_code = s.league_code
                  join core.standing_from_games c on c.team_season_id = t.team_season_id and c.phase = 'regular'
                  where t.franchise_id = ts.franchise_id)
  and not exists (select 1 from core.team_season t join core.season ls on ls.season_id = t.season_id and ls.league_code = s.league_code
                  join core.standing x on x.team_season_id = t.team_season_id where t.franchise_id = ts.franchise_id);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select source_id, entity_kind, entity_key, issue, resolution from new_outside n
where not exists (select 1 from meta.data_issue d
                  where d.entity_kind = n.entity_kind and d.entity_key = n.entity_key and d.source_id is not distinct from n.source_id);
delete from meta.data_issue d
where d.entity_kind = 'award_winner' and d.entity_key like 'final:%:outside'
  and d.source_id = (select source_id from meta.source where code = 'spx_stats_derived')
  and not exists (select 1 from new_outside n where n.entity_key = d.entity_key);

select 'champions linked' as k, count(*) from pick
union all select 'outside the league', count(*) from meta.data_issue where entity_kind = 'award_winner' and entity_key like 'final:%:outside';
commit;
