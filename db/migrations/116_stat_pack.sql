-- Pack core.player_season_stat.stats as int4[] (migration 117 does the rewrite).
-- One slot per key, in core.stat_slot. Counting numbers are stored as themselves (scale 1).
-- The few real decimals are scaled so they survive as integers and come back as the same number:
--   basketball averages (a_*) and shooting percentages (p_*) as thousandths (27.35 -> 27350, 0.456 -> 456);
--   sacks and sack yards (sck, sckyds), passing and defense, as tenths (3.5 -> 35, never 3 or 35 on the way out).
-- api.person_stats and the other readers expand the array with core.stats_json, so the site still sees jsonb.
-- This file adds no second copy of the table. It does not rewrite core.player_season_stat.
-- Names checked free in db/migrations: core.stat_slot, core.stats_pack, core.stats_json, core.stats_merge.

create table if not exists core.stat_slot (
  stat_group text not null,
  key        text not null,
  ord        smallint not null check (ord > 0),
  scale      smallint not null check (scale in (1, 10, 1000)),
  primary key (stat_group, key),
  unique (stat_group, ord)
);
comment on table core.stat_slot is 'Key order and scale for core.player_season_stat.stats packed as int4[]. scale 1 stores the number; 10 stores tenths; 1000 stores thousandths.';

insert into core.stat_slot (stat_group, key, ord, scale) values
  ('skater', 'gp', 1, 1), ('skater', 'g', 2, 1), ('skater', 'a', 3, 1), ('skater', 'pts', 4, 1),
  ('skater', 'pim', 5, 1), ('skater', 'pm', 6, 1), ('skater', 'sog', 7, 1), ('skater', 'ppg', 8, 1),
  ('skater', 'shg', 9, 1), ('skater', 'gwg', 10, 1),
  ('goalie', 'gp', 1, 1), ('goalie', 'gs', 2, 1), ('goalie', 'w', 3, 1), ('goalie', 'l', 4, 1),
  ('goalie', 't', 5, 1), ('goalie', 'otl', 6, 1), ('goalie', 'ga', 7, 1), ('goalie', 'sa', 8, 1),
  ('goalie', 'sv', 9, 1), ('goalie', 'so', 10, 1), ('goalie', 'toi', 11, 1),
  ('batting', 'g', 1, 1), ('batting', 'ab', 2, 1), ('batting', 'r', 3, 1), ('batting', 'h', 4, 1),
  ('batting', '2b', 5, 1), ('batting', '3b', 6, 1), ('batting', 'hr', 7, 1), ('batting', 'rbi', 8, 1),
  ('batting', 'sb', 9, 1), ('batting', 'cs', 10, 1), ('batting', 'bb', 11, 1), ('batting', 'so', 12, 1),
  ('batting', 'ibb', 13, 1), ('batting', 'hbp', 14, 1), ('batting', 'sh', 15, 1), ('batting', 'sf', 16, 1),
  ('batting', 'gidp', 17, 1),
  ('pitching', 'w', 1, 1), ('pitching', 'l', 2, 1), ('pitching', 'g', 3, 1), ('pitching', 'gs', 4, 1),
  ('pitching', 'cg', 5, 1), ('pitching', 'sho', 6, 1), ('pitching', 'sv', 7, 1), ('pitching', 'ipouts', 8, 1),
  ('pitching', 'h', 9, 1), ('pitching', 'er', 10, 1), ('pitching', 'hr', 11, 1), ('pitching', 'bb', 12, 1),
  ('pitching', 'so', 13, 1), ('pitching', 'bfp', 14, 1), ('pitching', 'r', 15, 1), ('pitching', 'wp', 16, 1),
  ('pitching', 'bk', 17, 1), ('pitching', 'hbp', 18, 1),
  ('basketball', 'gp', 1, 1), ('basketball', 'gs', 2, 1), ('basketball', 'min', 3, 1), ('basketball', 'pts', 4, 1),
  ('basketball', 'reb', 5, 1), ('basketball', 'ast', 6, 1), ('basketball', 'stl', 7, 1), ('basketball', 'blk', 8, 1),
  ('basketball', 'a_min', 9, 1000), ('basketball', 'a_pts', 10, 1000), ('basketball', 'a_reb', 11, 1000),
  ('basketball', 'a_ast', 12, 1000), ('basketball', 'a_stl', 13, 1000), ('basketball', 'a_blk', 14, 1000),
  ('basketball', 'p_fg', 15, 1000), ('basketball', 'p_3p', 16, 1000), ('basketball', 'p_ft', 17, 1000),
  ('passing', 'gp', 1, 1), ('passing', 'cmp', 2, 1), ('passing', 'att', 3, 1), ('passing', 'yds', 4, 1),
  ('passing', 'td', 5, 1), ('passing', 'int', 6, 1), ('passing', 'sck', 7, 10), ('passing', 'sckyds', 8, 10),
  ('passing', 'fd', 9, 1), ('passing', '2pt', 10, 1), ('passing', 'ay', 11, 1), ('passing', 'yac', 12, 1),
  ('rushing', 'gp', 1, 1), ('rushing', 'att', 2, 1), ('rushing', 'yds', 3, 1), ('rushing', 'td', 4, 1),
  ('rushing', 'fum', 5, 1), ('rushing', 'fl', 6, 1), ('rushing', 'fd', 7, 1), ('rushing', '2pt', 8, 1),
  ('receiving', 'gp', 1, 1), ('receiving', 'rec', 2, 1), ('receiving', 'tgt', 3, 1), ('receiving', 'yds', 4, 1),
  ('receiving', 'td', 5, 1), ('receiving', 'fum', 6, 1), ('receiving', 'fl', 7, 1), ('receiving', 'fd', 8, 1),
  ('receiving', 'ay', 9, 1), ('receiving', 'yac', 10, 1), ('receiving', '2pt', 11, 1),
  ('defense', 'gp', 1, 1), ('defense', 'tkl', 2, 1), ('defense', 'ast', 3, 1), ('defense', 'tfl', 4, 1),
  ('defense', 'sck', 5, 10), ('defense', 'sckyds', 6, 10), ('defense', 'qbh', 7, 1), ('defense', 'int', 8, 1),
  ('defense', 'intyds', 9, 1), ('defense', 'pd', 10, 1), ('defense', 'ff', 11, 1), ('defense', 'fr', 12, 1),
  ('defense', 'td', 13, 1), ('defense', 'sfty', 14, 1),
  ('kicking', 'gp', 1, 1), ('kicking', 'fgm', 2, 1), ('kicking', 'fga', 3, 1), ('kicking', 'fgl', 4, 1),
  ('kicking', 'fg40', 5, 1), ('kicking', 'fg50', 6, 1), ('kicking', 'fg60', 7, 1), ('kicking', 'xpm', 8, 1),
  ('kicking', 'xpa', 9, 1),
  ('punting', 'gp', 1, 1), ('punting', 'punts', 2, 1), ('punting', 'yds', 3, 1), ('punting', 'long', 4, 1),
  ('punting', 'in20', 5, 1), ('punting', 'tb', 6, 1), ('punting', 'blk', 7, 1)
