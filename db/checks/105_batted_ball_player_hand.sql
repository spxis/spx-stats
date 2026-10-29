-- what: a player-season whose two sides in core.batted_ball_player_hand do not add up to the same balls as core.batted_ball_player (db/build/237 against 202), or a side with no ball
-- baseline: 0
select coalesce(h.person_id, p.person_id) || ' ' || coalesce(h.year, 0) || ' ' || coalesce(h.role, p.role) || ': by side ' || coalesce(h.n, 0) || ' of ' || coalesce(p.n, 0) as problem
from (select person_id, season_id, role, max(year) as year, sum(n) as n from core.batted_ball_player_hand group by 1, 2, 3) h
full join core.batted_ball_player p using (person_id, season_id, role)
where h.n is distinct from p.n
union all
select h.person_id || ' ' || h.year || ' ' || h.role || ' ' || h.bat_hand || ': no ball'
from core.batted_ball_player_hand h
where h.n < 1
