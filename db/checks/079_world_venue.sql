-- what: world soccer stadiums (scripts/world_stadiums/): a pitch size for an item that is not a venue, a pitch size that a football pitch cannot have, a venue
--       that closed before it opened, a soccer match with a venue_id but no Wikidata id whose venue has no exact name of the match's stadium (db/build/207 fills those by name) or is in another city, and a match whose venue_id is not the venue of its Wikidata id (or of
--       the item in the VALUES list below, the same pairs as db/seed/soccer_venue_fix.csv). One plain query, as release.py needs.
-- baseline: 0
select 'pitch for an item that is not a venue: ' || p.wikidata_id as problem
from core.venue_pitch p
where not exists (select 1 from core.venue v where v.source_key = p.wikidata_id and v.source_id = (select source_id from meta.source where code = 'wikidata'))
union all
select 'pitch a football pitch cannot have: ' || p.wikidata_id || ' ' || p.length_m || ' x ' || p.width_m
from core.venue_pitch p
where p.length_m < p.width_m or p.length_m not between 90 and 120 or p.width_m not between 50 and 90
union all
select 'venue closed before it opened: ' || v.source_key
from core.venue v
where v.opened_on is not null and v.closed_on is not null and v.closed_on < v.opened_on
union all
select 'soccer match venue_id without a Wikidata id or an exact venue name: ' || m.source_key
from core.soccer_match m
where m.venue_id is not null and m.venue_wikidata_id is null
  and not exists (select 1 from core.venue_name n where n.venue_id = m.venue_id and core.fold_text(n.name) = core.fold_text(m.venue_name))
union all
select 'soccer match venue_id in another city than the match: ' || m.source_key || ' ' || m.venue_city || ' -> ' || v.city
from core.soccer_match m join core.venue v on v.venue_id = m.venue_id
where m.venue_wikidata_id is null and nullif(core.fold_text(m.venue_city), '') is not null and core.fold_text(v.city) <> core.fold_text(m.venue_city)
union all
select 'soccer match venue_id of another item: ' || m.source_key || ' ' || m.venue_wikidata_id || ' -> ' || v.source_key
from core.soccer_match m
join core.venue v on v.venue_id = m.venue_id
left join (values ('Q8842808', 'Q909851'), ('Q2688256', 'Q1136764'), ('Q4835088', 'Q176460'), ('Q2090', 'Q152599'), ('Q2937412', 'Q199359')) f(match_id, venue_qid) on f.match_id = m.venue_wikidata_id
where m.venue_wikidata_id is not null and v.source_key <> coalesce(f.venue_qid, m.venue_wikidata_id)
