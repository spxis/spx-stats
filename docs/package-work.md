# Working on John's npm packages

For every agent (subagent, machine2, Grok, GPT) that builds in one of John's package repos: dougu-sports, kyogijo-stadiums,
meigen-sports, senshu-jerseys, taisen-brackets, hata and the rest. Most of their tickets live on the spx-stats board (see "Boards, filing and reporting"). Read
[AGENTS.md](../AGENTS.md) first (its "Who may change what" applies here too), then this page. A prompt for a package
agent can then be short: who you are, the ticket ids, and "follow docs/package-work.md".

## Start of every session

    cd ~/Projects/spx-stats && git pull --ff-only
    python3 -I scripts/handoff/coord.py start --as <you>        # machine2, grok, ...
    python3 -I scripts/handoff/coord.py inbox --as <you>
    SPX_HANDOFF_PROJECT=<repo> python3 -I scripts/handoff/handoff.py replies   # your package's replies, not spx-stats'

Board: `cd ~/Projects/spx-stats/web && pnpm task`. Claim with `pnpm task claim <id> "<actor>"` (the actor is the machine's
board name from the private START-HERE file, or "John Morris"; never an AI name). Read the ticket's full detail before starting. Never run
`pnpm task done`: the coordinating session closes tickets.

## Boards, filing and reporting

When John asks for ticket status, run `cd ~/Projects/spx-stats/web && pnpm task status` and show its output as it is (every board, stale holds, releases waiting for John).

