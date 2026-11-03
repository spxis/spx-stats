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
meigen 7400-7499, hako-devices 7800-7899, chikyu-earth 8200-8299, wakusei-planets 8300-8399, kazoku-ui 8400-8499; a repo with no block yet asks John for one); check `lsof -iTCP:<port> -sTCP:LISTEN` first, stop only your own processes by PID, never `pkill`.

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

## The must-have list: no first release without it (John, 2026-11-02)

chikyu-earth shipped 0.3.0, 0.4.0 and 0.5.0 with no published demo, no embed page, no documentation site and no guide to using it, and nothing said no: this page had no list of what a package must have, and the release checks only built and tested the code. The list is below; **a package's first release is refused** (by the session that starts the Release workflow) unless every item is there, and a later release is refused if an item has gone. A package that cannot have an item says so in `package.json`, with the reason, and a reviewer reads it (`"family": { "notApplicable": { "angular": "a data package: there is no element to put in a template" } }`).

| Item | What it is |
|---|---|
| A demo on GitHub Pages | `demo/index.html` made with the family's header (kazoku-ui language picker and theme switch) and footer, published by `.github/workflows/pages.yml` on every push to `main`. Pages switched on for the repo (`gh api -X POST repos/johnmorrisdotca/<repo>/pages -f build_type=workflow`), the URL `https://johnmorrisdotca.github.io/<repo>/` set as the repo's homepage (`gh repo edit ... --homepage`) and as `homepage` in `package.json`, and linked from the README. |
| An embed page | `demo/embed.html`: a page made for an `<iframe>`, drawing what its address says, with nothing else on it. Light by the 3D rules below. |
| A documentation site, English and Japanese | `scripts/docs-site.mjs` (the family's), `docs/site.json`, TSDoc with an `@example` on every export, guides in `docs/guides/` and a Japanese twin of each in `docs/guides/ja/`: one language to a page. |
| The family files, unedited | `scripts/family-template.mjs` (listing the package), `scripts/family-readme.mjs`, `demo/family.css`, and the README's "The family" block. |
| Usage, written and tested | The README or a guide shows, as copy-paste examples: a script tag from a CDN (jsDelivr or unpkg), an ES module import, a bundler (Vite or webpack), React, Vue, Svelte, Angular, an iframe of the embed page, TypeScript types, and Node or a server where it makes sense. Each example is a file in `examples/` that `pnpm test:usage` builds, type-checks or runs against the package as npm packs it, opens in a browser where it has a page, and the guides hold word for word. CI runs it. |
| Current pictures | The README's screenshots are of the demo as it is now. |

**The check.** kazoku-ui's `templates/check-standard.mjs` is copied unchanged into a repo as `scripts/check-standard.mjs`, and a test in the repo (`test/standard.test.ts`, which also holds the file to its recorded hash) fails `pnpm check`, so the release workflow's check fails, when an item is missing. `docs/package-standard.md` in kazoku-ui says how to adopt it. chikyu-earth has every item and is the model: its `examples/`, `scripts/check-usage.ts`, `docs/guides/`, `demo/embed.html`, `.github/workflows/pages.yml`. Adopt the check when a repo is next touched, and fill what it says is missing; each repo's gaps are a ticket on its board.

**The release session checks too.** Before starting a Release, the session reads the package's `node scripts/check-standard.mjs` output (or, for a repo that has not adopted it, the list above against its repo and `https://johnmorrisdotca.github.io/<repo>/`); a missing item is a ticket and no release.

## A drag moves the object with the pointer (John, 2026-11-03)

chikyu-earth 0.9.1 turned the opposite way to the drag (MODULES-200), and the shared drag constants (180 degrees across the width, 60 down the height) moved a globe's ground about 1.5 pixels for each pixel sideways. The rule for every 3D or turnable view, in every package and app:

- **The surface under the pointer follows the pointer**: drag right and it moves right; drag up and it moves up.
- **The arrow keys agree** (Arrow Right moves the surface right, Arrow Up moves it up), and **Auto-turn goes the object's real way** (a globe's surface moves left to right, as the Earth turns west to east).
- **On a globe, or any piece with a known on-screen radius, the touched point stays under the pointer** (exact grab): set `grab-radius` on `<kazoku-view-controls>` (kazoku-ui, after 0.10.1) to the radius in pixels at Fit, or `fit`. The default is unchanged.
- **Every package with a turnable view runs the shared check** in its e2e: kazoku-ui's `templates/e2e-ground.mjs`, copied unchanged as `e2e/ground.mjs` (`checkFollowsTheHand`, `checkExactGrab`). The sign is fixed in the package's drawing, never in the controls. The rule, the option and the helper are in kazoku-ui's `docs/drag-rule.md`.
- A package that fails the check gets a ticket on its board that says which part fails.

