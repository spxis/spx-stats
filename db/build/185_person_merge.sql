-- One record per person: merge the records that are the same human, and keep a redirect from each old id to the kept one.
-- Several sources each made their own core.person (Wikidata 177, the NHL API 180, Lahman 181, staff 184), so "Alexander Ovechkin" (Wikidata)
-- and "Alex Ovechkin" (NHL API) were listed twice. Run after 184 and before 186; rerunnable (a second run finds nothing to merge).
--
-- Two records are the same person only when ALL of these hold:
--  * the names fit: same family name (accents and punctuation ignored), a first name that is the same, a longer form of the other
--    (Alex, Alexander) or a known short form (Bob, Robert), no different middle initials, and the same Jr/Sr/II suffix unless the
--    birth dates are the same;
--  * nothing contradicts: no two different birth dates, no different shooting or batting hand, no two different ids from the SAME
--    source (two Lahman ids are two people, whatever their names), and a league in common;
--  * and there is evidence beyond the name, one of
--      - the same birth date;
--      - a club and season in common (a roster entry or statistics for the same team season);
--      - a Wikidata hockey player and an NHL API player with the very same name once accents are ignored, each the only one of its
--        source with that name (the rule 180 uses, with accents folded).
-- A record in more than one such pair is left alone. Pairs that fit the names and contradict nothing but have no evidence are NOT
-- merged: they are logged in meta.data_issue ('possible-duplicate:...') for a person to decide.
--
-- Which record is kept: an SPX record where one exists, else the Wikidata record (the build keeps rewriting those from Wikidata), else
-- the one with more data. The kept record fills its empty fields from the other. Everything that pointed at the old record is moved:
-- statistics, rosters, awards, career entries, external ids, captain and coach links. Each merge is logged in meta.data_issue
-- ('merge:...') and the old id goes to core.person_redirect (migration 061).
begin;

-- 1. Candidates --------------------------------------------------------------------------------------------------------------
create temp table nick (a text, b text) on commit drop;
insert into nick values
 ('mike','michael'),('bob','robert'),('bobby','robert'),('rob','robert'),('robbie','robert'),('bill','william'),('billy','william'),('will','william'),
 ('willie','william'),('jim','james'),('jimmy','james'),('jamie','james'),('tom','thomas'),('tommy','thomas'),('joe','joseph'),('joey','joseph'),
 ('dave','david'),('dan','daniel'),('danny','daniel'),('chris','christopher'),('tony','anthony'),('steve','steven'),('steve','stephen'),
 ('matt','matthew'),('nick','nicholas'),('nicky','nicholas'),('jon','jonathan'),('jonny','jonathan'),('ben','benjamin'),('andy','andrew'),
 ('drew','andrew'),('ed','edward'),('eddie','edward'),('ted','edward'),('ted','theodore'),('rich','richard'),('rick','richard'),('ricky','richard'),
 ('dick','richard'),('pete','peter'),('ken','kenneth'),('kenny','kenneth'),('fred','frederick'),('freddie','frederick'),('greg','gregory'),
 ('jeff','jeffrey'),('geoff','geoffrey'),('jerry','gerald'),('jerry','jerome'),('larry','lawrence'),('len','leonard'),('lenny','leonard'),
 ('phil','philip'),('phil','phillip'),('ron','ronald'),('ronnie','ronald'),('sam','samuel'),('sandy','alexander'),('al','albert'),('al','alan'),
 ('alex','alexander'),('alec','alexander'),('tim','timothy'),('walt','walter'),('wally','walter'),('zach','zachary'),('zack','zachary'),
 ('josh','joshua'),('jake','jacob'),('jack','john'),('johnny','john'),('hank','henry'),('harry','henry'),('charlie','charles'),('chuck','charles'),
 ('don','donald'),('donnie','donald'),('doug','douglas'),('gene','eugene'),('gord','gordon'),('gordie','gordon'),('herb','herbert'),
 ('lou','louis'),('louie','louis'),('mitch','mitchell'),('nate','nathan'),('nate','nathaniel'),('pat','patrick'),('ray','raymond'),
 ('reg','reginald'),('rod','roderick'),('russ','russell'),('stan','stanley'),('vic','victor'),('vince','vincent'),('vinny','vincent'),
 ('wes','wesley'),('cam','cameron'),('curt','curtis'),('dom','dominic'),('fran','francis'),('frank','francis'),('frankie','francis'),
 ('ty','tyler'),('mikael','michael'),('aleksander','alexander'),('aleksandr','alexander'),('alexandre','alexander'),('alexandr','alexander'),
 ('sasha','alexander'),('sergei','sergey'),('evgeni','evgeny'),('evgeni','yevgeni'),('yevgeny','evgeny'),('yevgeni','evgeny'),
 ('nikolai','nikolay'),('dmitri','dmitry'),('steven','stephen'),('geoff','jeff'),('anthony','antony'),('theo','theoren'),('syl','sylvanus'),
 ('bud','buddy');
