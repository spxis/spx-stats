# Sources we chose not to use

John, 2026-11-02: we do not need these sites, so we do not use them. Nothing is fetched from them, and `scripts/grey/common.py` holds them so no job can.
Check this page before proposing a source. To reconsider one, ask John; do not fetch it to find out. The full registry, with every source's tier, is `scripts/daily/sources.py` (`/admin/sources`).

| Source | Why not (terms read 2026-10-30) | Note |
|---|---|---|
| api.cfl.ca | The host no longer resolves. Its public licence was non-commercial, share-alike and revocable, the key was for individuals, and the cfl.ca terms bar systematic retrieval to compile a database. | Read from search excerpts; the pages themselves were not reachable. |
| stats.ncaa.org | The ncaa.org terms, sections 4 and 9, bar robots, scraping, harvesting and collecting content. | The terms cover NCAA.org "and its microsites" without naming this host. It answers 403 even to robots.txt. |
| FanGraphs | Terms of Service section 17 bars access other than through their interface; section 8 bars reuse. | https://www.fangraphs.com/about/terms-of-service |
| Transfermarkt | A second-hand quote of section 11.1 bars bots, spiders and screen scraping and reserves text and data mining. | The terms page itself gave a bot challenge, so this was not read first-hand. |

Never used under any tier, by standing rule in AGENTS.md section 3: Sports Reference and ESPN.
