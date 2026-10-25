-- The checks of checks.sql that read rows of every league, on their own so a scratch test can feed them made-up rows
-- (scripts/daily/test/leaguecheck-test.sh). Each looks only at the leagues in temp table scope, which checks.sql has already cut down to the
-- league this run applies: a fault in another league's rows (a team season without an identity, a staged game that is not a game) must not
-- stop this one.
-- Needs: temp tables _checks, scope (league, season), sg (source_key, league, season, act), owned_season (league, season), src (source_id),
-- and the core tables season, team_season, game, external_id.
insert into _checks
select 'every result and cancelled game staged is a game', count(*) = 0, count(*) || ' missing' || coalesce(': ' || string_agg(c.source_key, '; '), '')
from (select s.source_key from sg s where s.act in ('result', 'cancel') and s.league in (select league from scope)
        and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src))
        and not exists (select 1 from core.external_id e where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = s.source_key)) c;
insert into _checks
select 'every staged scheduled game of a new season is a game', count(*) = 0, count(*) || ' missing'
from sg s where s.act = 'schedule' and s.league in (select league from scope) and (s.league, s.season) in (select league, season from owned_season)
  and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src))
  and not exists (select 1 from core.external_id e where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = s.source_key);
insert into _checks
select 'team seasons made here carry the club''s name', count(*) = 0, count(*) || ' without an identity'
from core.team_season t join core.season s using (season_id)
where t.source_id = (select source_id from src) and t.franchise_identity_id is null and s.league_code in (select league from scope);