Every project has exactly one home board. Find yours here before you look for a ticket (the project key is the board's name):

| Project | Board (project key) | Ticket names |
|---|---|---|
| the spxn.com site, data, releases, ops tooling | `spx-stats` | no prefix needed |
| WazaDB (web + API monorepo) | `wazadb` | `wazadb: ...` (its key is not on every machine) |
| hako-devices | `hako-devices` | `HAKO-DEVICES-<n>` |
| hotaru, the box and TV app | `hotaru` | `HOTARU-<n>` |
| kyogijo-stadiums | `kyogijo-stadiums` | `kyogijo-stadiums: ...` |
| senshu-jerseys | `senshu-jerseys` | `senshu-jerseys: ...` |
| kazoku-ui, and chores shared by the whole family | `kazoku-ui` | `kazoku-ui: ...`, or `kazoku-ui: family: ...` |
| every other module or one-off tool: meigen-sports, dougu-sports, uchusen-rockets, fuda-cards, taisen-brackets, chizu, hata, kuni, address-plus, chikyu-earth, meet-prompter | `modules` ("Modules and misc") | `<full npm or repo name>: ...` |

**Filing rule.** A ticket goes to its project's board. On `modules` and `kazoku-ui` the title must start with the project's full npm or repo name and a colon
(`meigen-sports: ...`, `uchusen-rockets: ...`, `fuda-cards: F12 ...`), and the ticket's area is set to the same word (`--area <name>`), so
counts per project stay true. A non-package item uses a clear project word (`family: ...` for work across several packages, `meet-prompter: ...`).
No ticket on a shared board may be without a project prefix. A project that passes 40 tickets, or that John calls major, gets its own board and its tickets move by prefix.
Nothing that is a package goes on `spx-stats`, and no site or data work goes anywhere else.

**Using a board.** `cd ~/Projects/spx-stats/web && pnpm task --board <key> <command>` works on any board whose key is in this Mac's keychain
(`sumilabu board <key>`): `pnpm task --board modules`, `pnpm task --board kyogijo-stadiums claim <id> "<who>"`. Without `--board` it is `spx-stats`.
`pnpm task status` shows every board at once. The hako-devices and hotaru keys are only on machine1 (private START-HERE, "Other boards"); fuda-cards no longer has its own board: its tasks are `fuda-cards: F<n> ...` on `modules`.
If you can't reach a board, ask the session that started you; never guess a ticket.

**Filing a ticket.** File it before you start the work. Do the same for anything you find that is outside your ticket: file it
and name the new id in your report, rather than widening your ticket.

    pnpm task --board <key> add "<npm name>: <what>" --area <npm name> --detail "<what and why, John's words with the date, reference paths>" --by "<actor>" [--bug|--chore]

The title is 8 to 120 characters. The detail says what done looks like. Reference images are linked by their Dropbox path
(`/Projects/Resources/<project>/<topic>/`) and never attached. A gap in a shared kazoku-ui part gets its own `kazoku-ui:` ticket on the `kazoku-ui` board
with the repo and case that found it. Don't work around it in your repo; say in your report that you are blocked on it.

**Reporting.** The first line is `<your name>, ticket <id> (<title>)`, and a subagent writes `subagent of <name>`. Keep the
report under 12 lines: what changed, the shas, CI, the picture path, any decision John must make (with your recommendation),
and new tickets. It ends with `HAND-OFF WRITTEN: <path>`. If you stop for any reason (a usage limit, a question, a failure),
say so at once. Work committed in your worktree is kept, and the session that started you resumes you.

## Shared family parts (kazoku-ui)

`@johnmorrisdotca/kazoku-ui` holds the parts that every family demo shares. Use it; never copy it or write your own.

- `<kazoku-view-controls>` (subpath `/view-controls/define`) turns, tilts, zooms and pans a view, and keeps the view in the
  address. Options include `ignore`, `zoom="fit"`, `anchor`, `key-tilt`, `stop-turn` and `tilt-step`; see its README.
  fuda-cards, senshu-jerseys and chikyu-earth use it, and uchusen-rockets is moving to it.
- Planned parts (SPX-844): the light/dark switch, the language picker, choices kept in the address, and a save-as-image button.
- Add it as a devDependency for a demo. Make it a dependency only when the package's own element imports it, and say so in the
  hand-off. A plain HTML page needs an import map; the kazoku-ui README shows one.
- **Shared release workflow** (kazoku-ui 0.7.2): `reusable-release.yml` does the whole release; a repo's `release.yml` calls it. See
  "Moving a repo to the shared release workflow" below. A repo that has not moved keeps following its own release.yml.
- **AGENTS.md template** (kazoku-ui 0.7.3): `templates/AGENTS.md` in kazoku-ui holds the family rules above a marker and the
  repo's own facts (board, prefix, ports, checks, release, hand-off project) below it; `docs/agents-template.md` there says how to
  adopt it and which repos would. Adopt it when a repo is next touched, not as a sweep.

## One agent per repo

Only one agent works in a package repo at a time. Work in a new git worktree from `origin/main`
(`~/Projects/<repo>-worktrees/<name>`), never in the main checkout (some are stale), never in another agent's worktree.
Ports: only the repo's block in John's port table (dougu 7200-7299, kyogijo 6900-6999, senshu 7300-7399, taisen 7100-7199,
meigen 7400-7499, hako-devices 7800-7899; a repo with no block yet asks John for one); check `lsof -iTCP:<port> -sTCP:LISTEN` first, stop only your own processes by PID, never `pkill`.

## What John expects of the packages

- Draw everything yourself from public facts; cite the facts. Never copy, trace or ship artwork, photos, logos, wordmarks,
  stock icons or a commercial map's 3D. No brand, league, federation or sponsor marks, and no company names in theme or preset
  names (a theme may be similar to a look, with a generic name). Never John's SPX, SPXN or SPXIS marks in an MIT package.
- Data: open sources only, licence checked before use, credited in NOTICE, each licence kept in its own data file (ODbL apart
  from CC0). John's reference images live in Dropbox `/Projects/Resources/<project>/<topic>/`: look only, never commit them.
- Small packages: no new runtime dependency without saying so; bake data at build time; state the bytes a change adds.
- README: opens on the still hero picture; animations lower down, at half speed; in a row or grid only the centre item moves.
  Demos: still until hover or tap, controls on or beside the view and usable while it turns, choices kept in the address,
  the camera kept when the choice changes. Light and dark. A finger-wide hit target (48 px).
- 3D pieces always have a side profile: flat things have thickness, a back face and their attachments from behind.
- Japanese: whatever you write, give the English beside it in your report and hand-off; have it reviewed when you can.
- One feature per release, with a demo link, so John can check it before the next piece of the same package.

## Quality bar (John has rejected work for each of these)

Tests passing is not enough: John judges by looking. Before any push that changes what a person sees:

- **Match a named reference.** Every picture is compared with something real: John's reference photos for the ticket, or the
  package's own best existing piece (dougu's Stanley Cup, senshu's turning jerseys, kyogijo's real venues). If a drawing would
  not pass next to that reference, it is not done. Where no real reference exists, keep the existing generic piece rather than
  inventing one (an honest plain cup beats a made-up trophy).
- **Build on the package's existing method.** A new garment uses the jersey 3D pipeline; a new trophy uses the lathe/emblem
  pipeline; a new venue uses the venue and context pipeline. Never a new flat cut-out beside a 3D family.
- **Look, then fix, in a loop.** Render it, screenshot it (Playwright), view the screenshot next to the reference, fix what
  looks wrong, repeat. Put the final side-by-side screenshots (desk and phone, light and dark) in the hand-off.
- **No browser-default controls in a demo.** Every button, checkbox, radio and select uses the demo's shared style (same font,
  height of at least 48 px, radius and colours as the pill buttons, a clear chosen state, light and dark, wraps on a phone). A
  label is shown once ("Outline", not "Outline / Outline"). Add an e2e check that fails on any visible control left in the
  browser's default style (kyogijo `e2e/controls.demo.mjs` is the pattern).
