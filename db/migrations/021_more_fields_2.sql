-- More optional fields to fill over time (see 020). All nullable; nothing existing changes.

alter table core.game
  add column if not exists regulation_periods smallint check (regulation_periods > 0),
  add column if not exists end_period smallint check (end_period > 0),
  add column if not exists is_makeup boolean,
  add column if not exists reschedule_reason text,
  add column if not exists day_night text check (day_night in ('day','night','twilight')),
  add column if not exists home_series_wins smallint,
  add column if not exists away_series_wins smallint,
  add column if not exists neutral_site_reason text;

alter table core.standing
  add column if not exists regulation_ot_wins smallint,
  add column if not exists interleague_record text,
  add column if not exists vs_over_500_record text,
  add column if not exists close_game_record text,
  add column if not exists points_per_game numeric(5,3),
  add column if not exists magic_number smallint,
  add column if not exists qualified_for_playoffs boolean,
  add column if not exists tiebreak_note text,
  add column if not exists wildcard_games_behind numeric(4,1);

alter table core.team_season
  add column if not exists head_coach_person_id bigint references core.person,
  add column if not exists captain_person_id bigint references core.person,
  add column if not exists final_rank smallint,
  add column if not exists playoff_seed smallint,
  add column if not exists playoff_result text;   -- missed, lost_round_1 ... won_title

alter table core.person
  add column if not exists birth_name text,
  add column if not exists known_as text,
  add column if not exists name_suffix text,
  add column if not exists birth_region text,
  add column if not exists death_place text,
  add column if not exists death_country_code text references ref.country,
  add column if not exists weight_kg numeric(5,1),
  add column if not exists college text,
  add column if not exists high_school text,
  add column if not exists is_active boolean;

alter table core.roster_stint
  add column if not exists status text,           -- active, injured_reserve, suspended, minors, practice_squad, scratched
  add column if not exists roster_type text,      -- e.g. 40-man, 26-man, practice squad
  add column if not exists captaincy text check (captaincy in ('C','A')),
  add column if not exists acquired_how text,     -- draft, trade, signing, waiver
  add column if not exists released_how text,
  add column if not exists salary_amount numeric(14,2),
  add column if not exists salary_currency char(3),
  add column if not exists positions text[];

alter table core.venue
  add column if not exists surface text,
  add column if not exists roof text check (roof in ('open','dome','retractable')),
  add column if not exists is_indoor boolean,
  add column if not exists orientation_degrees smallint,
  add column if not exists field_dimensions jsonb,
  add column if not exists capacity_by_sport jsonb,
  add column if not exists cost_usd numeric(14,0),
  add column if not exists architect text;
alter table core.venue_feature add column if not exists sport_code text references ref.sport;

alter table core.season
  add column if not exists all_star_on date,
  add column if not exists trade_deadline_on date,
  add column if not exists work_stoppage text;    -- lockout or strike, if any

alter table core.player_season_stat
  add column if not exists is_total boolean;      -- the combined line of a player traded mid-season
alter table core.player_game_stat
  add column if not exists jersey_number smallint;

alter table core.betting_line
  add column if not exists line_moment text check (line_moment in ('open','close','other'));
