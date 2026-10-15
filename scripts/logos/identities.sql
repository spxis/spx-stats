select json_agg(r order by fid, y0) from (
select i.franchise_identity_id as iid, i.franchise_id as fid,
 coalesce((select string_agg(distinct league_code, ',' order by league_code) from core.franchise_league l where l.franchise_id = i.franchise_id), 'other:' || f.sport_code) as lg,
 i.full_name as name, i.location, i.nickname,
 extract(year from lower(i.valid_during))::int as y0, extract(year from upper(i.valid_during))::int as y1,
 (select row_to_json(x) from (select b.logo_licence as licence, b.logo_url as url, b.logo_page as page
    from core.franchise_brand b
    where b.franchise_id = i.franchise_id and b.logo_url is not null and b.valid_during && i.valid_during
    order by (b.logo_licence ilike 'Non-free%') asc, upper_inf(b.valid_during) desc limit 1) x) as cur,
 (select count(*) from core.franchise_brand b where b.franchise_id = i.franchise_id and b.logo_url is not null) as fr_logos
from core.franchise_identity i join core.franchise f using (franchise_id)
) r;
