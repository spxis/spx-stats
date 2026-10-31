# Serving spxn as static files: proposal

Written 2026-10-30. Nothing was changed on the site, no deploy, no new service. Every number says whether it was
measured, counted or scaled. The pages were drawn on machine1 (20 cores) from the read-only DS1 preview, never from
production.

## Short answer

**Not worth doing now. Keep the current setup (kept pages, drawn on first visit, invite-only).**

- The full set is about **1.95 million pages** (650,000 addresses x 3 languages). It would take roughly **4.5 hours** to
  draw and weigh about **215 GB** of HTML (about **440 GB** with the extra files Next writes per page).
- **No free host takes that.** The smallest useful slice (the 18,182 pages the sitemap lists, x 3 languages) is 54,546
  pages and about 8 GB of HTML. It does not fit Cloudflare Pages (20,000 files) and strains Vercel's 10 GB deployment storage.
- A static site still needs a small dynamic app (sign-in, admin, the invite gate, query pages, list APIs). The invite
  gate runs on **every** request today, so static files would not make a visit free while the site stays invite-only.
- What static files would remove is the cost of **first-visit drawing** and cache writes. Measured, that is about 0.1 s of
  CPU per page. It matters only if the site is opened to the public and crawlers walk the 1.95 million addresses, which
  is what caused the 2026-10-16 pause.

## 1. What every public page is today

| Fact | Value | How known |
|---|---|---|
| Pages built at deploy | 529 (22 league pages x 3 languages, info pages, ~350 surface drawings) | measured: `pnpm build` 109 s on machine1 |
| Every other page | drawn on its first visit, kept 1 or 30 days, expired by cache tag after a release | code: `generateStaticParams = () => []` |
| Cost of one visit to a kept page | 3 to 5 ms CPU (/nhl 5.0, /mlb 4.1, /about 3.1; a file with no proxy 0.7) | measured locally on `next start`, 400 requests each |
| Cost of a first visit (drawing one page) | median 0.08 s CPU and 0.09 s wall; range 0.01 to 0.9 s (the 0.9 s ones were first-ever reads) | measured, 87 first draws of 105 sample pages, section 3 |

Release effect: the runner posts cache tags (`api:<view>:<league>`, or `api:<view>` past 100 tags). Pages are redrawn
only when someone next visits them, so cost follows the pages people look at. A static build redraws every changed page
whether or not anyone looks.

## 2. Page inventory (counted from DS1 through the preview)

Addresses per language, times 3 for en, fr and ja.

| Kind | Addresses | Kind | Addresses |
|---|---:|---|---:|
| Games | 433,403 | World Cup players | 10,314 |
| Players | 81,732 | MLS matches | 9,071 |
| Score days | 75,782 | World Cup matches, squads, teams, pairs | 2,983 |
| Team seasons | 13,871 | Playoff series (est.), rounds (est.) | 4,531 + 2,000 |
| League head-to-head pairs | 9,062 | Seasons, leaders, world | 782 + 649 + 566 |
| Franchise pages and season lists | 789 + 789 | Venues, cities, countries | 305 + 120 + 110 |
| Soccer leagues, seasons, clubs | 1,052 | Awards, all-star, league sub-pages, info | about 700 |
| **Total per language** | **about 648,800** | **Total, 3 languages** | **about 1,946,000** |

- The sitemap lists only 18,182 of them (54,546 with languages). It leaves out games, players, score days, series and more.
- Not counted: head-to-head "compare" pages (43,443 possible pairs, open-ended).
- Also served as files: JSON "rows" routes and SVG drawings. Samples: 3 to 320 KB, mostly 3 to 50 KB. Upper bound about
  50,000 rows files per language (franchise 7 each, team season 3, season 3, league 4) and, for MLB and NFL games, up to
  about 105,000 game-field drawings per language. **Scaled, not counted.**

## 3. Size and drawing time (measured on samples, then scaled)

Method: 105 real pages (1 to 9 per kind, mixed leagues and eras) fetched from a local `next start` against the
preview, cold then warm, with CPU time of the server process (87 were drawn fresh, the rest were already prebuilt); 45 rows and SVG routes the same way; plus one real build of
**10,632 team-season pages** (NHL and NBA, 3 languages) to get the build rate and the extra files per page.

