# Deploying the site

Moved word for word from [AGENTS.md](../AGENTS.md) on 2026-10-30, so that file stays short enough to load in every session. Read this before any deploy, a rollback or a change to a deploy script. Only the coordinating session deploys, unless its brief directs an agent to (AGENTS.md section 7).

The coordinating session deploys a finished feature and runs `done`. An agent deploys, or marks a ticket done, only when the coordinating session's brief directs it to; then it uses the commands below. Deploy only
a commit that is on `origin/main` and passed the checks in [AGENTS.md section 6](../AGENTS.md#6-doing-the-work); a deployment carries everything on `main`, not just
your commit.

**Normal path: `bash scripts/deploy.sh`** (John or the coordinating session; `--dry-run` changes nothing). It reads the waiting hand-offs
([section 1](../AGENTS.md#who-may-change-what-every-agent-every-subagent), [`scripts/handoff/README.md`](../scripts/handoff/README.md)), confirms every
migration object a hand-off needs exists on production (`to_regclass` through the Management API, keychain item `spx-stats SUPABASE_ACCESS_TOKEN`)
and every Turso table, and refuses with the names if not. It then deploys a clean `git archive` of `origin/main` exactly as the CLI block below,
waits for READY, runs `check-live-auth.sh`, checks each listed page with the Vercel protection-bypass header (keychain item
`spx-stats VERCEL_AUTOMATION_BYPASS_SECRET`; skipped, and the reply says so, when absent), marks the tickets done, writes `replies/<ticket-id>.json`
and moves the hand-offs to `done/`. Data steps show the `ds1-apply --dry-run` plan, apply only after a y/N, then `release.py prepare`; John still approves
at `/admin/data`. Packages get a tag push (after a y/N) instead of a deploy. Tests: `bash scripts/handoff/test/handoff-test.sh`. Untested against real
Vercel, Supabase and DS1: the stubs cover the logic only. The manual routes below stay as the fallback.

**Preferred on a Mac: build against DS1, deploy prebuilt** (**untested** end to end; its PostgREST and data check are tested
against a stand-in database). Each `next build` used to read production PostgREST hundreds of times (a parallel build stalled
production on 2026-10-14). One command from the repo root builds the pages from DS1 instead and uploads the result:

    bash scripts/mac/deploy-prebuilt.sh                  # origin/main; --check-only changes nothing; --sha <commit>; --no-deploy; --no-prune; --force

- It starts a PostgREST in Docker (pinned `postgrest/postgrest:v12.2.12`, `127.0.0.1:7790`, schema `api`, role `anon`, read-only sessions) on DS1
  Postgres (host from `ds1_host`, password read in-process from the keychain item `spx-stats-db DS1 55440` or `SPX_DS1_DB_PASSWORD`, never printed),
  checks with `scripts/mac/same-data.py` that it serves what production serves (latest release number, `api.season_summary`, and every
  published table by row count and the drift check's bucket hashes; the DS1 side of `PUBLISH_FILTER` is filtered) and **stops if not**: DS1 can be
  ahead (a release waiting for approval, scores loaded since the last release) or have a stale materialized view, and a build from it would publish
  rows John has not approved. `--force` continues when the data differs. A side that cannot be read (exit 2) always stops, `--force` included.
  The tables of `TABLES` in `scripts/release/turso.py` (`meta.verification`, `meta.data_issue`, `core.external_id`, `core.batted_ball_player`, `core.batted_ball_player_hand`,
  `core.betting_line`, the derived `api` tables) are not on production, so they are compared DS1 against Turso (the release runner's own
  `turso.diff_table`; Turso from `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` or `TURSO_READ_TOKEN`, else the keychain items `spx-stats TURSO_DATABASE_URL`
  and `spx-stats TURSO_READ_TOKEN`), never counted as production differences; with no Turso credentials they are skipped with a printed `SKIPPED` line.
- It then does what the fallback below does (clean `git archive`, `vercel link`), plus `vercel pull`, `vercel build --prod` with
  `SPX_REST_URL=http://127.0.0.1:7790/` and `vercel deploy --prebuilt --prod`, stops the container by name, makes one request to spxn.com, and prunes
  Vercel to the live deployment and one previous (plus the pinned `spx-stats-1p836thn0`, one `vercel remove --safe` per URL).
- `SPX_REST_URL` is read by `web/src/lib/api/config.ts` and accepted only for `127.0.0.1`/`localhost` (`pnpm test:resturl`). It is never set on
  Vercel: pages revalidated at run time (daily ISR, or on demand after a release) still read production, so the data a page shows after its first revalidation is production's.
- DS1 holds more than production (`PUBLISH_FILTER`: the game rows of `core.external_id`). **No `api` view or function that is in production reads
  `core.external_id`** (checked in `db/migrations`; only `ingest.report_results`, not installed there, does), and PostgREST exposes only schema
  `api`, so the DS1 build needs no filter. If a view ever reads that table, filter it in the view or add the same condition to the build.
- Needs Docker Desktop, so a Mac, not the cloud container. Untested: `vercel build` and `vercel deploy --prebuilt` for this project (project settings:
  root directory `web`, install `pnpm install --frozen-lockfile`), whether the footer's commit sha survives the first revalidation on Vercel (it reads
  `VERCEL_GIT_COMMIT_SHA`, which the script sets for the build only). The table check reuses `scripts/sync/compare.py` (`bash scripts/mac/test/same-data-test.sh`).

**Deploy** with the Vercel MCP `create_deployment` (the fallback; the way earlier production deployments were made, and still right when Docker or DS1 is not available):

    teamId: team_3B0yHsuwmVZw2RDT0ar7k07l      (slug spxis-projects-0d6306b4)
    requestBody:
      name: "spx-stats"
      project: "prj_MfgGl5vzVccEhmtSyvgze6hhgXJg"
      target: "production"
      gitSource: { type: "github", org: "spxis", repo: "spx-stats", ref: "main", sha: "<full commit sha>" }

**Without the Vercel connector** (on a Mac with `vercel login` done), deploy a clean copy of the commit, never the
working checkout (worktrees and other agents' files would be uploaded). It waits until the deployment is ready:

    D=$(mktemp -d) && git archive <sha> | tar -x -C "$D" && cd "$D" && \
    vercel link --yes --project spx-stats --scope spxis-projects-0d6306b4 >/dev/null && \
    vercel deploy --prod --yes --scope spxis-projects-0d6306b4; cd ~ && rm -rf "$D"

Tested 2026-10-11 (about a minute; it prints nothing until the build is done). `vercel link` writes a short-lived
token to `.env.local` in that temporary copy; Vercel does not upload it and the last step deletes the copy.

An agent deploys only when its brief directs it to (default: the coordinating session deploys): the connector if present, otherwise the CLI block above, run from
the temporary copy as shown (or with `--cwd` pointing at it), never from the working checkout. The allow rules are in
`.claude/settings.json`. If a deploy is still refused, report the exact block to the coordinating session (John runs
it). Never edit permission settings yourself.

Add `forceNew: "1"` if Vercel reuses an earlier deployment of the same commit. The project is `nextjs`, root
directory `web`, Node 24.x. The call itself is **untested** (past deployments and the project settings were read and
match). If the permission check refuses it, stop and report the exact call to the coordinating session.

**Confirm READY.** The build takes a minute or two. Do not poll in a loop; look a few times:

    get_deployment   idOrUrl: <dpl_… id from the create result>   -> readyState READY (ERROR: read the build log)
    list_deployments projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg, target: production, limit: 3
                     -> newest entry is READY and meta.githubCommitSha is your commit

**The sign-in guard: every deploy path ends with it.** On 2026-10-15 a prebuilt deploy built every kept page signed-out (no Sign in link, no account menu),
because the build could not see the sign-in variables, and nothing noticed. Two checks now stand in the way:
- **Before deploying** (`deploy-prebuilt.sh`, `scripts/mac/lib/build-auth.sh`): the pulled project settings must hold the three sign-in variables, and the built home
  page (`.vercel/output/functions/en/s.prerender-fallback.html`) must contain the sign-in control (`class="signin-link"`), which is how "sign-in was on at build"
  shows in the output. Either fails: nothing is deployed.
- **After deploying**, any path: `bash scripts/mac/check-live-auth.sh [--new <deployment url>]`. One request to `https://spxn.com/api/auth/providers` (must answer 200 and list
  `google`) and one to `https://spxn.com/` (its HTML must carry the sign-in control). `deploy-prebuilt.sh` runs it itself, **before** it prunes. If it fails it prints the exact
  rollback command, `vercel promote https://<previous deployment> --scope spxis-projects-0d6306b4 --yes` (the newest READY production deployment that is not the new one),
  and the deploy stops without pruning, because the previous deployment is the way back. A deploy made with the Vercel connector or the CLI block runs the script by hand
  right after READY and, on a failure, rolls back (the connector's `request_rollback` also works) and tells John. Never mark the ticket done while it fails.
  `bash scripts/mac/test/check-live-auth-test.sh` tests both checks against a fake site (nothing reaches production).

**Then check once**, on the real domain (the `*.vercel.app` URLs sit behind Vercel login; `check-live-auth.sh` above already made the two requests for `/` and the auth routes):

    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/<the page you changed>

Look at the page itself for anything fetched from the database (a "Couldn't load" message means the fetch failed).
Then, only if the brief directs it, `pnpm task done <id> --by "<who>" --version "<short sha>"`.

**Roll back.** Find the last good deployment (`list_deployments` with `rollbackCandidate: true`, state READY), then
`request_rollback` with `projectId: prj_MfgGl5vzVccEhmtSyvgze6hhgXJg`, `deploymentId: <that dpl_ id>`,
`teamId: team_3B0yHsuwmVZw2RDT0ar7k07l`, `description: "<why>"`. This reverts the site only, never the database.
Then fix forward on `main`, redeploy, and tell John.
