-- what: basketball and football statistic lines that cannot be true: games out of range, a count above what anyone has done, a percentage above 1, completions above attempts, a line with no stat_basis
-- baseline: 2 (two articles whose published total and average points disagree)
select 'basketball games' as what, x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group = 'basketball' and (x.games_played > 120 or x.games_played < 0)
union all
select 'basketball value', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group = 'basketball'
  and (core.stat_num(x.stat_group, x.stats, 'a_pts') > 60 or core.stat_num(x.stat_group, x.stats, 'a_reb') > 30 or core.stat_num(x.stat_group, x.stats, 'a_ast') > 20 or core.stat_num(x.stat_group, x.stats, 'a_stl') > 8
       or core.stat_num(x.stat_group, x.stats, 'a_blk') > 10 or core.stat_num(x.stat_group, x.stats, 'a_min') > 60 or core.stat_num(x.stat_group, x.stats, 'pts') > 4500 or core.stat_num(x.stat_group, x.stats, 'reb') > 2500
       or core.stat_num(x.stat_group, x.stats, 'ast') > 1200 or core.stat_num(x.stat_group, x.stats, 'p_fg') > 1 or core.stat_num(x.stat_group, x.stats, 'p_3p') > 1 or core.stat_num(x.stat_group, x.stats, 'p_ft') > 1)
union all
select 'basketball total against average', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group = 'basketball' and x.stat_basis = 'both' and x.games_played > 0
  and abs(core.stat_num(x.stat_group, x.stats, 'pts') - core.stat_num(x.stat_group, x.stats, 'a_pts') * x.games_played) > 2 * x.games_played
union all
select 'no stat_basis', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group in ('basketball', 'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting') and x.stat_basis is null
union all
select 'football games', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group in ('passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting')
  and (x.games_played > case x.phase when 'playoffs' then 5 else 18 end or x.games_played < 1)
union all
select 'completions above attempts', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group = 'passing' and core.stat_num(x.stat_group, x.stats, 'cmp') > core.stat_num(x.stat_group, x.stats, 'att')
union all
select 'field goals above attempts', x.person_id, x.team_season_id, x.phase::text from core.player_season_stat x
where x.stat_group = 'kicking' and core.stat_num(x.stat_group, x.stats, 'fgm') > core.stat_num(x.stat_group, x.stats, 'fga')
