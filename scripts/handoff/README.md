# Hand-offs and replies

An agent that finishes a ticket writes ONE file; `scripts/deploy.sh` (run by John or the coordinating session) does the rest and
answers in a reply file. Nobody relays text between sessions. The files live in Dropbox, never in the repository
(`examples/` here is the only exception).

    Dropbox /Projects/Handoff/<project>/<ticket-id>.json              the hand-off (Mac: ~/Library/CloudStorage/Dropbox/Projects/Handoff/<project>/)
    Dropbox /Projects/Handoff/<project>/replies/<ticket-id>.json      the answer, append-only history
    Dropbox /Projects/Handoff/<project>/replies/read/                 replies the developer agent has handled
    Dropbox /Projects/Handoff/<project>/done/                         finished hand-offs

No secrets, no private host names or addresses, no home paths in either file (`handoff.py` refuses them).

## Writing a hand-off (every agent, at the end of a ticket)

1. Push your commits to `origin/main` first (deploy.sh refuses commits that are not there).
2. Write the JSON ([handoff.schema.json](handoff.schema.json); samples in [examples/](examples/)).
3. `python3 -I scripts/handoff/handoff.py check my.json` then `python3 -I scripts/handoff/handoff.py write my.json`
   (validates, then puts it at `<folder>/<ticket-id>.json`). Cloud session with no Dropbox folder: `check` it, then upload the
   text with the Dropbox connector to `/Projects/Handoff/spx-stats/<ticket-id>.json` (exit code 3 says so).
4. End your report with `HAND-OFF WRITTEN: <path>` and nothing else to relay. Do not run `deploy.sh` yourself unless you are the
   coordinating session: it applies data and deploys.

Fields (all in the schema): `ticket_id`, `title`, `status`, `written_by`, `written_at`, `kind` (`site` | `data` | `package` | `tooling`),
`site_only`, `commits`, `migrations` (file plus the objects it creates: `schema.name`, `function:schema.f(int)`, `column:schema.table.col`),
`turso_tables`, `ds1_steps` (file and the expected row counts, in order), `release_tables`, `release_title`, `deploy_after_release`,
`pages` (paths to check after the deploy), `package` (`name`, `dir` as `~/...`, `tag`), `notes_for_john`, `blocked_reason`, `decision`.

| status | meaning | who sets it |
|---|---|---|
| `ready` | pushed, tested, waiting for deploy.sh | the developer |
| `data-applied-not-released` | DS1 steps done, release prepared, waiting for John's approval at `/admin/data` | deploy.sh (or the developer, when a coordinating session already applied it) |
| `blocked` | cannot go on; `blocked_reason` says why | the developer |
| `needs-decision` | John must pick; `decision` has `question`, `options` (id, label, note) and `recommendation` (an option id) | the developer |
| `deployed`, `released` | done | deploy.sh |
| `failed`, `needs-change` | the developer must act | whoever found it |

deploy.sh acts only on `ready` and `data-applied-not-released`; the others are listed (a decision is printed with its options and
the recommended one).

## Replies (part 2)

`replies/<ticket-id>.json` ([reply.schema.json](reply.schema.json)) has `history`, a list that is only ever appended to. An entry has `at`, `from`,
`status` (`deployed` | `data-applied` | `released` | `failed` | `needs-change` | `blocked`), `detail`, and when known `version`
(short sha), `deployment`, `release`, `checked` (what was verified) and `change_requested`. deploy.sh writes one on every outcome
(success, refusal, failure); a person or the coordinating session can add one with `handoff.py reply`.

**Every agent checks replies at the start of a session and before it finishes**, for its own tickets:

    python3 -I scripts/handoff/handoff.py replies                   # every unread reply
    python3 -I scripts/handoff/handoff.py replies --ticket <id>
    python3 -I scripts/handoff/handoff.py read <id>                  # handled: moves it to replies/read/

Act on `failed`, `needs-change` and `blocked` (fix, push, write the hand-off again with status `ready`). Outside agents John runs
himself read the same folder (or ask him for the file). A later reply continues the history of a reply already moved to `read/`.

## Commands

    handoff.py check FILE...        validate          handoff.py list [--json]        waiting hand-offs
    handoff.py write FILE           validate + put    handoff.py set-status T STATUS  change a status (deploy.sh does it)
    handoff.py reply T --status S --by WHO --detail TEXT [--version SHA] [--deployment X] [--release N] [--checked TEXT]... [--change TEXT]
    handoff.py replies | read T | done T | sql FILE | dir

`ROLES.json` and `FREEZE.json` in the same folder are coordination files, not hand-offs (`handoff.py list` skips them); the channel between sessions
(roles, status, inbox, freeze, journal) is `coord.py`, see [docs/coordination.md](../../docs/coordination.md). Tests: `bash scripts/handoff/test/coord-test.sh`.

Folder override: `SPX_HANDOFF_DIR`. Tests (no network): `bash scripts/handoff/test/handoff-test.sh`.

## deploy.sh

    bash scripts/deploy.sh --dry-run      # changes nothing: lists, runs the read-only checks, shows the ds1-apply dry-run plan
    bash scripts/deploy.sh                # does it; asks y/N before any DS1 write or tag push
    bash scripts/deploy.sh --ticket <id>  # one hand-off          bash scripts/deploy.sh --list   # only list hand-offs and replies

Needs a Mac with `vercel login`, `jq`, the keychain item `spx-stats SUPABASE_ACCESS_TOKEN` (or `SUPABASE_ACCESS_TOKEN`), DS1 for data
steps. Optional keychain items: `spx-stats VERCEL_AUTOMATION_BYPASS_SECRET` (without it the page checks are skipped and the reply says
so; create the secret in the Vercel project's Deployment Protection settings, "Protection Bypass for Automation"),
`spx-stats TURSO_DATABASE_URL` and `spx-stats TURSO_AUTH_TOKEN` (without them Turso tables are not checked and the reply says so).

What it checks before a site deploy, per hand-off: its commits are on `origin/main`; every `migrations[].objects` exists on production
(`to_regclass` / `to_regprocedure` / `information_schema.columns` through the Supabase Management API); every `turso_tables` entry exists.
Anything missing: it refuses with the names, replies `blocked`, and deploys nothing, because a deployment carries all of `main`.
Then: a clean `git archive` of `origin/main` deployed as in AGENTS.md section 7, `check-live-auth.sh`, each `pages` entry (200, no
"Couldn't load"), `task done`, status `deployed`, reply, file to `done/`. Data: `ds1-apply --dry-run` for every step, one y/N, the
steps in order, `release.py prepare --tables ... --ticket ...`; John approves at `/admin/data`; the next run sees the release finish
(`meta.data_release.status`), replies `released`, and deploys when `deploy_after_release` is true. Packages: y/N, then the tag is pushed
(the package's publish workflow does the rest).

Not covered: it never applies a migration to production (that stays a coordinating-session step, AGENTS.md section 8 item 4), never
approves a release, and never rolls back (it prints what failed; section 7 has the rollback).