insert into nick select b, a from nick;
create index on nick (a, b);

create temp table np on commit drop as
select p.person_id, p.full_name, p.kind, p.birth_date, p.throws_or_shoots as tos, p.bats, core.fold_text(p.full_name) as fn,
       (regexp_match(core.fold_text(p.full_name), ' (jr|sr|ii|iii|iv)$'))[1] as suffix,
       string_to_array(regexp_replace(core.fold_text(p.full_name), ' (jr|sr|ii|iii|iv)$', ''), ' ') as toks
from core.person p;
alter table np add column g text, add column f text, add column mid text;
update np set g = toks[1], f = toks[cardinality(toks)], mid = case when cardinality(toks) > 2 then toks[2] end;
create index on np (f);
create index on np (person_id);

-- the leagues a person appears in, and the team seasons
create temp table lg on commit drop as
select person_id, array_agg(distinct l) as lg from (
  select rs.person_id, s.league_code as l from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
  union select x.person_id, s.league_code from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
  union select w.person_id, s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id is not null) z
group by 1;
create index on lg (person_id);

create temp table pts on commit drop as
select distinct person_id, team_season_id from (
  select person_id, team_season_id from core.roster_stint union all select person_id, team_season_id from core.player_season_stat) z;
create index on pts (team_season_id);
create index on pts (person_id);

create temp table keys on commit drop as
select x.entity_id as person_id, x.source_id, s.code as source, x.external_key
from core.external_id x join meta.source s using (source_id) where x.entity_kind = 'person';
create index on keys (person_id);
analyze lg; analyze pts; analyze keys; analyze np;

create temp table cand0 on commit drop as
select a.person_id as a, b.person_id as b, coalesce(a.birth_date = b.birth_date, false) as birth_eq,
       coalesce(a.birth_date <> b.birth_date, false) as birth_conf,
       ((a.tos is not null and b.tos is not null and a.tos <> b.tos) or (a.bats is not null and b.bats is not null and a.bats <> b.bats)) as hand_conf,
       (a.suffix is distinct from b.suffix) as suffix_diff, (a.fn = b.fn) as fn_eq
from np a join np b on a.f = b.f and a.person_id < b.person_id
where (a.g = b.g
       or (least(length(a.g), length(b.g)) >= 3 and greatest(length(a.g), length(b.g)) - least(length(a.g), length(b.g)) >= 2
           and (a.g like b.g || '%' or b.g like a.g || '%'))
       or exists (select 1 from nick n where n.a = a.g and n.b = b.g))
  and (a.mid is null or b.mid is null or left(a.mid, 1) = left(b.mid, 1));

create temp table cand on commit drop as
select c.*,
       exists (select 1 from keys ka join keys kb on kb.source_id = ka.source_id and kb.external_key <> ka.external_key
                where ka.person_id = c.a and kb.person_id = c.b) as same_src_key,
       exists (select 1 from pts x join pts y using (team_season_id) where x.person_id = c.a and y.person_id = c.b) as overlap,
       coalesce((select la.lg && lb.lg from lg la, lg lb where la.person_id = c.a and lb.person_id = c.b), false) as lg_ok
from cand0 c;

-- Names fit and nothing contradicts: the pairs a person can look at.
create temp table fit on commit drop as
select * from cand
where not birth_conf and not hand_conf and not same_src_key and lg_ok and (birth_eq or not suffix_diff);

-- A Wikidata hockey player and an NHL API player with the same name (accents ignored), each alone in its source with that name.
create temp table wd_hockey on commit drop as
select np.person_id, np.fn from np
join keys k on k.person_id = np.person_id and k.source = 'wikidata'
join legacy_people.claim c on c.qid = k.external_key and c.prop = 'P641' and c.value_qid = 'Q41466';
create temp table nhl_p on commit drop as
select np.person_id, np.fn from np join keys k on k.person_id = np.person_id and k.source = 'nhl_api';
create temp table name_pair on commit drop as
select w.person_id as a, n.person_id as b
from wd_hockey w join nhl_p n on n.fn = w.fn and n.person_id <> w.person_id
where (select count(*) from wd_hockey x where x.fn = w.fn) = 1 and (select count(*) from nhl_p x where x.fn = n.fn) = 1
  and not exists (select 1 from keys ka join keys kb on kb.source_id = ka.source_id and kb.external_key <> ka.external_key
                   where ka.person_id = w.person_id and kb.person_id = n.person_id)
  and not exists (select 1 from np a, np b where a.person_id = w.person_id and b.person_id = n.person_id
                   and (coalesce(a.birth_date <> b.birth_date, false) or (a.tos is not null and b.tos is not null and a.tos <> b.tos)));

