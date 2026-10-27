-- what: the baseball family is split right. A Retrosheet game outside the season of its own league (na, aa, ua, pl, fl or mlb); a team season that has games in two leagues; a team season whose club has no membership of that season's league; a club in two baseball leagues in one year; one club held as two franchises (two franchises of the same name in different leagues, one's first name starting the day the other's ends, both before 1900: db/seed/baseball_club.csv folds the later Retrosheet team id into the first)
-- baseline: 0
-- needs db/build/139, 140 and the repair db/build/pending/baseball_family_repair.sql on DS1 (it reads legacy_retrosheet).
select 'game outside its league season' as what, g.game_id::text as ref, s.league_code || ' ' || s.start_year as found,
       case when l.home_league in ('NA', 'AA', 'UA', 'PL', 'FL') then lower(l.home_league) else 'mlb' end as expected
from core.game g
join core.season s on s.season_id = g.season_id
join core.external_id e on e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select source_id from meta.source where code = 'retrosheet')
join legacy_retrosheet.game_log l
  on to_char(l.game_date, 'YYYYMMDD') || ':' || l.home || ':' || l.visitor || ':' || l.game_number || ':' || l.game_type = e.external_key
where g.source_id = (select source_id from meta.source where code = 'retrosheet') and l.game_type <> 'allstar'
  and s.league_code <> case when l.home_league in ('NA', 'AA', 'UA', 'PL', 'FL') then lower(l.home_league) else 'mlb' end
  and s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl')
union all
select 'team season has games in two leagues', t.team_season_id::text, string_agg(distinct s.league_code, ','), null
from core.team_season t
join core.game g on g.home_team_season_id = t.team_season_id or g.away_team_season_id = t.team_season_id
join core.season gs on gs.season_id = g.season_id
join core.season s on s.season_id = t.season_id
where s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl') and s.start_year < 1916
group by t.team_season_id having count(distinct gs.league_code) > 1
union all
select 'team season outside its club''s league membership', t.team_season_id::text, s.league_code || ' ' || s.start_year, null
from core.team_season t join core.season s using (season_id)
where s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl')
  and not exists (select 1 from core.franchise_league l
                  where l.franchise_id = t.franchise_id and l.league_code = s.league_code
                    and l.valid_during && daterange(make_date(s.start_year, 1, 1), make_date(s.start_year + 1, 1, 1)))
union all
select 'club in two baseball leagues in one year', t.franchise_id::text, s.start_year::text, string_agg(distinct s.league_code, ',')
from core.team_season t join core.season s using (season_id)
where s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl')
group by t.franchise_id, s.start_year having count(distinct s.league_code) > 1
union all
select 'one club held as two franchises', a.franchise_id::text, b.franchise_id::text, a.full_name
from core.franchise_identity a
join core.franchise fa on fa.franchise_id = a.franchise_id and fa.source_id = (select source_id from meta.source where code = 'retrosheet')
join core.franchise_identity b on b.franchise_id <> a.franchise_id and b.full_name = a.full_name and lower(b.valid_during) = upper(a.valid_during)
join core.franchise fb on fb.franchise_id = b.franchise_id and fb.source_id = (select source_id from meta.source where code = 'retrosheet')
where lower(a.valid_during) < date '1900-01-01' and lower(b.valid_during) < date '1900-01-01'
  and not exists (select 1 from core.franchise_league la join core.franchise_league lb on lb.league_code = la.league_code and lb.franchise_id = b.franchise_id where la.franchise_id = a.franchise_id)   -- (two clubs of one league that share a name in successive years are two clubs)
order by 1, 2