on conflict (stat_group, key) do update set ord = excluded.ord, scale = excluded.scale;

-- One stored integer back to the jsonb number readers already see. Scale 1 stays an integer (3, not 3.0).
create or replace function core.stat_scaled(n int, scale int) returns jsonb
language sql immutable parallel safe as $$
  select case when scale = 1 then to_jsonb(n) else to_jsonb(trim_scale(n::numeric / scale)) end
$$;

create or replace function core.stats_json(grp text, packed int4[]) returns jsonb
language sql stable parallel safe as $$
  select coalesce(
    (select jsonb_object_agg(s.key, core.stat_scaled(packed[s.ord], s.scale) order by s.ord)
     from core.stat_slot s
     where s.stat_group = grp and packed[s.ord] is not null),
    '{}'::jsonb)
$$;

-- Absent keys stay absent (a null slot), never a stored zero. An unknown key is an error, never dropped.
create or replace function core.stats_pack(grp text, doc jsonb) returns int4[]
language plpgsql stable as $$
declare
  slots int4[];
  r record;
  raw text;
  scaled numeric;
  unknown text;
  n int;
begin
  if doc is null or doc = '{}'::jsonb then
    return '{}'::int4[];
  end if;
  select string_agg(k, ', ' order by k) into unknown
  from jsonb_object_keys(doc) k
  where not exists (select 1 from core.stat_slot s where s.stat_group = grp and s.key = k);
  if unknown is not null then
    raise exception 'stat group % has no slot for %', grp, unknown;
  end if;
  select max(ord) into n from core.stat_slot where stat_group = grp;
  -- Lower bound stays 1 even when the first keys are absent. Assigning into '{}' would start the array at the first present slot.
  slots := array_fill(null::int4, array[n]);
  for r in select key, ord, scale from core.stat_slot where stat_group = grp order by ord loop
    raw := doc ->> r.key;
    if raw is not null then
      scaled := round(raw::numeric * r.scale);
      if scaled > 2147483647 or scaled < -2147483648 then
        raise exception 'stat %.% does not fit in int4', grp, r.key;
      end if;
      slots[r.ord] := scaled::int;
    end if;
  end loop;
  return slots;
end
$$;

-- Right-hand value wins when it is present, same as jsonb ||. A null slot does not erase the left-hand value.
create or replace function core.stats_merge(a int4[], b int4[]) returns int4[]
language sql immutable parallel safe as $$
  select case
    when a is null then b
    when b is null then a
    else array(
      select coalesce(b[i], a[i])
      from generate_series(1, greatest(coalesce(array_upper(a, 1), 0), coalesce(array_upper(b, 1), 0))) i)
  end
$$;

-- Same job as core.stat_num(jsonb, text) once the column is an array. Needs the group because slot order is per group.
create or replace function core.stat_num(grp text, stats int4[], k text) returns numeric
language sql stable parallel safe as $$
  select case when s.scale = 1 then packed.n::numeric else packed.n::numeric / s.scale end
  from core.stat_slot s
  cross join lateral (select stats[s.ord] as n) packed
  where s.stat_group = grp and s.key = k and packed.n is not null
$$;

grant select on core.stat_slot to anon, authenticated;
grant execute on function core.stat_scaled(int, int), core.stats_json(text, int4[]), core.stats_pack(text, jsonb),
  core.stats_merge(int4[], int4[]), core.stat_num(text, int4[], text) to anon, authenticated;
