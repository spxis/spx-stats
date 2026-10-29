-- Scratch copy for scripts/daily/test/retire-test.sh. Generated from DS1's catalogs (columns, defaults, keys, checks and indexes of the tables the daily load touches). Foreign keys to tables outside this set are left out.
create schema if not exists ref; create schema if not exists meta; create schema if not exists core;
create type core.game_status as enum ('scheduled','in_progress','final','postponed','suspended','cancelled','forfeit');
create type core.season_phase as enum ('preseason','regular','playoffs','all_star','exhibition','tournament');
create type meta.verification_status as enum ('confirmed','disputed','not_found');
create table ref.sport (
  "sport_code" text not null,
  "name" text not null
);
create table ref.country (
  "country_code" text not null,
  "name" text not null
);
create table ref.league (
  "league_code" text not null,
  "sport_code" text not null,
  "country_code" text,
  "founded_on" date,
  "dissolved_on" date,
  "notes" text
);
create table meta.source (
  "source_id" smallint generated always as identity not null,
  "code" text not null,
  "name" text not null,
  "kind" text not null,
  "licence" text,
  "attribution" text,
  "url" text,
  "covers_from" date,
  "covers_to" date,
  "retrieved_on" date,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "tier" text,
  "terms_note" text,
  "evidence_url" text
);
create table meta.verification (
  "verification_id" bigint generated always as identity not null,
  "entity_kind" text not null,
  "entity_id" bigint not null,
  "field" text default '*'::text not null,
  "status" meta.verification_status not null,
  "source_id" smallint not null,
  "evidence_url" text,
  "their_value" text,
  "checked_at" timestamp with time zone default now() not null,
  "load_run_id" bigint
);
create table meta.data_issue (
  "data_issue_id" bigint generated always as identity not null,
  "source_id" smallint,
  "entity_kind" text not null,
  "entity_key" text not null,
  "issue" text not null,
  "resolution" text,
  "found_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);
create table core.franchise (
  "franchise_id" integer generated always as identity not null,
  "sport_code" text not null,
  "founded_on" date,
  "folded_on" date,
  "notes" text,
  "source_id" smallint,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "source_key" text
);
create table core.franchise_identity (
  "franchise_identity_id" integer generated always as identity not null,
  "franchise_id" integer not null,
  "valid_during" daterange not null,
  "location" text not null,
  "nickname" text not null,
  "full_name" text not null,
  "abbreviation" text,
  "region" text,
  "country_code" text not null,
  "source_id" smallint
);
create table core.franchise_league (
  "franchise_id" integer not null,
  "league_code" text not null,
  "valid_during" daterange not null,
  "source_id" smallint
);
create table core.season (
  "season_id" integer generated always as identity not null,
  "league_code" text not null,
  "start_year" smallint not null,
  "end_year" smallint not null,
  "label" text not null,
  "regular_starts_on" date,
  "regular_ends_on" date,
  "playoffs_end_on" date,
  "games_per_team" smallint,
  "notes" text,
  "source_id" smallint,
  "points_system" text,
  "overtime_rule" text,
  "ties_allowed" boolean,
  "playoff_format" jsonb,
  "rules_version" jsonb,
  "all_star_on" date,
  "trade_deadline_on" date,
  "work_stoppage" text
);
create table core.team_season (
  "team_season_id" integer generated always as identity not null,
  "franchise_id" integer not null,
  "season_id" integer not null,
  "franchise_identity_id" integer,
  "conference_id" integer,
  "division_id" integer,
  "home_venue_id" integer,
  "source_id" smallint,
  "head_coach_person_id" bigint,
  "captain_person_id" bigint,
  "final_rank" smallint,
  "playoff_seed" smallint,
  "playoff_result" text
);
create table core.game (
  "game_id" bigint generated always as identity not null,
  "season_id" integer not null,
  "phase" core.season_phase not null,
  "game_date" date not null,
  "starts_at" timestamp with time zone,
  "home_team_season_id" integer not null,
  "away_team_season_id" integer not null,
  "venue_id" integer,
  "is_neutral_site" boolean default false not null,
  "status" core.game_status not null,
  "home_score" smallint,
  "away_score" smallint,
  "went_to_overtime" boolean,
  "decided_by_shootout" boolean,
  "original_date" date,
  "broadcaster" text,
  "notes" text,
  "source_id" smallint not null,
  "source_key" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "series_id" bigint,
  "series_game_number" smallint,
  "round_label" text,
  "game_number" smallint,
  "attendance" integer,
  "duration_minutes" smallint,
  "ended_at" timestamp with time zone,
  "overtime_periods" smallint,
  "decided_by" text,
  "home_seed" smallint,
  "away_seed" smallint,
  "is_all_star" boolean default false not null,
  "is_outdoor" boolean,
  "is_international" boolean,
  "temperature_c" numeric(4,1),
  "wind_kph" smallint,
  "wind_direction" text,
  "sky" text,
  "precipitation" text,
  "roof_state" text,
  "surface" text,
  "regulation_periods" smallint,
  "end_period" smallint,
  "is_makeup" boolean,
  "reschedule_reason" text,
  "day_night" text,
  "home_series_wins" smallint,
  "away_series_wins" smallint,
  "neutral_site_reason" text
);
create table core.external_id (
  "entity_kind" text not null,
  "entity_id" bigint not null,
  "source_id" smallint not null,
  "external_key" text not null
);
alter table ref.sport add constraint "sport_pkey" PRIMARY KEY (sport_code);
alter table ref.sport add constraint "sport_sport_code_check" CHECK ((sport_code ~ '^[a-z_]+$'::text));
alter table ref.country add constraint "country_country_code_check" CHECK ((country_code ~ '^[A-Z]{2}$'::text));
alter table ref.country add constraint "country_pkey" PRIMARY KEY (country_code);
alter table ref.league add constraint "league_check" CHECK (((dissolved_on IS NULL) OR (founded_on IS NULL) OR (dissolved_on >= founded_on)));
alter table ref.league add constraint "league_league_code_check" CHECK ((league_code ~ '^[a-z0-9_]+$'::text));
alter table ref.league add constraint "league_pkey" PRIMARY KEY (league_code);
alter table ref.league add constraint "league_country_code_fkey" FOREIGN KEY (country_code) REFERENCES ref.country(country_code);
alter table ref.league add constraint "league_sport_code_fkey" FOREIGN KEY (sport_code) REFERENCES ref.sport(sport_code);
alter table meta.source add constraint "source_code_check" CHECK ((code ~ '^[a-z0-9_]+$'::text));
alter table meta.source add constraint "source_code_key" UNIQUE (code);
alter table meta.source add constraint "source_kind_check" CHECK ((kind = ANY (ARRAY['database_backup'::text, 'file_archive'::text, 'website'::text, 'api'::text, 'dataset'::text, 'manual'::text])));
alter table meta.source add constraint "source_pkey" PRIMARY KEY (source_id);
alter table meta.source add constraint "source_tier_check" CHECK ((tier = ANY (ARRAY['green'::text, 'grey'::text, 'red-confirm'::text, 'red'::text])));
alter table meta.verification add constraint "verification_entity_kind_check" CHECK ((entity_kind = ANY (ARRAY['franchise'::text, 'franchise_identity'::text, 'team_season'::text, 'season'::text, 'game'::text, 'betting_line'::text, 'person'::text, 'venue'::text, 'player_season_stat'::text, 'soccer_match'::text, 'cup_series'::text])));
alter table meta.verification add constraint "verification_entity_kind_entity_id_field_source_id_key" UNIQUE (entity_kind, entity_id, field, source_id);
alter table meta.verification add constraint "verification_pkey" PRIMARY KEY (verification_id);
alter table meta.verification add constraint "verification_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
CREATE INDEX verification_entity_idx ON meta.verification USING btree (entity_kind, entity_id);
alter table meta.data_issue add constraint "data_issue_pkey" PRIMARY KEY (data_issue_id);
alter table meta.data_issue add constraint "data_issue_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.franchise add constraint "franchise_check" CHECK (((folded_on IS NULL) OR (founded_on IS NULL) OR (folded_on >= founded_on)));
alter table core.franchise add constraint "franchise_pkey" PRIMARY KEY (franchise_id);
alter table core.franchise add constraint "franchise_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.franchise add constraint "franchise_sport_code_fkey" FOREIGN KEY (sport_code) REFERENCES ref.sport(sport_code);
CREATE UNIQUE INDEX franchise_source_key ON core.franchise USING btree (source_id, source_key);
alter table core.franchise_identity add constraint "franchise_identity_pkey" PRIMARY KEY (franchise_identity_id);
alter table core.franchise_identity add constraint "franchise_identity_country_code_fkey" FOREIGN KEY (country_code) REFERENCES ref.country(country_code);
alter table core.franchise_identity add constraint "franchise_identity_franchise_id_fkey" FOREIGN KEY (franchise_id) REFERENCES core.franchise(franchise_id) ON DELETE CASCADE;
alter table core.franchise_identity add constraint "franchise_identity_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.franchise_league add constraint "franchise_league_pkey" PRIMARY KEY (franchise_id, valid_during);
alter table core.franchise_league add constraint "franchise_league_franchise_id_fkey" FOREIGN KEY (franchise_id) REFERENCES core.franchise(franchise_id) ON DELETE CASCADE;
alter table core.franchise_league add constraint "franchise_league_league_code_fkey" FOREIGN KEY (league_code) REFERENCES ref.league(league_code);
alter table core.franchise_league add constraint "franchise_league_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.season add constraint "season_check" CHECK (((end_year >= start_year) AND (end_year <= (start_year + 1))));
alter table core.season add constraint "season_games_per_team_check" CHECK ((games_per_team > 0));
alter table core.season add constraint "season_league_code_start_year_key" UNIQUE (league_code, start_year);
alter table core.season add constraint "season_pkey" PRIMARY KEY (season_id);
alter table core.season add constraint "season_league_code_fkey" FOREIGN KEY (league_code) REFERENCES ref.league(league_code);
alter table core.season add constraint "season_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.team_season add constraint "team_season_franchise_id_season_id_key" UNIQUE (franchise_id, season_id);
alter table core.team_season add constraint "team_season_pkey" PRIMARY KEY (team_season_id);
alter table core.team_season add constraint "team_season_franchise_id_fkey" FOREIGN KEY (franchise_id) REFERENCES core.franchise(franchise_id);
alter table core.team_season add constraint "team_season_franchise_identity_id_fkey" FOREIGN KEY (franchise_identity_id) REFERENCES core.franchise_identity(franchise_identity_id);
alter table core.team_season add constraint "team_season_season_id_fkey" FOREIGN KEY (season_id) REFERENCES core.season(season_id);
alter table core.team_season add constraint "team_season_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
alter table core.game add constraint "game_attendance_check" CHECK ((attendance >= 0));
alter table core.game add constraint "game_away_score_check" CHECK ((away_score >= 0));
alter table core.game add constraint "game_check" CHECK ((home_team_season_id <> away_team_season_id));
alter table core.game add constraint "game_check1" CHECK (((status <> 'final'::core.game_status) OR ((home_score IS NOT NULL) AND (away_score IS NOT NULL))));
alter table core.game add constraint "game_day_night_check" CHECK ((day_night = ANY (ARRAY['day'::text, 'night'::text, 'twilight'::text])));
alter table core.game add constraint "game_decided_by_check" CHECK ((decided_by = ANY (ARRAY['regulation'::text, 'overtime'::text, 'shootout'::text, 'tie'::text, 'forfeit'::text, 'shortened'::text, 'called'::text])));
alter table core.game add constraint "game_duration_minutes_check" CHECK ((duration_minutes > 0));
alter table core.game add constraint "game_end_period_check" CHECK ((end_period > 0));
alter table core.game add constraint "game_home_score_check" CHECK ((home_score >= 0));
alter table core.game add constraint "game_overtime_periods_check" CHECK ((overtime_periods >= 0));
alter table core.game add constraint "game_pkey" PRIMARY KEY (game_id);
alter table core.game add constraint "game_regulation_periods_check" CHECK ((regulation_periods > 0));
alter table core.game add constraint "game_roof_state_check" CHECK ((roof_state = ANY (ARRAY['open'::text, 'closed'::text, 'dome'::text, 'none'::text])));
alter table core.game add constraint "game_source_id_source_key_key" UNIQUE (source_id, source_key);
alter table core.game add constraint "game_away_team_season_id_fkey" FOREIGN KEY (away_team_season_id) REFERENCES core.team_season(team_season_id);
alter table core.game add constraint "game_home_team_season_id_fkey" FOREIGN KEY (home_team_season_id) REFERENCES core.team_season(team_season_id);
alter table core.game add constraint "game_season_id_fkey" FOREIGN KEY (season_id) REFERENCES core.season(season_id);
alter table core.game add constraint "game_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
CREATE INDEX game_away_idx ON core.game USING btree (away_team_season_id);
CREATE INDEX game_home_idx ON core.game USING btree (home_team_season_id);
CREATE INDEX game_season_date_idx ON core.game USING btree (season_id, game_date);
alter table core.external_id add constraint "external_id_entity_kind_check" CHECK ((entity_kind = ANY (ARRAY['franchise'::text, 'team_season'::text, 'venue'::text, 'person'::text, 'game'::text, 'season'::text, 'award'::text, 'award_winner'::text, 'series'::text, 'draft_pick'::text, 'transaction'::text])));
alter table core.external_id add constraint "external_id_pkey" PRIMARY KEY (source_id, entity_kind, external_key);
alter table core.external_id add constraint "external_id_source_id_fkey" FOREIGN KEY (source_id) REFERENCES meta.source(source_id);
CREATE INDEX external_id_entity_idx ON core.external_id USING btree (entity_kind, entity_id);
