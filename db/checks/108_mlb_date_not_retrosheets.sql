-- what: an MLB game from SPX whose date is not Retrosheet's (John, 2026-11-02/03: where Retrosheet disagrees on a date, Retrosheet wins); a suspended game that Retrosheet says was completed on SPX's date may differ; step 140 moves the rest in place
-- baseline: 0
-- needs db/build/140 on DS1 (it reads legacy_retrosheet).
select g.game_id, g.source_key, g.game_date as spx_date, l.game_date as retrosheet_date, e.external_key
from core.game g
join core.external_id e on e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select source_id from meta.source where code = 'retrosheet')
join legacy_retrosheet.game_log l on to_char(l.game_date, 'YYYYMMDD') || ':' || l.home || ':' || l.visitor || ':' || l.game_number || ':' || l.game_type = e.external_key
where g.source_id <> (select source_id from meta.source where code = 'retrosheet')
  and g.game_date <> l.game_date
  and not coalesce(split_part(l.completion, ',', 1) ~ '^[0-9]{8}$' and to_date(split_part(l.completion, ',', 1), 'YYYYMMDD') = g.game_date, false)
order by g.game_date, g.game_id
