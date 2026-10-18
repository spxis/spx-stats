# Language work: batch only

Translating, drafting and reviewing text in **Japanese, German, Spanish and French** for spx-stats is done only through
Anthropic's Message Batches API, with `scripts/i18n/batch.py`. Not by interactive agents, not by the interactive
`french-reviewer` or `japanese-reviewer` agents (John, 2026-10-18).

- **Tradeoff.** A batch ends within 24 hours, usually under one. A UI string added in English ships a batch later; until its
  translation lands, the site shows the English (a key a dictionary lacks falls back to English).
- **Price.** Batches cost 50% less than normal use (Sonnet 5.5: $1 in / $5 out per million tokens). The prompt's rules and glossary
  are one system block with a 1-hour cache, identical in every request.
- **Cap.** `submit` refuses unless the **worst-case** estimate (every request fills `max_tokens`, every request writes the cache at
  twice the input price) is under USD 10. `--cap` raises it, only by the person who accepts the cost. `build` prints and saves the
  estimate and submits nothing.
- **Key.** `ANTHROPIC_API_KEY` in the environment, or the keychain item `spx-stats ANTHROPIC_API_KEY` (read in-process with
  `--keychain`, never printed). Never in a file, a log, a ticket or a commit.
- **Results** are kept by Anthropic for 29 days: `fetch` saves them at once. Results come back in any order; they are matched on
  `custom_id` (letters, digits, `_`, `-`, up to 64; here `<lang>-<source>-<number>`, e.g. `fr-ph-0001`). A dotted phrase key
  cannot be a `custom_id`, so a request holds up to 20 phrases and `manifest.json` maps each phrase's number in the request to its key.
- **Never a source of facts.** A translation only carries the English across. Names (teams, players, venues, cities in club names),
  league codes and award names stay untranslated (AGENTS.md section 9); `{placeholders}` and markup are kept exactly.
- **Languages.** The site ships EN, FR (Canadian French) and JA. DE and ES are supported by the tool (drafting, since nothing exists
  yet) but are not site languages. Every Japanese item carries a literal English back-translation, because John does not read Japanese.

## Commands

Run from anywhere (`python3 /path/to/scripts/i18n/batch.py ...`). Needs Node 22.18+ (`dump.ts` reads the phrase tables) and no pip package:
plain `urllib`, no `anthropic` SDK. Work files go to `~/Projects/backups/spx-stats/i18n-batch/<date>/`, outside the repository.

    batch.py build  [--lang fr,ja] [--only phrases,seeds] [--exact]   # requests.jsonl, estimate; submits nothing
    batch.py check                                                    # one tiny normal Messages call: model id and request shape
    batch.py submit [--cap 10]                                        # saves batch.json (the batch id)
    batch.py status
    batch.py fetch                                                    # results.jsonl, matched on custom_id
    batch.py report                                                   # report.md and report.json
    batch.py run --keychain                                           # check, build, submit, wait, fetch, report

`build --lang fr,ja` reviews what exists: every phrase of `phrases.constants.ts` against `dictionaries/fr.constants.ts` and
`ja.constants.ts`, the French and Japanese columns of `db/seed/season_note.csv`, `season_outage.csv` and `title_not_awarded.csv`, the
French city and metro names, and the national-team names in `web/src/lib/soccerNames.ts`. `--lang de,es` drafts from the English.
Each item comes back as JSON: `verdict` (`ok`, `fix` or `doubt`), a literal English back-translation, a proposed fix and a one-line
reason. `report` also checks placeholders itself. The report is a local file: it is not committed (public repository, no internal reviews).

Applying a fix is a separate, small commit to the dictionaries after John agrees; run the AGENTS.md section 6 checks first. Use `check` before the first batch of a new prompt: it is the only real-request validation of the shape.
