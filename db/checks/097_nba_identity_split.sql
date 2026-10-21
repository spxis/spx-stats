-- what: an NBA franchise whose full name, country and abbreviation carry on unbroken into the next identity row, so one run under one name is split in two (the Heat and Spurs began on 2012-04-27); step 147_nba_identity_merge joins them
-- baseline: 0
select franchise_id, prev_id as identity_id, franchise_identity_id as next_id, full_name, valid_during::text as next_valid_during
from (
  select i.franchise_id, i.franchise_identity_id, i.full_name, i.valid_during,
         lag(i.franchise_identity_id) over w as prev_id,
         lag(upper(i.valid_during)) over w as prev_end,
         (lag(i.full_name) over w, lag(i.country_code) over w, lag(i.abbreviation) over w)
           is not distinct from (i.full_name, i.country_code, i.abbreviation) as same_name
  from core.franchise_identity i
  where i.franchise_id in (select franchise_id from core.franchise_league where league_code = 'nba')
  window w as (partition by i.franchise_id order by lower(i.valid_during), i.franchise_identity_id)
) x
where prev_id is not null and prev_end = lower(valid_during) and same_name
order by franchise_id, next_id
