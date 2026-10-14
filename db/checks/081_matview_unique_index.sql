-- what: materialized views in schema api with no usable unique index (api.refresh() would have to refresh them with a plain refresh, which blocks every read of the view while it runs; migration 097)
-- baseline: 0
select n.nspname || '.' || c.relname as matview_without_unique_index
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'm' and n.nspname = 'api'
  and not exists (select 1 from pg_index i
                  where i.indrelid = c.oid and i.indisunique and i.indisvalid and i.indislive and i.indimmediate
                    and i.indpred is null and i.indexprs is null)
