# Working on John's npm packages

For every agent (subagent, machine2, Grok, GPT) that builds in one of John's package repos: dougu-sports, kyogijo-stadiums,
meigen-sports, senshu-jerseys, taisen-brackets, hata and the rest. Their tickets live on the spx-stats board. Read
[AGENTS.md](../AGENTS.md) first (its "Who may change what" applies here too), then this page. A prompt for a package
agent can then be short: who you are, the ticket ids, and "follow docs/package-work.md".

## Start of every session

    cd ~/Projects/spx-stats && git pull --ff-only
    python3 -I scripts/handoff/coord.py start --as <you>        # machine2, grok, ...
    python3 -I scripts/handoff/coord.py inbox --as <you>
    python3 -I scripts/handoff/handoff.py replies

Board: `cd ~/Projects/spx-stats/web && pnpm task`. Claim with `pnpm task claim <id> "<actor>"` (actors are machine or person
names: "Mac Studio", "MacBook", "John Morris"; never an AI name). Read the ticket's full detail before starting. Never run
`pnpm task done`: the coordinating session closes tickets.

## One agent per repo

Only one agent works in a package repo at a time. Work in a new git worktree from `origin/main`
(`~/Projects/<repo>-worktrees/<name>`), never in the main checkout (some are stale), never in another agent's worktree.
Ports: only the repo's block in John's port table (dougu 7200-7299, kyogijo 6900-6999, senshu 7300-7399, taisen 7100-7199,
meigen 7400-7499); check `lsof -iTCP:<port> -sTCP:LISTEN` first, stop only your own processes by PID, never `pkill`.

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

## Checks, push, release

1. All green locally before every push: `pnpm check`, `pnpm test:readme`, the demo e2e (in kyogijo: `pnpm test:demo`).
2. Fetch and rebase on `origin/main`, push fast-forward to `main`. A push starts CI (kyogijo: about 16 minutes).
3. Make a release commit: bump `package.json` (and `src/version.ts` where it exists) from the highest tag, regenerate
   version-dependent fixtures and snapshots, move the CHANGELOG's Unreleased block under the version. Push it.
4. **Do not tag and do not publish.** The coordinating session tags (`v<version>`) when CI on that commit is green; the
   Release workflow publishes to npm by trusted publishing. Never publish from a Mac or with a token.
5. Ask John first for a new package name, a first publish, a major version, a deprecation or a licence change.

## Hand-off (every finished ticket, packages included)

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
