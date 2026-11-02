---
name: ticket-status
description: Show John the status of every ticket board (open, in progress, done in 7 days per board and project, stale holds, releases waiting for him). Use when John asks for ticket status, what is open, who holds what, or what is waiting for a release.
---

# ticket-status

Run this and show its output as it is. Do not summarise or reformat it.

    cd ~/Projects/spx-stats/web && pnpm task status

- `--json` gives the same numbers for a tool.
- A board with no key on this machine prints "no key on this machine"; that is normal. Keys are never printed.
- Full rules: [AGENTS.md section 5](../../../AGENTS.md#5-tickets).
