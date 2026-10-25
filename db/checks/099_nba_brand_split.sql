-- what: two brand rows of one NBA franchise and source that carry the same colours, logo and home venue and touch or overlap, so one era is split (cut at SPX's first and last game before step 147_nba_identity_merge); step 175_team_brand joins them
-- baseline: 0
select a.franchise_id, a.franchise_brand_id as brand_id, b.franchise_brand_id as other_id, a.source_key, a.valid_during::text, b.valid_during::text as other_valid_during
from core.franchise_brand a
join core.franchise_brand b on b.franchise_id = a.franchise_id and b.source_id = a.source_id and b.franchise_brand_id > a.franchise_brand_id
  and (a.valid_during && b.valid_during or a.valid_during -|- b.valid_during)
  and (a.primary_hex, a.secondary_hex, a.logo_url, a.logo_licence, a.logo_page, a.home_venue, a.latitude, a.longitude, a.source_key)
      is not distinct from (b.primary_hex, b.secondary_hex, b.logo_url, b.logo_licence, b.logo_page, b.home_venue, b.latitude, b.longitude, b.source_key)
where a.franchise_id in (select franchise_id from core.franchise_league where league_code = 'nba')
order by a.franchise_id, a.franchise_brand_id, b.franchise_brand_id
