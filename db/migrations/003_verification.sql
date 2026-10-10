-- What the viewer needs to show where data came from, when it arrived, and
-- whether an independent source agrees with it.

alter table meta.load_run
  add column if not exists kind text not null default 'import'
    check (kind in ('import', 'merge', 'rebuild', 'verification')),
  add column if not exists summary text,
  add column if not exists details jsonb not null default '{}'::jsonb;
comment on table meta.load_run is 'Every import, merge, rebuild and verification pass, in order: the viewer''s activity feed.';

create type meta.verification_status as enum ('confirmed', 'disputed', 'not_found');

create table meta.verification (
  verification_id  bigint generated always as identity primary key,
  entity_kind      text not null check (entity_kind in
                     ('franchise', 'franchise_identity', 'team_season', 'season', 'game', 'betting_line',
                      'person', 'venue', 'player_season_stat')),
  entity_id        bigint not null,
  field            text not null default '*',
  status           meta.verification_status not null,
  source_id        smallint not null references meta.source,
  evidence_url     text,
  their_value      text,
  checked_at       timestamptz not null default now(),
  load_run_id      bigint references meta.load_run,
  unique (entity_kind, entity_id, field, source_id)
);
create index verification_entity_idx on meta.verification (entity_kind, entity_id);
comment on table meta.verification is 'A second source''s word on a value: confirmed (a check mark), disputed (with their value) or not found.';
