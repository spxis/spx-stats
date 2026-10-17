#!/bin/bash
# Scratch Postgres: 2002/2003 WNBA conferences, 165/178 id stability, logo_fit upsert.
# Does not write DS1 or production. Run from the repo root.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="spx-wnba-fix-$$"
PORT=""
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

for candidate in 7740 7741 7742 7743 7745 7746 7747 7748 7749; do
  if ! nc -z 127.0.0.1 "$candidate" >/dev/null 2>&1; then PORT="$candidate"; break; fi
done
if [[ -z "$PORT" ]]; then echo 'no free scratch port in 7740-7749' >&2; exit 1; fi

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
for _ in $(seq 1 40); do
  if pg_isready -h 127.0.0.1 -p "$PORT" -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
P=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d spx_stats -X -q -v ON_ERROR_STOP=1)
cd "$REPO"
"${P[@]}" -f "$REPO/scripts/wnba/scratch_fixture.sql"
"${P[@]}" -f "$REPO/db/build/165_champions_from_games.sql"
"${P[@]}" -f "$REPO/db/build/172_champion_franchises.sql"
"${P[@]}" -f "$REPO/db/build/178_alignment.sql"
"${P[@]}" -f "$REPO/db/build/175_team_logo_fit.sql" >/tmp/spx-wnba-fit1.out

"${P[@]}" <<'SQL'
create table scratch_snap as
select 'award' k, award_winner_id::text id, note as extra from core.award_winner
union all
select 'conf', conference_id::text, league_code || ':' || name || ':' || first_season from core.conference
union all
select 'nhl_ts', team_season_id::text, conference_id::text from core.team_season t
join core.season s using (season_id) where s.league_code = 'nhl'
union all
select 'ver', verification_id::text, checked_at::text from meta.verification
union all
select 'issue', data_issue_id::text, entity_key from meta.data_issue
union all
select 'wnba_conf', team_season_id::text, conference_id::text from core.team_season
where team_season_id in (180788, 180720)
union all
select 'logo_fit', count(*)::text, min(logo_file) from core.logo_fit;
SQL

"${P[@]}" -f "$REPO/db/build/165_champions_from_games.sql"
"${P[@]}" -f "$REPO/db/build/172_champion_franchises.sql"
"${P[@]}" -f "$REPO/db/build/178_alignment.sql"
"${P[@]}" -f "$REPO/db/build/175_team_logo_fit.sql" >/tmp/spx-wnba-fit2.out

"${P[@]}" -f "$REPO/db/checks/052_alignment_missing.sql" > /tmp/spx-wnba-052.out

"${P[@]}" <<'SQL'
do $$
declare
  missing int;
  c2002 int;
  c2003 int;
  drift int;
  orphans int;
begin
  select count(*) into missing
  from (
    select t.team_season_id
    from core.team_season t
    join core.season s using (season_id)
    where (t.conference_id is null
           and exists (select 1 from core.conference c where c.league_code = s.league_code and s.start_year between c.first_season and coalesce(c.last_season, 32767))
           and exists (select 1 from core.team_season o where o.season_id = t.season_id and o.conference_id is not null))
       or (t.division_id is null
           and exists (select 1 from core.team_season o where o.season_id = t.season_id and o.division_id is not null))
  ) x;
  if missing <> 0 then
    raise exception '052 on scratch expected 0, got %', missing;
  end if;

  select conference_id into c2002 from core.team_season where team_season_id = 180788;
  select conference_id into c2003 from core.team_season where team_season_id = 180720;
  if c2002 is null then raise exception '2002 team_season 180788 still has no conference'; end if;
  if c2003 is null then raise exception '2003 team_season 180720 still has no conference'; end if;
  if (select name from core.conference where conference_id = c2002) <> 'Western Conference' then
    raise exception '2002 Starzz expected Western, got %', (select name from core.conference where conference_id = c2002);
  end if;
  if (select name from core.conference where conference_id = c2003) <> 'Eastern Conference' then
    raise exception '2003 Sun expected Eastern, got %', (select name from core.conference where conference_id = c2003);
  end if;

  select count(*) into drift
  from scratch_snap a
  full outer join (
    select 'award' k, award_winner_id::text id, note as extra from core.award_winner
    union all
    select 'conf', conference_id::text, league_code || ':' || name || ':' || first_season from core.conference
    union all
    select 'nhl_ts', team_season_id::text, conference_id::text from core.team_season t
    join core.season s using (season_id) where s.league_code = 'nhl'
    union all
    select 'ver', verification_id::text, checked_at::text from meta.verification
    union all
    select 'issue', data_issue_id::text, entity_key from meta.data_issue
    union all
    select 'wnba_conf', team_season_id::text, conference_id::text from core.team_season
    where team_season_id in (180788, 180720)
    union all
    select 'logo_fit', count(*)::text, min(logo_file) from core.logo_fit
  ) b using (k, id)
  where a.extra is distinct from b.extra or a.id is null or b.id is null;
  if drift <> 0 then
    raise exception 'rerun churned % snapshot rows', drift;
  end if;

  select count(*) into orphans from core.logo_fit f
  where not exists (select 1 from core.franchise_brand b where core.logo_file(b.logo_url) = f.logo_file);
  -- scratch has one brand on purpose; the seed has many files. Report, do not fail: DS1 175 orphan lines are the real check.
  raise notice 'scratch logo_fit rows matching no logo: %', orphans;
  raise notice 'ok: 180788 Western, 180720 Eastern, 052=0, 165/178/logo_fit ids unchanged on rerun';
end $$;
SQL

echo "scratch port $PORT container $NAME: 052 empty, 2002/2003 conferences set, no-churn on rerun"
