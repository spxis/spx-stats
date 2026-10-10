-- Take one backup's contribution back out of legacy_spx, so it can be merged
-- again: rows only it held are deleted, its tag is removed from the rest, and
-- the old versions it recorded are dropped.  psql -v tag=2008-03-24 -f ...
do $$
declare t text; tag text := current_setting('spx.tag');
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'legacy_spx' and column_name = '_seen_in' loop
    execute format('delete from legacy_spx.%I where _seen_in = array[%L]', t, tag);
    execute format('update legacy_spx.%I set _seen_in = array_remove(_seen_in, %L) where _seen_in @> array[%L]', t, tag, tag);
  end loop;
  delete from legacy_spx._superseded where seen_in = tag;
end $$;
