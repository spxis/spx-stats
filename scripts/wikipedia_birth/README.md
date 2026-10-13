# NHL players' birth country

`db/build/187_nhl_birth_country.sql` sets `core.person.birth_country_code` (and the birth city and region when a source gives them)
for NHL players, only where it is empty. Sources, highest first: SPX, Wikidata, English Wikipedia.

1. **SPX**: `legacy_spx.tbl_nhl_rosters` and `tbl_nhl_rosters_raw_yahoo`. The last part of "City, Province/State/Country" is read through
   `db/seed/birthplace_token.csv`. SPX's player ids are not the NHL's, so a row is matched to a person only by folded name AND birth date,
   and only when exactly one person fits. USSR, Czechoslovakia and Yugoslavia give no code (the town decides); a second source's code that
   is one of the present-day countries listed in the seed's `compat` column confirms them.
2. **Wikidata** (CC0): `scripts/wikidata/queries/nhl_birthplace.rq` (NHL.com player ID P3522, birth place P19, its country P17, ISO code P297),
   one request. Run `scripts/wikidata/sparql.py`, load with `scripts/wikidata/load.py nhl_birthplace=<file>`, and archive the file with
   `scripts/archive_raw.py wikidata-nhl-birthplace <dir> <date>`. Matched by the NHL player id `core.external_id` already holds.
3. **English Wikipedia** (CC BY-SA 4.0): the infobox `birth_place` line, for players whose article title is held (source wikipedia).
   `fetch.py <titles file> <raw dir>` (50 titles a call, 2 s apart), `load.py <raw dir> <date>` into `legacy_wikipedia_birth.infobox`
   (migration 069), then `archive_raw.py wikipedia-nhl-birthplace <raw dir> <date>`.

Provenance is in `meta.verification` (field `birth_country_code`, one row per source that states a country: `confirmed` when it equals
what `core.person` holds, `disputed` with the value it gave when not) and `meta.data_issue` (`birth-country:` keys). A disagreement keeps the
higher source's value. Raw files live in `~/Projects/backups/spx-stats/raw/wikidata_nhl_birthplace/` and `.../wikipedia_nhl_birthplace/`.

## The NHL's own API was not used

`api-web.nhle.com` (landing pages with `birthCountry`) has no published terms, and nhl.com's Terms of Service
(https://www.nhl.com/info/terms-of-service, read 2026-10-13) say a user may not "engage in unauthorized spidering, scraping, or harvesting of
content or information" or "use any other unauthorized automated means to compile information", and may use the Services "only for
non-commercial, informational, personal use" and may not "enter into a database ... or in any way use or exploit" NHL Content.
`https://www.nhl.com/robots.txt` allows `/`; `api-web.nhle.com/robots.txt` is a 404. AGENTS.md section 3: if a source's terms forbid automated
collection, don't. No request was made to `api-web.nhle.com` for this work. (`scripts/nhlapi/` and `scripts/players/nhl_fetch.py` had used
the NHL's APIs for results and season lines. John decided on 2026-10-14: no new requests to any NHL endpoint; the data already
loaded stays, credited "NHL"; those fetch scripts now refuse to run. AGENTS.md section 3.)
