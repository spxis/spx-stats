-- Copy the NHL's numeric game id onto core.game_official. The id already sits in core.external_id
-- (source nhl_api; external_key is the ten digits, from db/build/145). Rerunnable. DS1 only.
-- A release of core.game_official carries the rows to production after migration 115 is on both.

begin;

insert into core.game_official (game_id, nhl_id)
select distinct on (e.entity_id) e.entity_id, e.external_key::bigint
from core.external_id e
join meta.source s on s.source_id = e.source_id and s.code = 'nhl_api'
where e.entity_kind = 'game'
  and e.external_key ~ '^[0-9]{10}$'
order by e.entity_id, e.external_key
on conflict (game_id) do update set nhl_id = excluded.nhl_id
where core.game_official.nhl_id is distinct from excluded.nhl_id;

delete from core.game_official o
where not exists (
  select 1 from core.external_id e
  join meta.source s on s.source_id = e.source_id and s.code = 'nhl_api'
  where e.entity_kind = 'game' and e.entity_id = o.game_id and e.external_key = o.nhl_id::text
);

commit;
