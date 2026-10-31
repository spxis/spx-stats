---
name: spx-site-page
description: Add or change a public page or a section of the spx-stats site (web/, Next.js App Router) with the kept-page rules, page-weight budget, English-only text and the version row. Use when a ticket touches a page under web/src/app, a query parameter, a component that draws data, or the version and release list.
---

# spx-site-page: a public page on spxn.com

Rules: [docs/site-rules.md](../../../docs/site-rules.md) (read it first), [AGENTS.md §9](../../../AGENTS.md#9-the-website), [sign-in guard](../../../docs/deploying.md), [docs/web-map.md](../../../docs/web-map.md).
Read `web/node_modules/next/dist/docs/` before writing Next.js code (this is Next 16).

## Checklist

1. **Pick the route.** A page that reads no `searchParams`, `cookies()` or `headers()` lives in `web/src/app/[locale]/s/` (kept a day).
   A page that reads a query key lives in `q/` (drawn per request), with a thin twin in `s/` that passes `NO_QUERY` (`web/src/lib/noQuery.ts`).
   Copy an existing twin, e.g. `web/src/app/[locale]/s/[league]/scores/page.tsx`. The address has no language in it.
2. **Keep the query keys honest.** A new query parameter goes into `QUERY_KEYS` in `web/src/lib/routing.ts`; a top-level section goes into
   `ALWAYS_STATIC` or `PAGE_ROOTS` there. A key missing from the list is silently ignored on a static page.
3. **Revalidate is a literal.** Every public segment has `export const revalidate = 86400;` written out (the test scans for the literal).
   A page with a database read goes through `guard(...)` from `@/lib/loadGuard` and `pageMeta(...)` for metadata, as `s/help-wikipedia/page.tsx` does.
4. **Reads.** Every server fetch goes through `web/src/lib/api/client.ts` (`queuedAtBuild`), carries `year=eq.` on games, and uses cache tags
   (`lib/api/tags.ts`). Never build a public endpoint that runs SQL. A read the database cannot answer throws (5xx); a 4xx shows "Couldn't load".
5. **Hide while the view is missing or empty.** A section that needs an `api` view or a materialized view draws nothing while the view is
   missing or empty (the country sections and the All-Star sections do this). Then a deploy before the data release is safe.
6. **Browser-only state.** Read `location` only in an effect or `useSyncExternalStore` with a server value. Never read the address at render
   in an `s/` page. Times: `<LocalTime iso=...>` or `mark()` plus `<Stamped>`; never write "UTC" by hand.
7. **Shared pieces, not copies.** `Flag` for every country flag, `SortTable` for every table, `NoSeason` for an empty season, `positionBook()`
   for every position (never a bare code), `placeAddress` for venue addresses, `TeamLogo` for logos, `sides.ts` for left and right.
8. **Text is English only.** New strings go in `web/src/lib/i18n/phrases.constants.ts` in English, via `say('key')`. FR and JA are added
   from a batch result only (`scripts/i18n/batch.py`, [AGENTS.md §9 Languages](../../../AGENTS.md#9-the-website)); never write them by hand.
9. **Page weight.** Under about 300 KB of HTML (about 50 KB gzipped). Check on the dev server:
   `curl -s -H 'Accept-Encoding: identity' <url> | wc -c` against the DS1 PostgREST, not production. A long table shows its newest rows
   and fetches the rest; a section far down loads when near (`useSeen`). `pnpm test:weight` holds the budget.
10. **Version and release row.** A reader-visible change bumps `version` in `web/package.json` (minor for a feature, patch for a fix or data
    correction, no bump for tooling). Add one row to `web/src/lib/siteReleases.ts` (version, date, short sha, plain English title and text).
    `pnpm test:siteversions` checks the list against package.json. The sha is the bump commit's short sha.
11. **Checks**, in `web/`: `pnpm lint`, `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test:routing`,
    plus `pnpm test:revalidate`, `pnpm test:weight`, `pnpm test:siteversions` when relevant. Then `pnpm start` and check a second request
    answers `x-nextjs-cache: HIT` for a kept page.

## Screenshots for John

- Give the clickable URL with the port of your own server: the dev server is 7701 (`http://localhost:7701/nhl/all-star`), a worktree
  server 7702-7749. Check `lsof -iTCP:<port> -sTCP:LISTEN` first; stop your own server by PID afterwards.
- Give exact steps. John cannot read kanji: for every Japanese label give the romaji and an English gloss.
- Admin pages: `/admin/dev` on your own server with `SPXN_DEV_LOGIN=1 NEXTAUTH_URL=http://localhost:<port>` (read-only admin; writes throw).

## Pitfalls that broke things

- A page in `s/` that reads `searchParams` outside a `<Suspense>` is drawn once for everyone: visitors see another visitor's query.
- A new query key missing from `QUERY_KEYS` gets the static copy (silently wrong).
- A kept page is refreshed after a release only for the cache tags it carries (`lib/api/tags.ts`): a new fetch without a tag stays stale for a day.
- The sign-in guard: a prebuilt deploy once shipped every page signed out. Do not change `scripts/mac/lib/build-auth.sh` or the auth
  variables in a page ticket; the deploy checks stand in the way (AGENTS.md §7).