create temp table pair0 on commit drop as
select least(a, b) as a, greatest(a, b) as b, case when birth_eq then 'the same birth date' else 'the same team in the same season' end as why,
       case when birth_eq then 1 else 2 end as rank
from fit where birth_eq or overlap
union all
select least(a, b), greatest(a, b), 'the same name and sport, the only one of each source', 3 from name_pair;
-- the same two records found by more than one rule are one pair; the strongest evidence is the one named
create temp table pair on commit drop as
select distinct on (a, b) a, b, why from pair0 order by a, b, rank;
-- a record in two pairs is ambiguous: left alone
create temp table once on commit drop as
select p from (select a as p from pair union all select b from pair) z group by p having count(*) = 1;
create temp table ok_pair on commit drop as
select a, b, why from pair where a in (select p from once) and b in (select p from once);

-- 2. Which record stays --------------------------------------------------------------------------------------------------------
create temp table score on commit drop as
select p.person_id,
       (case when p.source_id = (select source_id from meta.source where code = 'spx_database') then 1000000 else 0 end)
       + (exists (select 1 from keys k where k.person_id = p.person_id and k.source = 'wikidata'))::int * 100000
       + (select count(*) from jsonb_each(to_jsonb(p)) e where e.value <> 'null'::jsonb) * 100
       + least((select count(*) from pts t where t.person_id = p.person_id), 99) as sc
from core.person p where p.person_id in (select a from ok_pair union select b from ok_pair);

create temp table m on commit drop as
select case when sa.sc > sb.sc or (sa.sc = sb.sc and o.a < o.b) then o.a else o.b end as kept,
       case when sa.sc > sb.sc or (sa.sc = sb.sc and o.a < o.b) then o.b else o.a end as loser, o.why
from ok_pair o join score sa on sa.person_id = o.a join score sb on sb.person_id = o.b;

create temp table people_before on commit drop as select count(*) as n from core.person;

-- 3. Log: the merge, and the pairs left for a person to decide -----------------------------------------------------------------
create function pg_temp.pkey(p bigint) returns text language sql stable as $$
  select coalesce((select source || ':' || external_key from keys where person_id = p order by (source = 'wikidata') desc, source, external_key limit 1), 'person:' || p) $$;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_stats_derived'), 'person',
       'merge:' || pg_temp.pkey(m.loser) || '+' || pg_temp.pkey(m.kept),
       format('%s (person %s, %s) and %s (person %s, %s) are one person: %s',
              l.full_name, m.loser, pg_temp.pkey(m.loser), k.full_name, m.kept, pg_temp.pkey(m.kept), m.why),
       format('Merged into person %s; the old id %s redirects to it', m.kept, m.loser)
from m join core.person l on l.person_id = m.loser join core.person k on k.person_id = m.kept
where not exists (select 1 from meta.data_issue d where d.entity_kind = 'person'
                   and d.entity_key = 'merge:' || pg_temp.pkey(m.loser) || '+' || pg_temp.pkey(m.kept));

delete from meta.data_issue where entity_kind = 'person' and entity_key like 'possible-duplicate:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_stats_derived'), 'person',
       'possible-duplicate:' || pg_temp.pkey(f.a) || '+' || pg_temp.pkey(f.b),
       format('%s (person %s, %s) and %s (person %s, %s) may be one person: the names fit and nothing contradicts, but there is no shared birth date or team season to confirm it',
              na.full_name, f.a, pg_temp.pkey(f.a), nb.full_name, f.b, pg_temp.pkey(f.b)),
       'Not merged; a person decides'
from fit f join core.person na on na.person_id = f.a join core.person nb on nb.person_id = f.b
where not f.birth_eq and not f.overlap
  and not exists (select 1 from ok_pair o where (o.a, o.b) = (f.a, f.b))
  and not exists (select 1 from name_pair n where (least(n.a, n.b), greatest(n.a, n.b)) = (f.a, f.b));
-- pairs with evidence that were left alone because a record sits in two of them
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'spx_stats_derived'), 'person',
       'possible-duplicate:' || pg_temp.pkey(p.a) || '+' || pg_temp.pkey(p.b),
       format('%s (person %s, %s) and %s (person %s, %s) may be one person (%s), but one of them is also paired with another record',
              na.full_name, p.a, pg_temp.pkey(p.a), nb.full_name, p.b, pg_temp.pkey(p.b), p.why),
       'Not merged; a person decides'
from pair p join core.person na on na.person_id = p.a join core.person nb on nb.person_id = p.b
where not exists (select 1 from ok_pair o where (o.a, o.b) = (p.a, p.b));

