# SPXN web

The SPX Stats Network site (https://spxn.com) as a Next.js app. It replaces the static site in `../site/` at the same URLs.

Stack: Next.js (App Router, Turbopack), React, TypeScript (strict), Tailwind CSS v4, Zod, d3 (charts) and
[Chizu](https://github.com/johnmorrisdotca/chizu) (maps), pnpm.

## Run it

```sh
pnpm install
pnpm dev                  # http://localhost:3000
pnpm build && pnpm start  # production build
pnpm lint && pnpm typecheck
```

Node 22 or newer. No `.env` is needed: the defaults are the live project's public values.

## Environment variables

See `.env.example`.

| Variable | Default | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://njpvfrceahkvnrduerkk.supabase.co` | Supabase project holding the archive |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key | Public by design; it can only read the `api` schema |

They are read on the server at run time, never sent to the browser.

## How data flows

1. `src/lib/api/client.ts` reads a view of the read-only `api` schema over PostgREST
   (`Accept-Profile: api`, 1000 rows per request with a `Range` header), on the server only.
   Each response page is kept by Next's data cache for an hour (`revalidate: 3600`); a failed request is retried twice.
2. Every row is checked by a Zod schema (`src/lib/api/schemas.ts`), declared against the hand-written row types in
   `src/lib/api/types.ts` (taken from `db/migrations/015_api.sql`, `018_team_brand.sql`, `022_team_location.sql`). A row
   that does not match fails loudly rather than rendering wrong.
3. `src/lib/data.ts` shapes the rows for the pages (the same shapes the old `site/api.js` produced).
4. Pages are server components, so they arrive rendered and crawlable. Home, league, team, sources, quality and logos
   are static and refreshed in the background every hour. The season page reads `?phase=&team=&month=&day=`, so it
   renders per request (its data still comes from the cache).
5. Client components: the theme switch, league nav, d3 charts (`Heatmap`, `SeasonBars`, `WinLine`), the season
   calendar (`SeasonGames`) and the team map (`TeamMap`, which loads Chizu only when a team has coordinates).

## URLs

`/`, `/{nhl|nba|mlb|nfl|cfl}`, `/{league}/{year}`, `/{league}/team/{franchise}`, `/sources`, `/quality`, `/logos`,
plus `/sitemap.xml` and `/robots.txt` (`public/robots.txt`, identical to the old site's).
The season page keeps its selection in the address: `?phase=` (`r`, `p`, empty for all), `?team=` (a team id),
`?month=YYYY-MM`, `?day=YYYY-MM-DD`. Values that do not validate fall back to the defaults.

## Styling

`src/app/globals.css` holds the almanac's tokens (light and dark, one league colour per page) and its component
classes; Tailwind utilities (`bg-panel`, `text-muted`, `font-display`...) are generated from the same tokens.
A team page's accent is the first team colour with enough contrast on the page, worked out for both themes.

## Security headers

`next.config.ts` sets the same headers as the old `vercel.json`. The CSP allows `'unsafe-inline'` scripts because Next
injects inline scripts (nonces would make every page render per request); it no longer allows any CDN or the
Supabase host, because d3 and Chizu are bundled, fonts are self-hosted by `next/font`, and only the server talks to Supabase.

## Deploying on Vercel

Framework preset Next.js, Root Directory `web`, package manager pnpm (detected from `pnpm-lock.yaml`), default build
command (`next build`) and no output directory override. Remove the old `site` static settings (`vercel.json` there is not read).
