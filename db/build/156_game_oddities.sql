-- Results a league cannot have, and published figures the games do not reproduce. Runs after the game steps (100-155).
--  * NBA: the league has no ties. A final game filed with equal scores (a typo in a source, or a 0-0 placeholder) stays
--    listed but with no result (status scheduled, no scores, as step 147 does for a game with no result), and a data_issue says what was there. Wikipedia's own conflict
--    case (the home club's log gives the tie, the other club's log a result) is settled earlier, in step 147.
--  * CFL: where a season's published overtime losses (Wikipedia standings) differ from the overtime games we hold,
--    a data_issue records both numbers. The published standings are kept.
-- Safe to run again.
begin;

create temp table tie as
select g.game_id, g.source_id, g.source_key, g.game_date, g.home_score
from core.game g join core.season s using (season_id)
where s.league_code = 'nba' and g.status = 'final' and g.home_score is not null and g.home_score = g.away_score;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select t.source_id, 'game', t.source_key, format('NBA: a game on %s is filed as a %s-%s tie, which the NBA does not have', t.game_date, t.home_score, t.home_score),
       'Listed without a result: the scores are unknown'
from tie t
where not exists (select 1 from meta.data_issue i where i.entity_kind = 'game' and i.entity_key = t.source_key and i.issue like 'NBA: a game on % tie%');

update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null, updated_at = now() from tie t where g.game_id = t.game_id;

delete from meta.data_issue where entity_kind = 'team_season' and entity_key like 'wikipedia:cfl:%:otl'
  and source_id = (select source_id from meta.source where code = 'wikipedia');

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'team_season', 'wikipedia:cfl:' || p.start_year || ':otl',
       format('CFL %s: Wikipedia standings publish %s overtime losses; the games we hold have %s overtime games', p.start_year, p.published, coalesce(o.played, 0)),
       'Published standings kept; the games are incomplete'
from (select s.start_year, sum(st.ot_losses) as published
      from core.standing st join core.team_season ts using (team_season_id) join core.season s using (season_id)
      where s.league_code = 'cfl' and st.phase = 'regular' and st.ot_losses > 0
        and st.source_id = (select source_id from meta.source where code = 'wikipedia')
      group by 1) p
left join (select s.start_year, count(*) as played
           from core.game g join core.season s using (season_id)
           where s.league_code = 'cfl' and g.phase = 'regular' and g.status = 'final' and g.went_to_overtime
           group by 1) o using (start_year)
where p.published <> coalesce(o.played, 0);

select 'nba ties emptied' as k, count(*) from tie
union all select 'cfl otl issues', count(*) from meta.data_issue where entity_kind = 'team_season' and entity_key like 'wikipedia:cfl:%:otl';
commit;
