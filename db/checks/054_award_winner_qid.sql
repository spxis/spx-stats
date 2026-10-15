-- what: award winners shown under a bare Wikidata number ("Q715377") instead of a name: Wikidata's label service answers the id when an item has no English label; step 170 must resolve the name (169, legacy_people.item, core.person) or leave the winner out
-- baseline: 0
select w.award_winner_id, a.code as award_code, w.winner_name, w.source_key
from core.award_winner w join core.award a using (award_id)
where btrim(w.winner_name) ~ '^Q[0-9]+$' or w.note ~ '(^|[^A-Za-z0-9])Q[0-9]{2,}($|[^A-Za-z0-9])'
