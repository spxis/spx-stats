-- what: pairs of core.person with the same name (accents, punctuation and spaced initials ignored: "L. C." and "L.C.") whose birth dates are one digit apart,
--       that share a league and whose careers touch (each starts within a season of the other's end), and the reason db/build/185_person_merge.sql did not merge
--       them (the careers are the ones 185 counts: roster, statistics, head coach, captain, award; the lists of 2026-11-03 add the 2 pairs of coaches Banister and Zimmer). Read-only: run with  bash scripts/mac/ds1-apply.sh db/review/person_pair_typo.sql --dry-run  (select only; nothing is written). Not a db/checks file.
-- why: 185 treats two different birth dates as a contradiction, so one wrong digit in a source keeps one human in two records (SPX-866: Carl Eller 1942-01-25 and
--       1942-02-25, Bill Bradley, Forrest Blue, Tommy Casanova ...). Replayed on api.people on 2026-11-02 this found 29 pairs (27 NFL, 2 MLB: Minnie Minoso, Jim Spencer); with head coach, captain and award careers counted it is 31 (the coaches Banister and Zimmer),
--       the pairs 185 now merges. After that merge list 1 holds only the pairs still apart.
-- Columns: a, b, name_a, name_b, born_a, born_b, leagues, seasons_a, seasons_b, same_source_key (185's veto: two different ids of one source), shared_team_season.
-- Built in materialized steps (SPX-866: the single-query form ran over 16 minutes on DS1 and was cancelled; its planner joined the careers of everyone to every name pair):
-- first the name pairs, then only the people in them, then the careers of those people alone.
with p as materialized (
  select person_id, full_name, birth_date, to_char(birth_date, 'YYYYMMDD') as b8,
         regexp_replace(core.fold_text(full_name), '\m([a-z]) (?=[a-z]\M)', '\1', 'g') as jn
  from core.person where birth_date is not null),
cand as materialized (
  select a.person_id as a, b.person_id as b, a.full_name as name_a, b.full_name as name_b, a.birth_date as born_a, b.birth_date as born_b
  from p a join p b on b.jn = a.jn and b.person_id > a.person_id
  where a.b8 <> b.b8 and (select count(*) from generate_series(1, 8) i where substr(a.b8, i, 1) <> substr(b.b8, i, 1)) = 1),
who as materialized (select a as person_id from cand union select b from cand),
career as materialized (
  -- the leagues count from roster, statistics and awards; the years from those and from head coach and captain seasons (as 185 counts them)
  select person_id, array_agg(distinct league) filter (where in_league) as leagues, min(yr) as y0, max(yr) as y1 from (
    select rs.person_id, s.league_code as league, s.start_year as yr, true as in_league from who w join core.roster_stint rs using (person_id) join core.team_season ts using (team_season_id) join core.season s using (season_id)
    union all select x.person_id, s.league_code, s.start_year, true from who w join core.player_season_stat x using (person_id) join core.team_season ts using (team_season_id) join core.season s using (season_id)
    union all select aw.person_id, s.league_code, null::int, true from who w join core.award_winner aw on aw.person_id = w.person_id join core.season s on s.season_id = aw.season_id
    union all select aw.person_id, s.league_code, s.start_year, false from who w join core.award_winner aw on aw.person_id = w.person_id join core.team_season ts on ts.team_season_id = aw.team_season_id join core.season s on s.season_id = ts.season_id
    union all select w.person_id, s.league_code, s.start_year, false from who w join core.team_season ts on w.person_id in (ts.head_coach_person_id, ts.captain_person_id) join core.season s using (season_id)) z
  group by person_id),
pairs as materialized (
  select c.a, c.b, c.name_a, c.name_b, c.born_a, c.born_b,
         ca.leagues && cb.leagues as league_ok, ca.leagues, ca.y0 as a0, ca.y1 as a1, cb.y0 as b0, cb.y1 as b1
  from cand c join career ca on ca.person_id = c.a join career cb on cb.person_id = c.b)
select a, b, name_a, name_b, born_a, born_b, leagues, a0 || '-' || a1 as seasons_a, b0 || '-' || b1 as seasons_b,
       exists (select 1 from core.external_id ka join core.external_id kb on kb.source_id = ka.source_id and kb.entity_kind = 'person' and kb.external_key <> ka.external_key
                where ka.entity_kind = 'person' and ka.entity_id = a and kb.entity_id = b) as same_source_key,
       exists (select 1 from core.roster_stint x join core.roster_stint y using (team_season_id) where x.person_id = a and y.person_id = b) as shared_team_season
from pairs
where league_ok and a0 <= b1 + 1 and b0 <= a1 + 1
order by 1, 2;

-- Second list: the SAME birth date and the same name (spaced initials ignored) that are still two records, with 185's possible reasons beside them
-- (L. C. Greenwood, O. J. Simpson of SPX-866 are such pairs: names and birth date agree, so something else vetoed the merge).
-- same_source_key: two different ids of one source (185 treats that as two people); no_common_league: the records share no league; in_several_pairs: a record is in more than one pair.
with p as materialized (
  select person_id, full_name, birth_date,
         regexp_replace(core.fold_text(full_name), '\m([a-z]) (?=[a-z]\M)', '\1', 'g') as jn
  from core.person where birth_date is not null),
pr as materialized (
  select a.person_id as a, b.person_id as b, a.full_name as name_a, b.full_name as name_b, a.birth_date as born
  from p a join p b on b.jn = a.jn and b.person_id > a.person_id and b.birth_date = a.birth_date),
who as materialized (select a as person_id from pr union select b from pr),
leagues as materialized (
  select person_id, array_agg(distinct league) as leagues from (
    select rs.person_id, s.league_code as league from who w join core.roster_stint rs using (person_id) join core.team_season ts using (team_season_id) join core.season s using (season_id)
    union all select x.person_id, s.league_code from who w join core.player_season_stat x using (person_id) join core.team_season ts using (team_season_id) join core.season s using (season_id)) z
  group by person_id)
select a, b, name_a, name_b, born,
       exists (select 1 from core.external_id ka join core.external_id kb on kb.source_id = ka.source_id and kb.entity_kind = 'person' and kb.external_key <> ka.external_key
                where ka.entity_kind = 'person' and ka.entity_id = a and kb.entity_id = b) as same_source_key,
       not coalesce((select la.leagues && lb.leagues from leagues la, leagues lb where la.person_id = a and lb.person_id = b), false) as no_common_league,
       (select count(*) from pr x where a in (x.a, x.b) or b in (x.a, x.b)) > 1 as in_several_pairs
from pr
order by 1, 2;