| Kind (sample average) | HTML | gzip | Cold draw CPU |
|---|---:|---:|---:|
| Game | 111 KB | 20 KB | 0.12 s |
| Player | 97 KB | 19 KB | 0.10 s |
| Score day | 86 KB | 15 KB | 0.08 s |
| Team season | 158 KB (NHL and NBA built: 201 KB) | 29 KB | 0.20 s |
| Series / head-to-head | 126 KB / 247 KB | 24 / 28 KB | 0.09 s |
| World Cup match, squad, player | 96, 64, 40 KB | 9 to 18 KB | 0.02 to 0.10 s |
| MLS match | 64 KB | 13 KB | 0.03 s |
| Rows JSON / SVG | median 26 KB / 19 KB | median 5 KB (rows) | 0.01 to 0.4 s |

Build rate: 10,632 pages drawn in **87 s with 19 workers = about 125 pages per second**, all reading the preview.
Each page also produced a `.rsc` file (70 KB), 4 to 5 segment files (142 KB) and a `.meta` file: **8 files and about
415 KB per page**, twice the HTML alone.

| Scaled from the above | Pages (3 languages) | HTML raw | HTML gzip | With extra files | Draw time at 125/s | Files |
|---|---:|---:|---:|---:|---:|---:|
| Everything | 1,946,000 | 214 GB | 39 GB | about 440 GB | about 4.3 h (59 CPU-hours) | 1.9 M (HTML only), 15.6 M (all) |
| Sitemap pages only | 54,546 | 8.2 GB | 1.5 GB | about 17 GB | about 7 min | 54,546 / 436,000 |
| Sitemap pages, English only | 18,182 | 2.7 GB | 0.5 GB | about 5.7 GB | about 2.5 min | 18,182 / 145,000 |

Not tried: one build of two million pages. Next would hold the whole address list in one process, and I did not test
that it can. A real run would draw in batches. The 4.3 hours assumes every kind draws as fast as team seasons; the samples
say they do (most are cheaper).

## 4. What a release would have to rebuild

- Today a release expires tags. At least 15 views read `core.game` directly, and more read those, so a one-league daily
  scores release expires nearly every page of that league (about 100,000 NHL pages) at tag level. Far too coarse for an
  eager rebuild. **Reasoned from the code, not traced.**
