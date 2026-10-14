-- what: a home venue that is closed or demolished but has neither a closing year nor a logged reason, a closing year before the opening year, a status that does not fit the year, or a surface that is not in the fixed list (ref.venue_surface). A venue a source says is gone and gives no year must be in meta.data_issue (entity_kind venue_closed), db/build/193_venue_names.sql logs it.
-- baseline: 0
select 'closed venue without a year: ' || i.wikidata_id as problem
from core.brand_venue_info i
where i.status = 'closed' and i.closed_year is null
union all
select 'year without status closed: ' || i.wikidata_id
from core.brand_venue_info i
where i.closed_year is not null and i.status is distinct from 'closed'
union all
select 'demolished venue not logged: ' || i.wikidata_id
from core.brand_venue_info i
where i.status = 'demolished' and not exists (select 1 from meta.data_issue d where d.entity_kind = 'venue_closed' and d.entity_key = i.wikidata_id)
union all
select 'venue without a status: ' || i.wikidata_id
from core.brand_venue_info i
where i.status is null
union all
select 'closed before opened: ' || i.wikidata_id || ' ' || i.opened_year || ' > ' || i.closed_year
from core.brand_venue_info i
where i.opened_year > i.closed_year
union all
select 'surface not in the list: ' || i.wikidata_id || ' ' || i.surface
from core.brand_venue_info i
where i.surface is not null and i.surface not in (select surface from ref.venue_surface)
union all
select 'period with an unknown value: ' || p.wikidata_id || ' ' || p.kind || ' ' || p.value
from core.brand_venue_period p
where (p.kind = 'surface' and p.value not in (select surface from ref.venue_surface)) or (p.kind = 'roof' and p.value not in ('open', 'dome', 'retractable'))
union all
select 'period for a venue without facts: ' || p.wikidata_id
from core.brand_venue_period p
where not exists (select 1 from core.brand_venue_info i where i.wikidata_id = p.wikidata_id)