- **Real proportions and detail, never cartoon.** Soft shading and folds where cloth is drawn, crisp edges, true ratios (a puck
  is 3:1, a floor slab has thickness), nothing that reads as a blob.

## Checks, push, release

1. All green locally before every push: `pnpm check`, `pnpm test:readme`, the demo e2e (in kyogijo: `pnpm test:demo`).
2. Fetch and rebase on `origin/main`, push fast-forward to `main`. A push starts CI (kyogijo: about 16 minutes).
3. Make a release commit: bump `package.json` (and `src/version.ts` where it exists) from the highest tag, regenerate
   version-dependent fixtures and snapshots, move the CHANGELOG's Unreleased block under the version. Push it.
4. **Agents do not tag and do not publish.** When CI on the release commit is green, a coordinating session (machine1 or
   machine2) or John starts the repo's Release workflow (`gh workflow run release.yml -R johnmorrisdotca/<repo> --ref main`);
   it publishes by trusted publishing and tags `v<version>`. Never publish from a Mac or with a token. **Coordinate:** the
   session whose agent wrote the hand-off starts that release (John may start any). Before starting, check that no Release
   run is already going (`gh run list -R johnmorrisdotca/<repo> --workflow release.yml -L 1`) and that the version is not
   on npm yet; right after, log it (`coord.py log --as <you> --kind release --ticket <id> --text "<pkg> <version>"`) so the
   other session does not start a second run.
5. Ask John first for a new package name, a first publish, a major version, a deprecation or a licence change.

## Moving a repo to the shared release workflow

npm trusted publishing accepts a called workflow. Source: https://docs.npmjs.com/trusted-publishers, Troubleshooting (read 2026-11-02):
for `workflow_call`, "validation checks the calling workflow's name instead of the workflow that actually contains the publish
command", and "The `id-token: write` permission must also be given to both parent and child workflows." So the trusted-publisher entry
on npmjs.com keeps naming the repo's own `release.yml` (the caller), never the shared file. It is also proved: kazoku-ui 0.7.2 was
released through it on 2026-11-02 (npm, with provenance).

Do it when the repo is being touched anyway, one agent per repo, and tell John in the hand-off:

1. Keep the file name `release.yml` and replace its steps with the call (pin to a released kazoku-ui tag, not `@main`; a tag exists only after John's release run):

       name: Release
       on: { push: { tags: ["v*"] }, workflow_dispatch: }
       permissions: { contents: write, id-token: write }
       jobs:
         release:
           uses: johnmorrisdotca/kazoku-ui/.github/workflows/reusable-release.yml@v0.7.2
           # with: { check-command: pnpm check, node-version: "24", github-release: true }

2. The repo needs pnpm with a `packageManager` field, and a check script that builds and tests what is published (the default is `pnpm check`).
3. A repo with no trusted-publisher entry yet (fuda-cards) needs John to add it first: workflow filename `release.yml`.
4. Do not run it. John runs the Release workflow; it checks the tag against `package.json`, runs the check, skips a version already on npm,
   tags `v<version>` if missing, and publishes with provenance. Details: kazoku-ui `docs/release-workflow.md`.

## Hand-off (every finished ticket, packages included)

Run the tool with the package's project set (`SPX_HANDOFF_PROJECT=<repo> python3 -I ...`, on the same command line) so the
file lands in Dropbox `/Projects/Handoff/<repo>/` (on a Mac `~/Library/CloudStorage/Dropbox/Projects/Handoff/<repo>/`; replies come back in its `replies/` folder). The id is the ticket's cuid. A board without cuids (hako, hotaru, fuda) uses
a name of 20 to 40 lowercase letters made from the ticket.

Write `<ticket-id>.json` (`kind: "package"`, `status: "ready"`, `written_by`, the commits, the release-commit sha,
`package: {name, dir, tag}`, `notes_for_john`) and run:

    python3 -I scripts/handoff/handoff.py check <file> && python3 -I scripts/handoff/handoff.py write <file>

End your report with `HAND-OFF WRITTEN: <path>`. Format and samples: [scripts/handoff/README.md](../scripts/handoff/README.md).
Before you finish a session, read replies (`handoff.py replies --ticket <id>`), act on `failed`, `needs-change`, `blocked`,
then `handoff.py read <id>`. Questions or blocks: `coord.py post --from <you> --to release-master --subject ".." --body ".."`.
Log milestones with `coord.py log --as <you> --kind commit|handoff|claim|done|blocked --ticket <id> --text ".."`.

## Never

GitHub issues, pull requests, releases or comments (the `gh` login is John's own account); DS1, production or Supabase; AI
attribution anywhere (commits as John Morris <john@johnmorris.ca>, Conventional Commits, subject 50 characters or less,
files by name); anything that bills. If you get stuck, blocked or stop, say so at once with your name and the ticket.
