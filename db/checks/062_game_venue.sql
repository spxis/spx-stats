-- what: games held at a venue that had not opened, or had closed, more than 30 days before/after the game (venue per api.game_venue: core.game_venue, else the home club's period; only where the venue's opened_on or closed_on is known), and home-venue periods that run outside the days their venue stood
-- baseline: 0
-- A row is one league and venue (games) or one franchise and venue (periods). Fix the venue's dates in db/seed/venue_dates.csv when Wikidata dates are wrong, or the park/stadium/alias mapping in db/seed/retrosheet_park.csv and venue_alias.csv, or the seed period in db/seed/home_venue.csv.
select 'game' as what, s.league_code as league, v.source_key as venue, count(*) as games, min(g.game_date) as first, max(g.game_date) as last
from core.game g
join core.season s on s.season_id = g.season_id
left join core.game_venue gv on gv.game_id = g.game_id
left join core.team_season ts on ts.team_season_id = g.home_team_season_id
left join core.franchise_home_venue h on h.franchise_id = ts.franchise_id and h.valid_during @> g.game_date and gv.game_id is null
join core.venue v on v.venue_id = case when gv.game_id is not null then gv.venue_id else h.venue_id end
where s.league_code in ('nhl', 'nba', 'mlb', 'na', 'aa', 'ua', 'pl', 'fl', 'nfl', 'cfl')
  and ((v.opened_on is not null and g.game_date < v.opened_on - 30) or (v.closed_on is not null and g.game_date > v.closed_on + 30))
group by 1, 2, 3
union all
select 'period', (select min(fl.league_code) from core.franchise_league fl where fl.franchise_id = h.franchise_id), v.source_key, count(*), lower(h.valid_during), upper(h.valid_during)
from core.franchise_home_venue h
join core.venue v on v.venue_id = h.venue_id
where h.basis in ('brand', 'wikidata')
  and ((v.opened_on is not null and lower(h.valid_during) < v.opened_on - 30
        and not exists (select 1 from core.franchise_home_venue p where p.franchise_id = h.franchise_id and upper(p.valid_during) = lower(h.valid_during)))   -- a handover from another venue on that day is the offseason, not an anachronism
    or (v.closed_on is not null and upper(h.valid_during) > v.closed_on + 31
        and not exists (select 1 from core.franchise_home_venue n where n.franchise_id = h.franchise_id and lower(n.valid_during) = upper(h.valid_during))))
group by 1, 2, 3, 5, 6