-- 4. Move everything from the old record to the kept one -----------------------------------------------------------------------
insert into core.person_redirect (old_person_id, person_id, old_name, reason)
select m.loser, m.kept, l.full_name, m.why from m join core.person l on l.person_id = m.loser
on conflict (old_person_id) do update set person_id = excluded.person_id, reason = excluded.reason;
update core.person_redirect r set person_id = m.kept from m where r.person_id = m.loser;

delete from core.player_season_stat l using m
 where l.person_id = m.loser and exists (select 1 from core.player_season_stat k
        where k.person_id = m.kept and k.team_season_id = l.team_season_id and k.phase = l.phase and k.stat_group = l.stat_group and k.source_id = l.source_id);
update core.player_season_stat s set person_id = m.kept from m where s.person_id = m.loser;

delete from core.roster_stint l using m
 where l.person_id = m.loser and exists (select 1 from core.roster_stint k where k.person_id = m.kept and k.team_season_id = l.team_season_id and k.role = l.role);
update core.roster_stint s set person_id = m.kept from m where s.person_id = m.loser;

update core.award_winner s set person_id = m.kept from m where s.person_id = m.loser;
update core.person_career s set person_id = m.kept from m where s.person_id = m.loser;
update core.team_season s set captain_person_id = m.kept from m where s.captain_person_id = m.loser;
update core.team_season s set head_coach_person_id = m.kept from m where s.head_coach_person_id = m.loser;
update core.draft_pick s set person_id = m.kept from m where s.person_id = m.loser;
update core.game_lineup s set person_id = m.kept from m where s.person_id = m.loser;
update core.game_official s set person_id = m.kept from m where s.person_id = m.loser;
update core.injury_report s set person_id = m.kept from m where s.person_id = m.loser;
update core.player_game_stat s set person_id = m.kept from m where s.person_id = m.loser;
update core.transaction s set person_id = m.kept from m where s.person_id = m.loser;
update core.person_name s set person_id = m.kept from m
 where s.person_id = m.loser and not exists (select 1 from core.person_name k where k.person_id = m.kept and k.valid_during && s.valid_during);
do $$
declare r record;
begin
  for r in select loser, kept from m loop
    update core.game_event set person_ids = array_replace(person_ids, r.loser, r.kept) where person_ids @> array[r.loser];
  end loop;
end $$;
update core.external_id s set entity_id = m.kept from m where s.entity_kind = 'person' and s.entity_id = m.loser;

-- the kept record fills what it lacks from the old one
update core.person k set
  given_name = coalesce(k.given_name, l.given_name), family_name = coalesce(k.family_name, l.family_name),
  birth_date = coalesce(k.birth_date, l.birth_date), birth_place = coalesce(k.birth_place, l.birth_place),
  birth_country_code = coalesce(k.birth_country_code, l.birth_country_code), death_date = coalesce(k.death_date, l.death_date),
  height_cm = coalesce(k.height_cm, l.height_cm), handedness = coalesce(k.handedness, l.handedness), nickname = coalesce(k.nickname, l.nickname),
  nationality_code = coalesce(k.nationality_code, l.nationality_code), bats = coalesce(k.bats, l.bats),
  throws_or_shoots = coalesce(k.throws_or_shoots, l.throws_or_shoots), debut_on = coalesce(k.debut_on, l.debut_on),
  final_game_on = coalesce(k.final_game_on, l.final_game_on), hall_of_fame_year = coalesce(k.hall_of_fame_year, l.hall_of_fame_year),
  birth_name = coalesce(k.birth_name, l.birth_name), known_as = coalesce(k.known_as, l.known_as), name_suffix = coalesce(k.name_suffix, l.name_suffix),
  birth_region = coalesce(k.birth_region, l.birth_region), death_place = coalesce(k.death_place, l.death_place),
  death_country_code = coalesce(k.death_country_code, l.death_country_code), weight_kg = coalesce(k.weight_kg, l.weight_kg),
  college = coalesce(k.college, l.college), high_school = coalesce(k.high_school, l.high_school), is_active = coalesce(k.is_active, l.is_active),
  birth_lat = coalesce(k.birth_lat, l.birth_lat), birth_lon = coalesce(k.birth_lon, l.birth_lon),
  kind = case when k.kind <> 'player' and l.kind = 'player' then 'player' else k.kind end,
  updated_at = now()
from m join core.person l on l.person_id = m.loser
where k.person_id = m.kept;

delete from core.person where person_id in (select loser from m);

select (select count(*) from m) as merged, (select n from people_before) as people_before, (select count(*) from core.person) as people_after,
       (select count(*) from core.person_redirect) as redirects,
       (select count(*) from meta.data_issue where entity_kind = 'person' and entity_key like 'merge:%') as merges_logged,
       (select count(*) from meta.data_issue where entity_kind = 'person' and entity_key like 'possible-duplicate:%') as possible_duplicates;
select why, count(*) as n from m group by why order by n desc;

commit;