## No 3D release without a freeze test (CRITICAL, John 2026-11-02)

A test run on machine1 panicked the kernel in the graphics driver (Chrome's GPU process, 2026-11-02). It must not happen again. Every package and app with **live 3D (WebGL)** has both of these, and its release does not go out without them. CSS 3D transforms and SVG are not WebGL and need neither.

1. **A freeze test in its release**: `e2e/freeze.demo.*` and a `pnpm test:freeze` script, run by CI and by the release (the repo's `release.yml` passes `freeze-command: pnpm test:freeze` to kazoku-ui's `reusable-release.yml`, 0.9.1 and later). It plays the page and fails on: more than one animation frame asked for at a time, a draw when nothing moves or the view is out of sight, **live** WebGL contexts or GPU objects (buffers, vertex arrays, textures, programs) that grow over a run of changes (count live ones: a context let go takes what it held with it), and a canvas past 6 million pixels or 4096 a side on a 5K screen at a pixel ratio of 2. Copy `e2e/freeze.demo.ts` from uchusen-rockets or hako-devices, or `e2e/freeze.demo.mjs` from senshu-jerseys; kazoku-ui's `/testing` kit has the counters.
2. **Tests draw in software, never on the machine's graphics card.** Every Chromium project in `playwright.config` has `launchOptions: { args: [...SOFTWARE_GL_ARGS] }` (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; kazoku-ui's `/testing` exports it). WebKit has no software switch: off CI its projects skip (`testIgnore`) the pages that draw WebGL, and CI plays them. One headless browser at a time on a Mac, closed when finished; never leave a browser or dev server running; never open Chrome with dozens of tabs on a WebGL demo.

Who has live WebGL (swept 2026-11-02 on origin/main): hako-devices and uchusen-rockets (both done), senshu-jerseys (the judogi designer: done in 0.33.3), kazoku-ui (the shared renderer: done in 0.9.1), hotaru (its own ticket) and chikyu-earth (on machine2). fuda-cards has no WebGL. A new package that adds WebGL adds the freeze test in the same change.

## No long pages of fold-open sections (John, 2026-11-02)

John: "I hate having to scroll all the way down to see stuff." In every package demo, docs site and app (spxn.com, hotaru included), a stack or loop of sections that fold open and are scrolled through to find things is not allowed. How to choose and show options instead:

- **Clicks in a row**: kind, then family, then model; the chosen thing and its options sit on one screen. A tile or chip row, a segmented picker or a small grid.
- **Tabs**, a **grid** of pictures, or a **search box** with the matches below it, for a long list.
- Where two packages need the same picker, it is a `kazoku-ui` part (a ticket on that board), not a copy.
- Allowed: **one** small "More options" fold, or one "The call that draws it" / "Show table" fold beside the demo it explains, closed by default. Not allowed: several folds stacked in one panel, a fold per item in a list, a fold open by default that pushes the demo down, or a gallery built from folds by script (a `details` element is not the only way: check `aria-expanded` and hand-built toggles too).
- A page that has a gallery of many items shows a grid you can see at once, with the selected item big beside or above it.

Sweep and file: when you touch a demo or site page, count its folds first. A page with the pattern gets a ticket on its project's board (one per page, naming the file), or you fix it when it is small and you own the repo that session. Check with `git grep -nE "<details|createElement\(.details|aria-expanded" origin/main -- demo site docs`.

## Checks, push, release

1. All green locally before every push: `pnpm check` (which includes the must-have check), `pnpm test:readme`, `pnpm test:usage` (every way to use the package), the demo e2e (in kyogijo: `pnpm test:demo`), and the freeze test where the package has live 3D (`pnpm test:freeze`).
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

GitHub issues, pull requests, discussions or comments (the `gh` login is John's own account; a publish's automatic Release page is fine); DS1, production or Supabase; AI
attribution anywhere (commits as John Morris <john@johnmorris.ca>, Conventional Commits, subject 50 characters or less,
files by name); anything that bills. If you get stuck, blocked or stop, say so at once with your name and the ticket.
