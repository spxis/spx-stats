---
name: spx-builder
description: Rules and routine for any agent working on a spx-stats ticket (code, docs, data prep, site). Use at the start of every spx-stats task, before editing, and again before finishing to commit, hand off and read replies. Do not use for a coordinating-session deploy or a data release.
---

# spx-builder: working on an spx-stats ticket

Full rules: [AGENTS.md §1](../../../AGENTS.md#1-rules-in-one-breath), [§6](../../../AGENTS.md#6-doing-the-work), [§10](../../../AGENTS.md#10-git),
and [docs/agent-quickstart.md](../../../docs/agent-quickstart.md). This skill is the short routine. If it disagrees with AGENTS.md, AGENTS.md wins.

## Never (every agent, every subagent)

- Write DS1 or production: no psql writes, no `ds1-apply.sh`, no migration applied, no `build_core.sh` against DS1, no loader that archives or loads,
  no `release.py`, no `deploy.sh`, no Vercel deploy. Read DS1 only through the preview PostgREST `http://127.0.0.1:7750/`.
  [who may change what](../../../AGENTS.md#who-may-change-what-every-agent-every-subagent)
- Mark a ticket `done`. Release a hold you will not finish instead.
- Open an issue, PR, discussion, release or comment on GitHub. Push to `main` only.
- Write a real host, address, NAS or machine model, login, home path, secret or member data into any file, commit or hand-off.
  Run `bash scripts/check_private_hosts.sh` before each push.
- Edit `.claude/settings.json` or any permission file.
- Use `git add -A`, `-u` or `.`. Use bare `git stash`.

## Start

1. Identify yourself: a subagent writes `subagent of <name>, ticket <id> (title)` at the start of every report.
2. Read the ticket: `cd web && pnpm task` (board on Sumilabu, not GitHub). Work only on the ticket you were given.
3. Fresh worktree from the latest main, never the checkout you were given: `git fetch origin && git worktree add ~/Projects/worktrees/spx-stats/<name> -b <type>/<slug> origin/main`
   (type `feat|fix|refactor|chore|docs|test`, ASCII slug). [§6](../../../AGENTS.md#6-doing-the-work)
4. Check replies: `python3 -I scripts/handoff/handoff.py replies`. Act on `failed`, `needs-change`, `blocked`, then `handoff.py read <id>`.
5. Coordination: `python3 -I scripts/handoff/coord.py start --as <your name>` (roles, freeze, inbox).
   Before any DS1 or release step: `coord.py freeze show --as <you>`.

## Work

- Ports: this project owns 7700-7799 only. Check with `lsof -iTCP:<port> -sTCP:LISTEN`. Dev server 7701 or a worktree port 7702-7749.
  Scratch Postgres in 7740-7749, removed by name. Stop only your own server by PID, never `pkill`.
- Next.js writes `web/AGENTS.md` and may edit `tsconfig.json` on `next dev`. Delete it and revert the edit before commit. Never commit either.
- Agent model: Haiku by default; Sonnet only for large code or data work; run 1 or 2 agents at a time (John, 2026-10-26). [§2](../../../AGENTS.md#2-talking-to-john)
- Minimal diffs: no formatter noise on lines you did not touch. Minimal comments: no ticket ids or PR numbers in code.
- Names: check a table, view or function name is free in `db/migrations` and on DS1 (read-only) before creating it.

## Checks before push (in `web/`, in order)

    pnpm lint
    pnpm exec next typegen        # first on a fresh checkout
    pnpm exec tsc --noEmit
    pnpm build
    pnpm test:routing             # when you touch a page, a query key or next.config.ts

From the repo root: `bash scripts/check_private_hosts.sh`, and `bash scripts/mac/test/hosts-test.sh` when you touch `scripts/mac`.
Data-only work: `bash scripts/check_migration_numbers.sh` before push when you add a migration.

## Commit and push

    git add <file> <file>                                   # by name
    git -c user.name="John Morris" -c user.email="john@johnmorris.ca" commit -m "feat(area): what it does"   # subject 50 or fewer
    git fetch origin && git rebase origin/main              # recheck if main moved
    git push origin HEAD:main                               # fast-forward only, never force

No AI names, no co-author lines, no "generated with" line anywhere (commits, PRs, code, docs). A push to main deploys nothing.

## Hand-off and reply (end of ticket)

1. Push first (`scripts/deploy.sh` refuses commits not on origin/main).
2. Write the JSON (format and samples: [scripts/handoff/README.md](../../../scripts/handoff/README.md)):
   `python3 -I scripts/handoff/handoff.py check my.json` then `python3 -I scripts/handoff/handoff.py write my.json`.
   Status `ready` for code, `blocked` or `needs-decision` otherwise. Docs-only: `kind` tooling, `site_only` false, no steps.
3. Post a milestone: `coord.py log --as <you> --kind handoff --ticket <id> --text "..."`.
4. Release a hold you will not finish: `pnpm task release <id> --by "<who>"` (from `web/`).
5. End the report with `HAND-OFF WRITTEN: <path>`, your name and the ticket.

Data steps for the coordinating session go in the hand-off's `ds1_steps` and in a `FOR THE COORDINATING SESSION:` block.
Ticket-specific routines: [spx-wikipedia-load](../spx-wikipedia-load/SKILL.md), [spx-build-step-ids](../spx-build-step-ids/SKILL.md),
[spx-site-page](../spx-site-page/SKILL.md), [spx-source-tiers](../spx-source-tiers/SKILL.md), [spx-league-family](../spx-league-family/SKILL.md).

## Pitfalls that already broke things

- A subagent ran a migration and the daily job on DS1 itself; the prepared release then failed. Hand it off instead.
- A rerun renumbered game, series and venue ids. Check ids with `db/checks/093` before you hand off a rebuild step.
- Reusing the checkout you were given (it has other agents' edits): always a fresh worktree from origin/main.
- A stale `GH_TOKEN` in the shell breaks `gh`; `unset GH_TOKEN` first.
