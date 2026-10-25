-- what: a season whose best-ranked championship rows are more than one (a tied series, MLB 1885 and 1890) but whose api.season_summary row names a champion: the view must give no champion there, or each refresh can pick another club (migrations 151, 152)
-- baseline: 0
select s.season_id, s.league_code, s.start_year, m.champion
from core.season s
join api.season_summary m on m.league = s.league_code and m.year = s.start_year
where m.champion is not null
  and (select count(*) from core.award_winner w join core.award a using (award_id) join meta.source src on src.source_id = w.source_id
       where w.season_id = s.season_id and a.kind = 'championship'
       group by (src.code = 'spx_stats_derived') order by (src.code = 'spx_stats_derived') desc limit 1) > 1