- With the pages that actually show a finished game (its game page, its score day, the two team seasons, the two
  franchise pages, the pair's head-to-head, the season, leaders, league pages), one game touches about **8 pages plus
  about 5 shared ones per league**. A busy day of about 40 games across leagues is roughly **350 pages, 1,050 with
  languages, under 10 s of drawing**. **Estimate; needs a record of which rows each page read, which does not exist yet.**
- A release that changes something shown everywhere (logos, names, abbreviations, positions, a layout) touches most
  pages: 600,000 to 1.9 million, hours. These happen a few times a month.

## 5. What can never be plain files

These stay a small dynamic app, on any host:

- Sign-in, `/me`, `/admin` and the invite-only gate in `src/proxy.ts`. A public static host cannot refuse a visitor.
- The 81 query-string forms under `app/[locale]/q` (sorting, filters, dates).
- Language choice from the cookie and `Accept-Language`. On Vercel the 546 rewrite rules do it with no function (limit
  2,048). Cloudflare Pages and GitHub Pages have no cookie or header conditions, so it needs a Worker.
- The list APIs `/api/players`, `/api/teams` and their suggest routes, `/api/me`, `/api/live`, `/api/revalidate`.
- Pages not prebuilt (compare pages, anything new): a static host answers 404, so something must catch and draw them.

## 6. Hosts (limits read today from each service's own page; all must cost $0)

| Host | Limits that matter | Fits? |
|---|---|---|
| Cloudflare Pages, Free ([limits](https://developers.cloudflare.com/pages/platform/limits/), [pricing](https://developers.cloudflare.com/pages/functions/pricing/), 2026-10-30) | 20,000 files per site, 25 MiB per file, 500 builds a month; static requests free and unlimited; no cookie or header rules | English sitemap pages only (18,182 HTML files) just fits and leaves no room for the logos, rows and drawings. Nothing larger. |
| Cloudflare Workers static assets ([limits](https://developers.cloudflare.com/workers/platform/limits/), 2026-10-30) | 20,000 files Free, 100,000 Paid; Worker requests 100,000 a day, 10 ms CPU on Free | Same file ceiling. The gate and language choice could run in a Worker within 100,000 a day. |
| Cloudflare R2 ([pricing](https://developers.cloudflare.com/r2/pricing/), 2026-10-30) | 10 GB-month free, 1M writes, 10M reads, no egress fee. Whether a card is needed is not stated: **unverified** | 10 GB holds the gzip of the sitemap tier (1.5 GB) but not the full set (39 GB). Needs a Worker to serve. |
| GitHub Pages ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), 2026-10-30) | site at most 1 GB, soft 100 GB a month, soft 10 builds an hour, 10 minute deploy timeout, no commercial transactions; no file limit stated; no rewrites | Only the English sitemap tier, and probably not that (2.7 GB raw). |
| Vercel Hobby ([limits](https://vercel.com/docs/limits), page dated 2026-09-16, and [fair use](https://vercel.com/docs/limits/fair-use-guidelines)) | 100 deployments a day, 2,048 routes, CLI upload of source files capped at 100 MB (unclear for `--prebuilt` output), no stated cap on output files, 45 minute build limit; 100 GB transfer, 1M invocations, 4 h Active CPU a month; non-commercial | Works with the current rewrites. Storage is the problem: the account (all projects together) has 10 GB of deployment storage and we keep two deployments, so 8 GB of HTML per deployment does not fit. |
| Netlify Free ([credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), 2026-10-30) | 300 credits a month, hard limit; 15 credits per production deploy, 20 per GB transferred | About 20 deploys a month. A daily rebuild does not fit. |
| Firebase Hosting, Spark ([pricing](https://firebase.google.com/pricing), 2026-10-30) | 10 GB storage, 360 MB a day transfer, no card | Transfer far too small. |

On Vercel itself: the team is on Pro until about 2026-11-16 and then returns to Hobby, so Hobby is the limit to design for.
A static deployment would cut Functions use (CPU, invocations, ISR writes). It would raise Deployment Storage to or past
its 10 GB. Function Invocations would not fall while the proxy stays.

## 7. Honest comparison with today

- **Today, per visit:** one proxy run (3 to 5 ms CPU locally) plus, the first time a page is seen after a release, one
  draw (about 0.1 s CPU) and cache writes.
- **Static, per visit:** a file from the edge, and still the proxy while the invite gate stays (so no change to
  invocations or the 3 to 5 ms).
- **What it saves:** the draws and cache writes. At 1,000 visits a day and 300 first-visit draws (0.15 s each), that is about 45 s of
  CPU a day (about 0.4 h a month of the 4 h allowance). **Illustration, my arithmetic, not John's real traffic.**
- **What it costs:** hours of build on machine1, a rebuild pipeline with a new dependency record, a second system to keep
  in step, and a place to put 8 GB or more.
- **Where it would pay:** only if the site is opened to the public. Crawling 100,000 uncached pages at 0.1 s each is about
  3 CPU-hours, most of the monthly allowance, which is the 2026-10-16 pause.
- **Current Vercel usage is unknown.** The Vercel connector refused billing reads (403) and I did not authorise it. The
  screenshot that would settle it: Vercel, team usage page, project spx-stats, last 14 days, showing Function
  Invocations, Active CPU, ISR Writes and Reads, Edge Requests and Fast Data Transfer.

## 8. Recommendation and phases if John says yes

**Recommendation: do not start. Revisit when the invite gate is lifted.** If that day comes, the cheaper first step is
to keep Vercel and put a free cache in front of it (not evaluated here), not to rebuild the site.

If John still wants static files, in order, each stoppable:

1. **Trial on machine1 only (about 2 days).** Draw the English sitemap tier into a folder (18,182 pages), record which
   rows each page read, and check size and speed. Risk: none outside the Mac. Stop here if the size is not under
   about 3 GB.
2. **Rebuild plan on paper plus a dry run.** Turn the row record into "these changed rows rebuild these pages", and
   replay the last 30 days of releases. Risk: the record may be too coarse for shared changes; those stay full rebuilds.
3. **Test host.** Publish the English tier on a test hostname with the current site behind it for anything missing.
   Risk: the gate and language choice need a Worker; search engines see two copies; stale pages if a rebuild is missed.
4. **Cut over spxn.com** by DNS, keeping the current deployment as the way back. Risk: any page not prebuilt must fall
   through to the dynamic site; sign-in cookies and the gate must still apply.

## Not measured

- Current Vercel usage (above).
- A build of two million pages; the 4.3 hours is scaled from 10,632.
- Pages per real release (needs the row record); proxy invocations caused by link prefetching; the Vercel limit on
  the size of a `--prebuilt` upload; Cloudflare Access, the R2 card requirement and any CDN-in-front option.
- Rows and SVG file counts (upper bounds only).

## The one question

**Will spxn.com be opened to the public (invite gate removed) in the next six months?** If no, we stop here. If yes,
approve step 1, the machine1-only trial.
