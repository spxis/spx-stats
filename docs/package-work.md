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

Most packages share the spx-stats board, but not all. Find your package here before you look for a ticket:

| Package | Board | Ticket names |
|---|---|---|
| dougu, kyogijo, meigen, senshu, taisen, hata, chizu, kuni, address-plus, chikyu-earth | spx-stats board (`pnpm task`) | title starts with the full npm name, e.g. `meigen-sports: ...`, `dougu-sports: ...` |
| kazoku-ui, and anything shared by the whole family | spx-stats board | title starts with `kazoku-ui: ...` |
| hako-devices | its own Sumilabu board (project key `hako-devices`) | `HAKO-DEVICES-<n>` |
| uchusen-rockets | the hotaru board | title starts with `Rockets: ...` |
| fuda-cards | `docs/task-board.md` in its own repo | `F<n>`; claim by committing your name on the row |

The commands for the hako-devices and hotaru boards are in the private START-HERE file ("Other boards"). If you can't reach a
board, ask the session that started you; never guess a ticket.

**Filing a ticket.** File it before you start the work. Do the same for anything you find that is outside your ticket: file it
and name the new id in your report, rather than widening your ticket.

    pnpm task add "<npm name>: <what>" --detail "<what and why, John's words with the date, reference paths>" --by "<actor>" [--bug|--chore]

The title is 8 to 120 characters. The detail says what done looks like. Reference images are linked by their Dropbox path
(`/Projects/Resources/<project>/<topic>/`) and never attached. A gap in a shared kazoku-ui part gets its own `kazoku-ui:` ticket
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
- A shared release workflow (SPX-843) and one AGENTS.md template for package repos (SPX-845) are coming. Until then, follow
  each repo's own release.yml and AGENTS.md.

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
4. **Do not tag and do not publish.** When CI on the release commit is green, John runs the repo's Release workflow
   (`gh workflow run release.yml -R johnmorrisdotca/<repo> --ref main`), or the coordinating session pushes the tag `v<version>`.
   The workflow publishes to npm by trusted publishing. Never publish from a Mac or with a token. The one exception is a
   package with no trusted publisher yet (fuda-cards today): John publishes it by hand from a clean copy of the release commit.
5. Ask John first for a new package name, a first publish, a major version, a deprecation or a licence change.

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
