-- DS1 only: anon reads schema api, as on production, for the local PostgREST build (scripts/mac/deploy-prebuilt.sh). Rerunnable.
grant usage on schema api to anon;
grant select on all tables in schema api to anon;
alter default privileges in schema api grant select on tables to anon;
