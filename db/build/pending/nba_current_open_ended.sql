-- One-off DS1 repair (pending: not part of build_core.sh). The 30 current NBA clubs' identities and NBA memberships end on
-- 2026-07-01 (step 147 closes them at the end of the last season it read), while every other league's current rows are open-ended.
-- The 2026-27 NBA team seasons therefore have no identity, check "team seasons made here carry the club's name" fails, and the
-- daily scores job has refused to commit for every league since 2026-10-20. Open the current NBA rows (ids kept) and give the
-- 2026-27 team seasons the identity in force on the season's first day. Rerunnable: a second run changes 0 rows.
-- The lasting fix belongs in db/build/147 (a current club's last identity and membership stay open-ended).
begin;
update core.franchise_league fl
   set valid_during = daterange(lower(fl.valid_during), null)
 where fl.league_code = 'nba' and upper(fl.valid_during) = date '2026-07-01';

update core.franchise_identity fi
   set valid_during = daterange(lower(fi.valid_during), null)
 where upper(fi.valid_during) = date '2026-07-01'
   and exists (select 1 from core.franchise_league fl
               where fl.franchise_id = fi.franchise_id and fl.league_code = 'nba' and upper_inf(fl.valid_during))
   and not exists (select 1 from core.franchise_identity later
                   where later.franchise_id = fi.franchise_id and lower(later.valid_during) >= date '2026-07-01');

update core.team_season ts
   set franchise_identity_id = fi.franchise_identity_id
  from core.season s, core.franchise_identity fi
 where s.season_id = ts.season_id and s.league_code = 'nba' and s.start_year = 2026
   and ts.franchise_identity_id is null
   and fi.franchise_id = ts.franchise_id and fi.valid_during @> date '2026-10-01';
commit;
