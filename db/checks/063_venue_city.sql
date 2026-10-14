-- what: a venue that is really a city (or another place: a state, a county, a neighbourhood). A home venue whose Wikidata item is a city, or whose label is the city's own name, in core.brand_venue (what api.venue_place and the /venues list are built from) or core.venue; a brand row that names such a venue. A city is not a venue (AGENTS.md, section 3): fix the source step (175, 176, 198) or add the item to db/seed/not_a_venue.csv.
-- baseline: 0
select 'brand venue ' || v.source_key || ' ' || v.venue_label || ' is a city or place: ' || array_to_string(p.instance_of, ', ') as problem
from core.brand_venue v
join (select qid, instance_of from legacy_franchise_info.place union all select qid, instance_of from legacy_game_venue.venue) p on p.qid = v.source_key
where array_to_string(p.instance_of, '; ') ~* '(^|[; ])(city|town|village|municipality|borough|metropolis|megacity|hamlet|suburb|neighborhood|neighbourhood|county seat|settlement|census-designated place|unincorporated community|metropolitan statistical area|census division|u\.s\. state|capital)([; ]|$)|(city|municipality|town|borough) (in|of) |big city|largest city|global city|border city|port city|charter city|consolidated city'
   or lower(btrim(v.venue_label)) = lower(btrim(v.city))
union all
select 'core.venue ' || v.source_key || ' is a city or place: ' || array_to_string(p.instance_of, ', ')
from core.venue v
join (select qid, instance_of from legacy_franchise_info.place union all select qid, instance_of from legacy_game_venue.venue) p on p.qid = v.source_key
where v.source_id = (select source_id from meta.source where code = 'wikidata')
  and array_to_string(p.instance_of, '; ') ~* '(^|[; ])(city|town|village|municipality|borough|metropolis|megacity|hamlet|suburb|neighborhood|neighbourhood|county seat|settlement|census-designated place|unincorporated community|metropolitan statistical area|census division|u\.s\. state|capital)([; ]|$)|(city|municipality|town|borough) (in|of) |big city|largest city|global city|border city|port city|charter city|consolidated city|sports competition|disambiguation'
union all
select 'franchise_brand row names a city as home venue: ' || b.franchise_id || ' ' || b.home_venue
from core.franchise_brand b
join core.brand_venue v on v.venue_label = b.home_venue and v.latitude = b.latitude and v.longitude = b.longitude
where lower(btrim(v.venue_label)) = lower(btrim(v.city))
