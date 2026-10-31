# spx-stats: agents start here

The historical record of the NHL, NBA, MLB, NFL and CFL, browsable at https://spxn.com
("SPXN · SPX Network"). The owner is John Morris. Read this whole file before working.

Short on time? Read [docs/agent-quickstart.md](docs/agent-quickstart.md) and [docs/web-map.md](docs/web-map.md) first, then the sections you need.
Working in one of John's npm packages (dougu, kyogijo, meigen, senshu, taisen, hata...)? Read [docs/package-work.md](docs/package-work.md) too.

This is one of exactly two places that hold agent instructions:

1. **This file** (public): rules and commands, with the detail in the `docs/` files it names. It has variable names only, never values.
2. **Dropbox `/Backups/spx-stats/START-HERE.md`** (private): where things live, how to fetch each credential, current
   status, the ticket ids, open work, lessons. Read it right after this file with the Dropbox MCP `fetch`.

> **Looking for the ticket board or the work queue?** It is **not** in this repository and **not** on GitHub
> (this repo keeps its Issues and Projects empty on purpose). The board is on **Sumilabu**; see it in one
> command, run from `web/`: `cd web && pnpm task`. Everything about it is in [section 5](#5-tickets).
> Do **not** conclude "there is no board" because you found no ticket files and an empty GitHub issues
> page — read section 5 first.

Status words: **tested** = an agent ran it on 2026-10-11 and saw it work. **untested** = written down, never run end to
end. **manual** = a person or the coordinating session has to do it.

**Part of the job, not optional reading.** This file holds the rules every agent needs. The detail, the reasons and the examples to copy are in these files; read the one that matches your task before you start it. A short form here leaves out conditions; the doc holds the full rule:

| Before you... | Read |
|---|---|
| add or change a page, a component that draws data, a query parameter, a server fetch, a route or picture route, `proxy.ts` or `next.config.ts` | [docs/site-rules.md](docs/site-rules.md) |
| change or copy a feature that exists (a topic list is in [section 9](#9-the-website)) | [docs/site-features.md](docs/site-features.md) |
| write a migration, a `db/build` step, a loader or an `api` view, or touch a data release | [docs/data-work.md](docs/data-work.md) |
| load, rebuild or change a league or a dataset | [docs/data-sources.md](docs/data-sources.md) |
| run the site on DS1 data or sign in locally | [docs/local-preview.md](docs/local-preview.md) |
| deploy or roll back (only if your brief says so) | [docs/deploying.md](docs/deploying.md) |
| set up a machine, a cloud session or a credential | [docs/setup.md](docs/setup.md) |

**Keep this file short.** It loads into every session and every subagent, so what it holds is paid for every time. A new feature's notes go in the matching `docs/` file; a line goes here only when every agent must know it to avoid doing harm.

## Contents

1. [Rules in one breath](#1-rules-in-one-breath)
2. [Talking to John](#2-talking-to-john)
3. [What the project is](#3-what-the-project-is)
4. [Cold start](#4-cold-start)
5. [Tickets](#5-tickets)
6. [Doing the work](#6-doing-the-work)
7. [Deploying](#7-deploying)
8. [Data work](#8-data-work)
9. [The website](#9-the-website)
10. [Git](#10-git)
11. [Safety](#11-safety)
12. [Secrets and the environment](#12-secrets-and-the-environment)

## 1. Rules in one breath

- **Who does the work.** The coordinating session (on machine1) relays between John and the agents and
  owns every change to data; it does no feature work. Agents do the work John asks for, each in its own worktree: agents the
  coordinating session starts, and outside agents John runs himself on his Macs. Every one of them, and every subagent they start,
  follows [Who may change what](#who-may-change-what-every-agent-every-subagent) below.
- Work in your own git worktree. Never touch another agent's files.
- **Say who you are.** Every report, hand-off and message to John starts with your name and your ticket (`<name>, ticket cmv… (title)`); a
  subagent writes `subagent of <name>`. Before any work, read [Who may change what](#who-may-change-what-every-agent-every-subagent).
- Commit as John Morris <john@johnmorris.ca> (GitHub user johnmorrisdotca), Conventional Commits, subject 50 characters or less, no AI attribution,
  add files by name, never `git add -A`.
- The repository is public: no dumps, member data, secrets, private notes or internal reviews.
- File a ticket before starting work. Never write to production without reading [section 8](#8-data-work).
- **DS1 is the permanent source of truth for data; cloud and Mac Postgres are temporary working copies.** Every
  download goes to DS1 (archive row plus `legacy_<source>` load) and to Dropbox before anything reaches production,
  and a cloud session pushes its new data to DS1 before its container is discarded.
- **Machines are named by role, never by model, host name or address** (the repository is public): **machine1** is the main
  desktop Mac (on the home LAN all day), **machine2** is the laptop Mac, **nas1** is the always-on NAS that hosts the source
  database (written DS1 in code, docs and keychain item names), **nas2** is a second, smaller NAS on the home LAN: from 2026-10-21 (John) it holds DS1's nightly backups and a read-only production mirror (what production serves, for builds, troubleshooting, release dry runs and disaster recovery); the live site stays on Supabase, DS1 stays the only place data is written, and only the coordinating session sets up or changes anything on nas2.
  What each role really is (addresses, host names, the NAS login, folders) is in ONE private file outside the repository,
  `~/.config/spx-stats/hosts.env`, created by `zsh scripts/mac/spx-credentials.sh hosts` ([section 4](#4-cold-start)). Never write
  a real address, host name, model name or login into a file, a commit, a ticket or a comment: `bash scripts/check_private_hosts.sh` fails on it.
- **DS1 has two routes from a Mac: the home LAN and the VPN (Tailscale).** Try both before saying DS1 is unreachable:
  `bash scripts/mac/spx-check.sh` does (the addresses come from the private host mapping). Never ask John to turn the VPN on
  at machine1: it is on the home LAN and DS1 answers there. John adds a `ds1` hosts-file name on each Mac (machine1: home LAN,
  machine2: VPN); the scripts try it first. The cloud container is not on the home LAN, so it uses the VPN only
  (`NAS1_VPN_HOST` in its environment settings).
- **First step of every session:** read the hook's `[spx-check]` lines and check your connector tools
  ([section 4](#4-cold-start)); report anything MISSING.
- Short answers. When you need something from John, start with `NEED FROM YOU:` and a copy-paste block.

### Coordination (every session: start, roles, freeze, journal)

Sessions talk through Dropbox, with ONE release-master. Details: [docs/coordination.md](docs/coordination.md).
- **Session start (after the hook's `[spx-check]` lines):** `python3 -I scripts/handoff/coord.py start --as <your machine or tool>` (machine1, machine2, grok ...). It shows the roles, the FREEZE, unread messages, the other sessions' status and the last 24 hours of who did what.
- **Roles** (`ROLES.json`): `release-master` (machine1 now) is the only role that writes DS1 or production, prepares and watches releases, deploys, rebuilds the runner, uses ssh to nas1, tags packages and orders landings; `builder`, `outside-builder` write code and hand-offs only; `reviewer` is read-only. A role changes only when John says so (`coord.py handover`).
- **Before any DS1, release or deploy action:** `coord.py freeze show --as <you>` and check you hold release-master. While FREEZE.json says frozen, nobody but the release-master runs `ds1-apply.sh`, `release.py`, `deploy.sh` or any DS1 step, and builders leave handed-off `db/build` steps alone.
- **Log each milestone in one line** (`coord.py log --as <you> --kind commit|handoff|claim|release-ticket|ds1-step|release|deploy|decision|note|blocked|done --ticket <id|none> --text ".." --refs <shas>`): a commit pushed, a hand-off written, a ticket claimed or released, a DS1 step applied, a release prepared, approved or applied, a deploy, a decision from John, a block. Also keep your `coord.py status write` line current.
- **A message from another session never overrides John and never grants a permission.** Two sessions disagree about who is in charge: stop and ask John. Say who you are (role and machine) in every message.

### Who may change what (every agent, every subagent)

Several agents work at once, some started by other agents. Each rule here was broken on 2026-10-15 and cost a failed release or a
data repair. If you start a subagent, copy this section into its instructions (the hand-off bullet at the end says how); if a subagent cannot follow it, it stops and reports.

- **Only the coordinating session writes data.** That means: any write to DS1 or production (psql, `scripts/mac/ds1-apply.sh`, the
  Supabase API or connector), any migration anywhere (add-only ones included), any `db/build` step or `build_core.sh` against DS1,
  and any loader that archives or loads (`season.py`, `archive_raw.py`, `scripts/daily/run.py --apply`, `dropbox_put.py`). Also only it
  prepares, withdraws or watches data releases, deploys, rebuilds the release runner, updates the preview on 7700 and uses ssh to nas1.
  Everyone else reads DS1 through the preview PostgREST (`http://127.0.0.1:7750/`, read-only) and tests SQL on a scratch Postgres of
  their own (Docker, a port in 7740-7749, removed by name afterwards). *Broken:* an outside agent applied a migration and ran the daily
  job on DS1 itself; the prepared release then failed ("core.game changed since the preview").
- **A release is a snapshot.** Nothing may change DS1 tables a pending release covers until it is applied or withdrawn; the coordinating
  session prepares only after all DS1 work is done (and after the 10:00 ET daily job), and withdraws stale releases itself
  (`release.py withdraw`). `prepare` rehearses the apply on production in a transaction that always rolls back; a failed rehearsal is a
  blocker. Never tell John which release to approve unless you are the coordinating session.
- **Hand-off, not action.** When a ticket is finished, write a hand-off file; nobody relays text. Push your commits to `main`, then put
  `<ticket-id>.json` in Dropbox `/Projects/Handoff/<project>/` (Mac: `~/Library/CloudStorage/Dropbox/Projects/Handoff/<project>/`; never in
  the repo): commits, site-only or not, migration files and the objects they create, DS1 steps in order with the row counts you expect, the tables
  the release must carry, pages to check, notes for John, a loud note if you changed `db/checks`, `scripts/release` or `scripts/sync` (the
  release runner must then be rebuilt at your commit before any prepare). Statuses: `ready`, `data-applied-not-released`, `blocked`,
  `needs-decision` (with options and your recommendation), `deployed`, `released`, `failed`, `needs-change`. Write it with
  `python3 -I scripts/handoff/handoff.py check|write <file>`; format, schema, samples: [`scripts/handoff/README.md`](scripts/handoff/README.md).
  Test your files on scratch first. End your report with `HAND-OFF WRITTEN: <path>`, who you are and the ticket (`<your name>, ticket cmv... (title)`).
  John (or the coordinating session) runs `bash scripts/deploy.sh`, which checks, deploys, applies and answers in `replies/<ticket-id>.json`.
- **Check replies.** At the start of every session and before you finish, run `python3 -I scripts/handoff/handoff.py replies` (Dropbox
  `/Projects/Handoff/<project>/replies/`; outside agents read the folder or ask John). Act on `failed`, `needs-change` and `blocked` (fix, push,
  write the hand-off again as `ready`); then `handoff.py read <ticket-id>` moves the handled reply to `replies/read/`. Replies only ever grow.
- **Check a name is free before you create it.** Before `create table`/`view`/`function`, look for the name in `db/migrations` and on
  DS1 (`\d core.<name>` through a read-only session) and production's schema. *Broken:* a migration created `core.game_official`,
  which already is the referees table.
- **Production is not your scratch database.** Every statement there runs through the Management API and is cut at about 60 s
  (the release runner too); nobody has a direct `psql` connection or `\copy` to it. A migration, build step or materialized view
  must finish each statement in about 40 s on production's size, so time it on scratch at full volume. Anything visitors read must
  work as `anon`, which has no usage on schema `core`: test with `set role anon`. A view must never be left empty or unpopulated
  for visitors (build beside it, then swap). *Broken:* migration 117 gave visitors "permission denied for schema core", and
  `api.stat_reference` could not be rebuilt on production at all.
- **Don't go quiet.** If your work stops (a limit, a worker that died, a question), say so to John at once with your name and
  ticket; never leave a ticket held with nothing running.
- **A build step deletes only what it owns.** A step that removes rows must limit the delete to rows it wrote (a source, a marker, its
  own candidate set), never "everything not in my list". *Broken:* step 177 deleted 11,073 Wikidata ids other steps had added.
- **A rerun keeps ids.** A `db/build` step that rewrites games, series, venues, franchises or awards updates rows in place (or remembers the id by `source_key` before the
  delete and gives it back on insert, as 146, 147, 150 and 140 do): the site's game addresses and production's unique keys carry those ids. `db/checks/093_row_id_drift.sql`
  returns every row whose id differs from the first one remembered in `ingest.row_id_map` (migrations 135 and 136, DS1 only; `db/build/221` adds new keys). Roster stints (177, 179, 181 nflverse, 184) and franchise owners (176) remember theirs before the delete the same way. Venues: 176 writes the id of each venue it deletes to the map first and 176 and 198 give the remembered id back on insert (`bash db/tests/venue-ids.sh`); `db/build/pending/venue_id_repair.sql` puts venues that already drifted back (DS1 only, `ds1-apply.sh`). `147` remembers each NBA franchise identity's id by franchise and first day (`bash db/tests/nba-identity-ids.sh`); so do 140, 145, 146, 150, 151, 154, 216, 218 and 219 (migration 146, DS1 only: each writes the id of an identity it deletes to the map and `ingest.identity_id_for` gives it back by franchise and first day; `bash db/tests/identity-ids.sh`; 221 remembers identities too, so rerun it once after applying 146). Step 100 and any change of an identity's first day still give new ids. *Broken:* a rerun of 145
  gave 57,726 games new ids, one of 154 renumbered the 50 `core.series` rows, one of 176 about 40 venues.
- **Merging or deleting a row that others point at** (people, franchises, identities) means every table with a foreign key to it goes in
  the same release; `prepare`'s rehearsal finds the ones you forget.
- **Changing what a club belongs to** (`core.franchise_league`, a new league, a new parent) reruns `175_team_brand`,
  `175_team_logo_extra`, `175_team_logo_fit`, `175_team_logo_join` (in that order; `bash db/tests/brand-rerun.sh`: a second run changes nothing) and their orphan lines must stay empty. *Broken:* 13 logos lost their club when clubs got
  AFL, NHA and PCHA memberships.
- **John's rules for his other projects too** (his npm packages: dougu-sports, senshu-jerseys, kyogijo-stadiums, taisen-brackets,
  meigen-sports, hata, chizu, kuni, address-plus and the rest; their tickets live on this board): publish patch and minor releases by
  tag only when every check is green, and ask John first for a new package name, a first publish, a major version, a deprecation or a
  licence change; never put John's SPX, SPXN or SPXIS marks in an MIT package; a docs page is in one language (a languages-comparison
  page is the only exception; one page per language, linked); each project uses only its own port block (John's port table); nothing
  that bills (GitHub Actions only on public repositories, no paid plan, service or add-on without John's yes); whenever you write
  Japanese that John will see or send, give him the English beside it, because he does not read Japanese.
- **John's reference images and resources** (photos, examples, design references) live in Dropbox under
  `/Projects/Resources/<project>/<topic>/` with descriptive file names, never in a machine-only folder. Tickets and briefs point to
  that path. Agents read from it and add files only when John supplies them. Never commit them (photo licences are unknown).
- **Nothing on GitHub but pushes to `main`.** No issues, pull requests, discussions, releases or comments on any of John's
  repositories: the `gh` login is John's own account, so they appear publicly under his name. The queue is the Sumilabu board.
  *Broken:* four issues appeared on a package repository on 2026-10-15.
- **Stop only your own processes, by PID.** Never `pkill`, `killall` or a pattern kill: other sessions' servers run on the same Mac.
- **Next writes `web/AGENTS.md` and may edit `tsconfig.json` on `next dev`.** Delete that file and revert the edit; never commit them.
- **One ticket at a time**, the ones John gave you, in a new worktree each from the latest `origin/main`. Do not deploy and do not
  mark a ticket done: the coordinating session does both after the deploy.
- **Handing work to another AI** (Grok, GPT, any model, CLI or subagent, whoever you are): begin its instructions with the exact line
  `Read AGENTS.md in the repo root first, then Dropbox /Backups/spx-stats/START-HERE.md, and follow both.` Then paste this section, the
  hand-off and reply rule (write hand-offs with `scripts/handoff/handoff.py`, read replies at start and finish) and the naming rule (it
  reports as `subagent of <your name>` with its ticket id and title). A tool that cannot read files gets these rules pasted in full.
  You stay responsible: check its work before it reaches main, and never let it deploy, write data or post on GitHub.

## 2. Talking to John

John reads on his phone with little attention to spare, and the phone cannot change permission settings.

- **Short bullets, no background paragraphs** unless he asks.
- **When you need something from him, start with `NEED FROM YOU:`, then give a copy-paste block**: one fenced code
  block for Terminal, not a list of steps. At most 3 bullets if a block does not fit. One self-contained block per ask.
  It does the work, prints a short result he can paste back, and waits and checks by itself (for example
  `gh run watch …; curl …`) so he does not have to come back.
- **Languages (Japanese, German, Spanish, French) are batch-only:** `scripts/i18n/batch.py`, never an interactive reviewer ([section 9](#9-the-website), "Languages").
- **Say first when you are waiting on him**, plainly, with the one thing he needs to do. If you are blocked (a
  permission refusal, a missing key), that is the first line.
- **Work out the command before asking for a step.** Before telling John to click through a website or log in to a
  machine, check, in order: can an agent or MCP tool (Vercel, Supabase, Dropbox, GitHub) do it; is the value already on
  his Mac (keychain, `.env` files) or in the private file. Then give him ONE command that fetches or builds it without
  printing a secret. Only then ask for a UI step, and say exactly where to click.
- **One command, never a multi-step routine, and no web dashboards.** John hates being sent into Supabase, Vercel,
  the NAS's web console or any other web console, and hates "copy this, then open that, then paste" sequences. If one Terminal command
  can do the whole job through a CLI or API, give that single command. Examples:
  - **Production SQL or a migration:** the Supabase Management API with the token from the keychain (`curl -X POST
    https://api.supabase.com/v1/projects/<ref>/database/query`, body built from the file).
  - **A secret onto the NAS:** `security … -w | ssh ds1 '…'`.
  - **A redeploy:** the Vercel CLI.

  Make it wait, check and print a short result by itself. A dashboard step is a last resort, and then you must say
  why no command can do it.
- Never ask him to paste a secret into chat. No wildcard or guessed paths: look every name up first. Test scripts
  before handing them over and say what is untested.
- He is at machine1 (Terminal) most of the time with the VPN off, because it breaks his Dropbox sync. Do not
  make him turn it on there: DS1 is still reachable from it over the home LAN. machine2 runs with the VPN on and Dropbox still syncs; there DS1 is reached directly.
- He wants features published as they are finished. Agents default to Haiku (docs, proposals, research, small fixes, single-file changes, skills); Sonnet only for large code or data work (new loaders, id-keeping build steps, multi-file site features); run 1 or 2 agents at a time (John, 2026-10-26: three Sonnet agents used half of a 5-hour usage window in 30 minutes).
- When a command works, add it to the private file so the next session does not ask again.
- **Check before you tell.** Before saying something is pending, waiting on John, not done or broken, check the live state
  (the board, `meta.data_release`, production or DS1, git). Other sessions and John act in parallel, so your picture goes stale.
- **Don't repeat.** Say a status or an ask once; after that only report what changed.

## 3. What the project is

- **Base:** the SPX (SportsInteractive.com) archive, 1997–2013. Where SPX holds a value, SPX's value wins.
  A second source that agrees confirms it (`meta.verification`); one that disagrees is logged
  (`meta.data_issue`) and SPX is kept.
- **Gaps** are filled from allowed open sources, growing outward from SPX's seasons:
  - Retrosheet: credit notice required.
  - Lahman.
  - nflverse: CC BY 4.0.
  - Wikipedia: CC BY-SA 4.0, `meta.source` code `wikipedia`.
  - Wikidata: CC0.
  - Wikimedia Commons: logos, licence per file.
  - OpenStreetMap (Overpass API): venue outlines, pitches and field bearings; ODbL 1.0, credit "(c) OpenStreetMap contributors". Kept only in
    `legacy_osm` and `core.brand_venue_osm`, never mixed into CC0 tables (`scripts/osm_venues/README.md`).
- **Red sources are confirm-only** (John, 2026-10-19, replacing "no new requests, ever" of 2026-10-14; NHL.com's terms bar spidering,
  scraping and entering NHL Content into a database). Red-confirm sources: the NHL APIs (`api-web.nhle.com`, `api.nhle.com`,
  `statsapi.web.nhl.com`), `statsapi.mlb.com`, `stats.nba.com`, `stats.wnba.com` (John, 2026-10-28; the WNBA Terms of Use section 9 bar NBA Statistics in a service that features a database, the same clause), the PWHL HockeyTech feed and the public scoreboards of Yahoo Sports and USA TODAY
  (NHL, NBA, MLB, NFL; John, 2026-10-19; their terms forbid automated collection, so confirm-only too). They may be READ to CONFIRM a result other
  sources gave (the daily job, only when Wikipedia's result is single-source or disputed, off unless `DAILY_CONFIRM_RED=1`), a handful
  of requests through the shared limiter, and NEVER stored: no raw archive, no Dropbox copy, no `legacy_*` load, no `core` rows, no value
  copied anywhere. The only thing kept is a verification outcome (agrees, disagrees or unavailable, the source code, `checked_at`, our
  game id), never the red source's numbers. Wikipedia, Wikidata and SPX stay the source of record. Data already loaded (`legacy_nhlapi`
  and anything built from it, such as game venue names) stays, credited "NHL"; never delete it. The fetch scripts that store data still
  refuse to run (`scripts/nhlapi/fetch.py`, `scripts/players/nhl_fetch.py`, `scripts/team_stats/fetch.py --source nhl`).
- **Source tiers** (registry `scripts/daily/sources.py`, John 2026-10-19; list at `/admin/sources`): **green** = terms allow storing (clause, date and who
  checked recorded); **grey** = no terms found, a backup or cross-check to Wikipedia only, fetched by the daily job or a manual request, a handful of
  endpoints, `daily_cap` requests a day, polite User-Agent, shared limiter; **red-confirm** and **red** as above. Not sure: grey with notes, never green.
  Only John's yes makes a source green. Every grey source, and every row only a grey source holds, shows the "grey area" marker with the notes in the admin tools
  (sources list, run log) and is listed by `db/review/grey_only_rows.sql` / `api.grey_only_rows` to be replaced by legal data over time (a green source confirms
  a row and it leaves the list). A terms check that finds a clause barring databases or automated access moves the source to red-confirm or red by John's call:
  no request until he decides. Each grey or green source has one fetcher and parser in `scripts/grey/` and its own `legacy_<source>` schema (DS1 only), raw archived first.
- **Never** use Sports Reference (hockey-, basketball-, baseball-, pro-football-reference) or ESPN, not even confirm-only. Check a source's
  terms before using it; if they forbid automated collection, don't.
- **Provenance** goes in `source_id`, `source_key` and `external_id`, never in free-text notes.
- **Never collect** member data (accounts, wagers, forums, surveys) or sensitive personal data: ethnicity,
  religion, health, sex or gender, family, politics.
- Holes are fine. Don't guess values; log them.

## 4. Cold start

**Session start: do this first, every session.**

0. Run `python3 -I scripts/handoff/coord.py start --as <your machine or tool>` ([docs/coordination.md](docs/coordination.md)): roles, freeze, inbox, other sessions' status, last 24 h. Exit 3 means no Dropbox folder on this machine; the doc says what to do.
1. Read the `[spx-check]` lines the SessionStart hook printed (Mac: `bash scripts/mac/spx-check.sh` re-runs them;
   cloud: the hook ends with the same kind of lines). Each is `ok` or `MISSING: <the one fix>`.
   A `DS1 Postgres: MISSING` line means neither the home LAN nor Tailscale answered; an `ok (home LAN ...)` line with
   `Tailscale (VPN): off` is healthy, so do not report Tailscale as a problem. A `host mapping: MISSING` line means the private
   file `~/.config/spx-stats/hosts.env` is absent or incomplete: report it with its fix (`zsh scripts/mac/spx-credentials.sh hosts`).
2. Check your own tool list for the four claude.ai connectors (a script cannot see them): tools named like
   `mcp__*Supabase*`, `*Vercel*`, `*Dropbox*`, `*GitHub*` (use ToolSearch if tools are deferred). The claude.ai
   "GitHub Integration" connector gives Claude Code no `mcp__*GitHub*` tools: GitHub is fine when the hook prints
   `gh login: ok`, so do not report GitHub MISSING in that case. For a missing one the
   fix is "claude.ai > Settings > Connectors > <name> > Connect". Without Supabase: no production migrations or loads.
   Without Vercel: deploy with the CLI block in [section 7](#7-deploying).
3. Report everything MISSING to John as `NEED FROM YOU:` with the one fix, then carry on with what works.

Turso: the second database, on its free plan (database `spx-stats`; its URL is private). It holds the admin and bulky tables that no longer fit
on production ([section 8](#8-data-work), "Turso"); the site and the release runner read the environment variables `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN`. Agents never need the token: they test against a local libSQL server in Docker (`ghcr.io/tursodatabase/libsql-server`,
a port in 7740-7749). The Turso connector (or `turso auth login`) is for John's own checks; `spx-check.sh` reports the optional `turso` CLI as info.
Neon: not used by this project; don't ask John to connect it.

**Setting up a machine or a cloud session** (connecting everything, the keychain, the cloud working copy, the session-start hook, the environment variables, rebuilding a wiped Mac): [docs/setup.md](docs/setup.md). Only the coordinating session starts Postgres.

**Is it alive?** Four checks, seconds each:

    pg_isready -h /tmp -p 55432                                      # cloud working copy (machine2: the Docker container)
    cd web && pnpm task                                              # board list (section 5)
    curl -s -o /dev/null -w "%{http_code}\n" https://spxn.com/       # 200
    # Supabase MCP execute_sql, project njpvfrceahkvnrduerkk: select count(*) from core.game

## 5. Tickets

The queue is the spx-stats board on Sumilabu (`api.sumilabu.com`, project key `spx-stats`), the same board UmaKuma and
Itsutsu use. Run from `web/`. It needs Node 22.18 or newer (it runs the `.ts` file directly) and **no** `pnpm install`
(tested). `SUMILABU_BOARD_URL` and `SUMILABU_BOARD_TOKEN` come from the environment and are never written to a file, a
log or a commit.

**Where the board is — and is not.** It lives only on Sumilabu under project key `spx-stats`, reached through
`pnpm task` (or the raw JSON read below). It is **not** a file in this repository and **not** a GitHub Issue or
Project: this repository keeps its Issues and Projects empty on purpose, so an empty issues page is **not**
"no board". To read the unfinished rows without the CLI, make the same request `pnpm task` makes:

    curl -s -H "authorization: Bearer $SUMILABU_BOARD_TOKEN" -H "accept: application/json" \
         "$SUMILABU_BOARD_URL/api/v1/projects/spx-stats/tickets?unfinished=1"

The token comes from the environment, or on a Mac from the keychain item `sumilabu board spx-stats`
(`security find-generic-password -s "sumilabu board spx-stats" -w`); never print it, log it or write it
anywhere. A `200` with a `tickets` array means the board is healthy.

    pnpm task                                                   # list: waiting, in progress, stale holds
    pnpm task add "<title>" --detail "<what and why>" --by "<who>" [--bug|--chore]
    pnpm task claim <id> "<who>"                                # the whole cuid, never a prefix
    pnpm task release <id> --by "<who>"
    pnpm task done <id> --by "<who>" --version "<short commit sha>" [--entry "<deployment id or note>"]
    pnpm task drop <id> --by "<who>"     /     pnpm task reopen <id> --by "<who>"
    pnpm task grade <id> --priority high|normal|low|none --effort small|medium|large|none
    pnpm task edit <id> [--title ".."] [--detail ".." | --append ".."] --by "<who>"   # words only; not on a done ticket
    pnpm task history <id>                                      # every title/detail edit (needs the Sumilabu edit-history release)

- `<id>` is the whole cuid or, once Sumilabu has short ids, `SPX-142`. An older Sumilabu says so plainly and edit/history report "not supported yet".
- Order: file it, claim it, build it, then the coordinating session deploys it and runs `done` (an agent does either only if its brief directs it; section 7). File **before** starting work.
- A title is 8 to 120 characters, detail up to 4000, and every write names an actor (`--by`, or the name after `claim`).
- A hold lasts six hours and a live hold is not taken over; a lapsed one shows as "stale hold" and `claim` takes it.
- `done` is the only way to finish a ticket. If you stop, `release` it.
- `/tickets` on the site is a read-only view of the board. It answers 404 unless `TICKETS_PAGE=1`, which must never be
  set in production (the board has no read-only key and tickets may hold internal notes).

**The board works** (checked 2026-10-11: the `spx-stats` key returns 200 from John's Mac and from the cloud
environment). The first eight tickets are filed; list them with `pnpm task`. A ticket's kind defaults to feature; the
CLI has no `--kind` option, only `--bug` and `--chore`.

If `pnpm task` says "Sumilabu refused the board key" (401), do not retry in a loop. The cause is usually Sumilabu not
redeployed after `BOARD_TOKENS_JSON` changed: that variable is write-only, saving replaces the whole map, and a
prebuilt Vercel deployment ignores new env vars. Sumilabu deploys through GitHub Actions (workflow
`vercel-deploy.yml`), so John re-runs it; the command and the map rebuild script are in the private file. Tell the
coordinating session, put the ticket in a new create-only Dropbox file
`/Backups/spx-stats/tickets-pending-<date>-<letter>.md`, and carry on.

## 6. Doing the work

    git worktree add ../<name> -b work/<name> origin/main     # or use your harness's worktree
    cd web && pnpm install --frozen-lockfile                  # about 10 seconds (tested)
    pnpm dev                                                  # http://localhost:7701, no .env needed

This project owns local ports **7700-7799** (John's port table; it moved here from 3100-3199 on 2026-10-15). Check `lsof -iTCP:<port> -sTCP:LISTEN` first. Never 3000-3099 or
another project's block; give every server and headless-browser base URL an explicit port. The map:

- 7700: the always-on DS1 preview site (`ds1-preview.sh --install`), real Google sign-in. **A deliberate fixed port**: the Google OAuth client allows only `http://localhost:7700` and its callback `http://localhost:7700/api/auth/callback/google`, so it cannot move
- 7701: `pnpm dev`
- 7702-7749: worktrees, agents' test servers, scratch databases (`ds1-preview.sh` on demand takes 7702-7729 for the site, 7730-7749 for its PostgREST)
- 7750: the always-on preview's PostgREST (was 3180)
- 7790: the temporary PostgREST of `deploy-prebuilt.sh` (was 3190)
- everything else: free
Several sessions run servers in this block at once: stop only your own server by its PID (`kill <pid>`), never
`pkill -f next-server` or any other pattern kill.

No `.env` is needed: the defaults point at the live Supabase project's public read-only key.

**`pnpm build` with no settings reads production** (a parallel build stalled it on 2026-10-14): one at a time, never two at once.

**Local preview on DS1 data and signing in** (`bash scripts/mac/ds1-preview.sh`, the always-on site on 7700, "Sign in (this Mac)", dev sign-in for an agent's own `next dev`): [docs/local-preview.md](docs/local-preview.md).

**Checks before every push**, in `web/`, in this order (all tested green, about two minutes in total):

    pnpm lint
    pnpm exec next typegen        # first on a fresh checkout
    pnpm exec tsc --noEmit
    pnpm build
    pnpm test:routing             # when you touch a page, a query parameter or next.config.ts (section 9, "Kept pages")

From the repo root, also: `bash scripts/check_private_hosts.sh` (fails on a private-range address, a machine or NAS name, or a home path
in any file; section 1, "Machines are named by role") and, when you touch `scripts/mac` or the host mapping, `bash scripts/mac/test/hosts-test.sh`.

On a fresh checkout `tsc` fails with "Cannot find name 'PageProps'" until `next typegen` (or a build or dev run) has
generated the route types. That is not a bug in your change.

**Release.** A release is a commit on `main` that is deployed. What you pass to `pnpm task done --version` is the short
commit sha. The site version is `version` in `web/package.json` (semantic versioning, starting from 0.47.0); the site
footer shows it with the short commit sha and links to the public `/releases` page. That page's list is `web/src/lib/siteReleases.ts`:
 add one row (version, bump date, short sha, plain-language title and text, English only) with every version bump; `pnpm test:siteversions` checks it.

- **Major:** a breaking change to the site or its data contract.
- **Minor:** each feature a reader sees, including a new league or a new source of data shown on the site.
- **Patch:** fixes and data-only corrections.
- Tooling, docs and ops work (board, Dropbox, Mac setup, agent instructions): patch, or no bump when the site is unchanged.

**Commit and push.** Keep each change small, one feature to a commit.

    git add <files by name>
    git -c user.name="John Morris" -c user.email="john@johnmorris.ca" commit -m "feat(area): what it does"   # subject <= 50
    git fetch origin && git rebase origin/main     # then recheck: lint, typegen, tsc, build if main moved
    git push origin HEAD:main                      # fast-forward only; never force

A push to `main` deploys nothing.

## 7. Deploying

The coordinating session deploys a finished feature and runs `done`. An agent deploys, or marks a ticket done, only when the coordinating session's brief directs it to; then it uses the commands in [docs/deploying.md](docs/deploying.md). Deploy only
a commit that is on `origin/main` and passed the checks above; a deployment carries everything on `main`, not just
your commit. Deploy a clean copy of the commit, never the working checkout (worktrees and other agents' files would be uploaded).

Every deploy path ends with the sign-in guard: `bash scripts/mac/check-live-auth.sh`. If it fails, roll back and tell John; never mark the ticket done while it fails. If a deploy is refused, stop and report the exact command to the coordinating session; never edit permission settings yourself.

[docs/deploying.md](docs/deploying.md) has the rest: the normal path (`bash scripts/deploy.sh`), building against DS1 and deploying prebuilt, the Vercel connector and CLI routes, confirming READY, the sign-in guard in full, the checks after a deploy and rolling back.

## 8. Data work

The short, plain-language version of this section is [`docs/data-flow.md`](docs/data-flow.md).

**Where data lives.**

- **DS1** (Postgres in Docker on nas1, reached on the home LAN or over the VPN; the addresses are in the private host mapping, `scripts/mac/lib/hosts.sh`) is the
  permanent **source of truth**: all `legacy_*` schemas, `legacy_files.raw_archive`, `core`, `meta`, `ref`, `api`.
- **Dropbox** `/Backups/spx-stats/raw/<source>/<year or date>/` holds a hard copy of every raw download.
  John's reference images go in `/Projects/Resources/<project>/<topic>/` (Mac: `~/Library/CloudStorage/Dropbox/Projects/Resources/`), not in the repo.
- **Production** is Supabase project `njpvfrceahkvnrduerkk`: a published subset (schemas meta, ref, core and api only;
  no `legacy_*`), changed only by approved data releases (item 5). It is on a 500 MB plan and held 347 MB on 2026-10-11. Read it any time
  with the Supabase MCP `execute_sql` (tested).
- **Production holds a filtered copy of `core.external_id`: no `entity_kind = 'game'` rows** (437k rows, about 80 MB with indexes,
  which nothing on the site reads; the Supabase Free cap is 500 MB). DS1 keeps them all. The rule is `PUBLISH_FILTER` in
  `scripts/sync/compare.py`, applied to the DS1 side of every release comparison, apply, verification and drift check, so
  "production equals DS1" means "equals DS1 filtered" (`scripts/release/README.md`). Add a table there only if nothing reads it.
- Any other Postgres (the cloud session's port 55432, the machine2 Docker container in item 8) is a temporary
  **working copy**. Its work counts only once it is on DS1.
- Order: download, archive row and `legacy_<source>` load on DS1, Dropbox copy, `core` build, counts checked on DS1,
  then a data release to production.
**Read [docs/data-sources.md](docs/data-sources.md) before you load or change a dataset.** It has one entry for each: ongoing scores, the harvest job, venue names and facts, club rosters, NBA and NFL player statistics, the NFL from 1920 with the AFL and AAFC, the NHL's rival and predecessor leagues, college football, CFL club leaders, MLB's rival and predecessor leagues, minor-league hockey (AHL, ECHL).

- **The rule: DS1 first, then production.** Production is a copy of DS1 and never holds a row DS1 lacks. The nightly
  drift check (item 5) compares them by primary key and row hash; `scripts/sync/compare.py` (see `scripts/sync/README.md`)
  is the same comparison by hand. Rows found only in production are removed only by a release John approved.

**For agents:** never write production or DS1 yourself ([who may change what](#who-may-change-what-every-agent-every-subagent)). Write data to your own local copy and hand the coordinating session the DS1
steps (SQL files under `db/`). The coordinating session applies them with `bash scripts/mac/ds1-apply.sh <file> [--dry-run]`
(only files under `db/`), then prepares a data release that John approves at `/admin/data`. A schema migration still needs
applying to production (item 4) before the release that fills it. DS1 has the nologin roles `anon` and `authenticated`, so
migrations with grants apply unchanged.

**Schemas:** `legacy_*` raw, one per source; `core` the curated history; `meta` sources, verification, data issues;
`ref` sports, leagues, countries; `api` read-only views served by PostgREST (`api.refresh()` refreshes the
materialised ones, including `api.player_index`, the players list; `db/build/190_player_index.sql` refreshes it after a
core rebuild; the release runner runs `select api.refresh();` after each release).

**Read [docs/data-work.md](docs/data-work.md) before you write a migration, a build step, a loader or a view, or touch a release.** Short forms, with the same numbers that comments across the repository cite as "section 8, item N":

1. **Archive first.** Every raw download goes into DS1's `legacy_files.raw_archive` and a hard copy to Dropbox, both before anything is loaded to production.
2. **Load season by season** (or award by award) into a `legacy_<source>` schema with a script under `scripts/<source>/`. Raw is kept as it came.
3. **Build `core`** from raw with rerunnable steps in `db/build/NNN_*.sql`, matched by stable keys. Every enrichment is a build step, never a one-off update. Unfinished steps go in `db/build/pending/`. Never run `build_core.sh` while another agent is loading.
4. **Migrations:** `db/migrations/NNN_name.sql`, the next free number after `git fetch && git rebase origin/main`; `scripts/check_migration_numbers.sh` must pass before push. On the working copy, then DS1, then production, before any load.
5. **Production changes only through data releases.** Prepare from DS1, John approves at `/admin/data`, the runner applies. Never approve a release yourself, and never load, update or delete production by hand. Never `truncate`, never `load.py --replace`, never a full load. A nightly drift check compares every table and proposes a fix release; it never approves anything.
6. **After every release** the runner verifies, refreshes `api`, re-compares and refreshes the changed pages; look at one affected page on spxn.com.
7. **Season notes** live in `core.season_note` (`db/seed/season_note.csv`). **A load of new seasons is not done** until the after-load steps have run on DS1 and its report names each one: the list is in this item of the doc.
8. **DS1 is permanent; cloud and Mac copies are temporary.** Work on a copy counts only once it is on DS1. Never apply anything over an existing DS1 database without asking John. The commands for applying to DS1 and for machine2's Docker copy are in this item of the doc.

**Materialized views never block reads.** Every `api` materialized view has a unique index on its natural key, created in the same migration. Refresh only with `concurrently` or through `api.refresh()`. To change a materialized view's definition, build `<name>_new` beside it and swap with `api.swap_matview`, never `drop` + `create` in place, and never `drop ... cascade` on an `api` view: packed views hang on the views they read. No `api` view or function that is in production reads `core.external_id` (production holds a filtered copy and a build from DS1 applies no filter); if a view ever reads it, filter it in the view or add the same condition to the build ([docs/deploying.md](docs/deploying.md)).

**Turso** holds the admin and bulky tables that no longer fit on production (`TABLES` in `scripts/release/turso.py`), plus the run log and the admin alerts. `release.py` publishes those tables to Turso and never to production, and one release goes to one place. The site reads them through `web/src/lib/turso`. Every automated job and every deploy, release step, approval and `ds1-apply` writes one run-log entry through `scripts/runlog/runlog.py`.

Ask John before deleting or overwriting data. Production changes only through approved data releases; anything else needs John's OK.

## 9. The website

- **`web/`** is the site: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zod 4, d3, pnpm.
  - Read `web/node_modules/next/dist/docs/` before writing Next.js code: this version differs from older ones.
  - Data comes from PostgREST (`Accept-Profile: api`) through server fetches with `next: { revalidate: REVALIDATE }` (one day, 86400; every fetch carries cache tags, `lib/api/tags.ts`),
    validated with Zod. A failed fetch shows an inline "Couldn't load" message, except a read the database could not answer (5xx, timeout, network), which makes the page throw in production so Next keeps the last good copy (`lib/api/failure.ts`, `pnpm test:failure`).
- **Read [docs/site-rules.md](docs/site-rules.md) before you add or change a page, a component that draws data, a query parameter or a server fetch.** Short forms:
  - **Kept pages (no server work per view).** Every public page is static and kept a day (`revalidate = 86400`, a literal in each segment). A page that reads `searchParams` lives in `app/[locale]/q` with a thin twin in `s/`; one that reads none lives in `s/` with a twin in `q/`. A page in `s/` uses no `cookies()`, `headers()`, `searchParams` or `useSearchParams` outside a `<Suspense>` of its own and nothing from the browser's address at render. A new query parameter goes into `QUERY_KEYS` (`routing.ts`). `pnpm test:routing`, `pnpm test:revalidate`.
  - **Reads.** Every view the site reads has its unique key in `web/src/lib/api/pagedOrder.ts` (`pnpm test:pagedorder`). Every read of `games` carries a season (`year=eq.`). A new server `fetch` to the database goes through `queuedAtBuild`.
  - **Page weight.** Every public page stays under about 300 KB of HTML (about 50 KB gzipped), measured against the DS1 PostgREST, never production. A long table sends its newest rows and fetches the rest; a section far down loads when the reader gets near it. `pnpm test:weight`.
  - **Page script.** Each kind of page has a budget (`pnpm test:pagescripts`). Client code never imports `DICTIONARIES`; a module a Client Component imports holds no zod schema; nothing imports `next-auth/react` at the top of a file the header loads; a dialog's content is a dynamic import; a chart with more than a few hundred marks draws paths, not elements.
  - **Server calls.** Each request through the proxy is a billed function run, and each kind of page has a budget (`pnpm test:pagecalls`). No `<Link>` fetches on load: never write `prefetch` or `prefetch={true}`. A new picture route is left out of the proxy matcher and exempt in the gate only if it holds no data.
  - **The site is invite only while closed:** `src/proxy.ts` gates every request, so a new route that must stay reachable goes on the gate's list (`lib/invite`, `pnpm test:invite`).
  - **Times on admin pages** are drawn with `<LocalTime>` or `mark()`; never write "UTC" after a time by hand.
  - **Positions** are drawn only through `positionBook()`; **left and right** are decided only in `web/src/lib/sides.ts`, so never order two teams by hand.
- **Read the entry in [docs/site-features.md](docs/site-features.md) before you change or copy a feature:** John's packages (Chizu, Hata, address-plus, Kuni, taisen-brackets, dougu-sports), list APIs, the teams list, one record per person, cities, where the players come from, a game's page, the plays on a game's field, a player's spray charts, the invite-only gate, the player page's statistics board, a World Cup year's teams, venue addresses, logos (logo fit, logos Wikidata lacks, the site's own small copies, the local library), the SPXIS marks.

- **`site/`** is the retired plain-JS site; don't add to it.
- **Languages:** EN, FR and JA through `web/src/lib/i18n` (`say('key')`, `currentSpeaker()` / `useSpeaker()`, cookie
  `spxn-locale`).
  - **Language work is batch-only (John, 2026-10-18).** Translating, drafting and reviewing text in Japanese, German, Spanish and
    French for this project is done ONLY through the Anthropic Message Batches API with `scripts/i18n/batch.py`
    ([`scripts/i18n/README.md`](scripts/i18n/README.md)), never by an interactive agent or reviewer; the interactive
    french-reviewer and japanese-reviewer agents are not used for spx-stats text. Tradeoff: results arrive within hours (a batch ends
    within 24 h, usually under one), so UI strings ship a batch later. A batch costs half the normal price and `submit` stops above a
    USD 10 cap on the worst-case estimate. The API key comes from `ANTHROPIC_API_KEY` or the keychain item `spx-stats ANTHROPIC_API_KEY`,
    never printed, logged or committed. The site ships EN, FR and JA; DE and ES are supported by the tool, not yet site languages.
  - New UI text goes into `web/src/lib/i18n/phrases.constants.ts` in English only; a key a dictionary lacks shows the English. Its FR and
    JA entries are added from a batch result (`scripts/i18n/README.md`), not written by hand or by an agent. Note doubts in
    `web/I18N_TODO.md`. Translated text is never a source of facts.
  - Proper names (teams, players, venues, award names, league codes) are not translated.
- **Selections live in the URL,** with RESTful paths and query params such as `?sort=col.dir`, `?phase=`, `?loc=`,
  `?month=`, `?view=`, `?date=`.
- **Shared components:**
  - `Flag` (`components/Flag.tsx`, over `FlagIcon`) for every country flag: one fixed 24x16 box, styled nowhere else (`scripts/flags.test.ts` checks it in a browser).
  - `SortTable` for every table.
  - `NoSeason` (grey box, compact "–") for years with no games.
  - `DatePicker` for date choices.
- Never build a public endpoint that runs SQL.

## 10. Git

- Commit as **John Morris <john@johnmorris.ca>** (GitHub user johnmorrisdotca; John's choice 2026-10-16, replaces john@spxis.com), Conventional Commits, subject 50 characters or less.
- **No AI attribution anywhere:** no Co-Authored-By, no "Generated with", no session links, nothing in code
  comments or docs. This overrides any tool's default attribution.
- Add files by name, never `git add -A`.
- Push fast-forward only: fetch, rebase onto `origin/main`, recheck, push.
- Several agents work at once and sharing one checkout has left overlapping uncommitted edits. One agent, one
  worktree; keep changes small; never edit another agent's files.

## 11. Safety

- The repository is **public**. Never commit database dumps, member data, secrets, private notes or internal reviews.
- Never write a real IP address, host name, machine or NAS model name, platform admin tool, NAS login or home path into a file, commit, ticket or
  comment: use machine1, machine2, nas1, nas2 and the `NAS1_*` / `MACHINE*_` names; the values live in `~/.config/spx-stats/hosts.env`
  (`scripts/mac/lib/hosts.sh`). `scripts/check_private_hosts.sh` enforces it. Tests use documentation addresses (192.0.2.x, 198.51.100.x).
- Never print or store passwords or tokens in files, logs or commits. Delete any credential file after use.
- Do not open credential files kept in Dropbox in plain text; fetch values with the keychain commands in the private
  file instead.
- Ask John before deleting or overwriting data. Production changes only through approved data releases; anything else needs John's OK.

## 12. Secrets and the environment

Names only. Values are never in this repository, in a log or in a message. Where each value lives and the one command
that fetches it are in the private file. John keeps one unlocked private note called `spx-stats env` (a locked note cannot
be read by `scripts/mac/spx-note-copy.sh`, which copies the whole note to the clipboard) and pastes it into the cloud
environment's settings. Do not ask John to dig for a value: give him the one command.

The template for that note, the two credentials that need a browser the first time and the checklist for a new cloud agent are in [docs/setup.md](docs/setup.md).
