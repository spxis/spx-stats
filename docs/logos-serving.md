# Serving team logos: measurement and proposal

Status: built (2026-10-19) and measured on 2026-10-31: the normal deploy can render them (`SPX_LOGO_COPIES=1`, default off) but they stay off until John decides whether `/team-logos/` leaves the invite gate. Ticket cmv99sy290000l606fpdcpjf4 and SPX-819. Measured 2026-10-18 with the dev server (`next dev`, kept pages
drawn against production's public API; spxn.com itself is behind a bot check) and by fetching every logo URL the pages name.
Each page was fetched once, images fetched from Wikimedia 1.2 s apart with the project User-Agent.

## Today, in numbers

Logo bytes on the page as first drawn (the server markup; lazy images below the fold are in these totals, so a browser that never
scrolls loads less):

| Page | HTML | Logo-ish images | Logo bytes | Notes |
|---|---|---|---|---|
| /teams (first rows) | 303 KB | 38 (30 external) | 966 KB | 24 PNG 791 KB, 5 SVG 123 KB, 3 GIF 52 KB; 6 hosted `/team-logos/sl` files are 404 on this checkout only (git-ignored) |
| franchise (Canadiens) | 234 KB | 25 | 162 KB | 1 Wikimedia PNG; 24 are the site's own jersey/title banners (153 KB) |
| season (NHL 2023-24) | 274 KB | 34 | 721 KB | 32 Wikimedia PNG thumbs, avg 22 KB each, drawn at 20 px |
| /players | 417 KB | 116 | 634 KB | no team logos at all: these are country flags (`/flag/XX.round.svg`, up to 81 KB each) |

All logos in the database (296 distinct URLs, 223 external plus 73 hosted SportsLogos.Net files; 1,373 brand rows):

- 873 of 892 external rows use a `120px` (600) or `250px` (273) Wikimedia thumbnail; 19 use the original file. Fetched, the 223 external
  files are 11.3 MB: 2 are JPEG originals of 5.5 MB together, the rest median 8 KB, p90 42 KB, 66 over 20 KB.
- Formats: 162 PNG, 26 GIF, 32 SVG, 2 JPEG, 1 WebP. Most PNGs are Wikimedia's raster thumbnails of SVG originals.
- Sizes drawn: 14, 16, 20, 24, 26, 32, 36, 48, 56, 64, 88 px; 20 and 24 dominate tables. A 20 px logo is a 120 px PNG: about 6x the
  pixels a 2x screen needs.
- Wikimedia thumbs carry no `Cache-Control` (only ETag and Last-Modified), so repeat visits rely on heuristic freshness. Every logo is a
  request to a third party (about 30 on /teams), none under our control, no immutable caching, no way to fix a bad file (white GIF boxes,
  wordmarks) except through logo-fit data.

## Options under the $0 rule

| Option | Logo bytes (teams / season) | Cost | Verdict |
|---|---|---|---|
| A. Smaller Wikimedia thumbs (`40px-`, a standard Wikimedia width, for 20 px slots) | about 3-5 KB each, roughly 150 KB / 130 KB | none; still hotlinked, Wikimedia may not have the width cached, still no cache header | quick stopgap, not the answer |
| B. Own static files, pre-rendered once on a Mac, 1x and 2x WebP per logo, served from `web/public` | about 1.2 KB each at 40 px high: about 41 KB / 40 KB (re-encoded all 191 readable files: total 237 KB, max 2.9 KB) | none; Vercel static assets, a few hundred KB in the deploy | recommended |
| C. Dynamic logo route resizing on request (sharp) | same bytes as B | Vercel CPU and function limits | no: CPU for something computable once |
| D. `next/image` / Vercel optimizer | same bytes as B | bills past the free source-image quota; also proxies trademarks | no (ticket forbids) |
| E. Per-season sprite | one request instead of 30 | a new sprite per season and league, poor cache reuse across pages, SVG/PNG mixing; HTTP/2 already makes 30 small requests cheap | not worth it once files are 1 KB |

## Recommendation: B, own pre-rendered files, immutable cache

1. A script on a Mac (`scripts/logos/`, run by the coordinating session before a deploy, like `export_hosted.py`) reads each logo
   once from the local library / `legacy_files.raw_archive`, and writes `web/public/team-logos/<sha8>-<size>.webp` (sizes 24 and 48 cover the
   14-26 and 32-64 slots at 1x and 2x; 96 for the 88 px hero). SVG primaries whose real mark is small (under about 3 KB after svgo) are
   copied as cleaned SVG instead. Files are git-ignored like `team-logos/sl`, written before the build, content-hashed names.
2. `next.config.ts` sets `Cache-Control: public, max-age=31536000, immutable` for `/team-logos/*`.
3. The database keeps the licence, file page and original URL per file (unchanged; fair use still explained on `/logos`); only the
   `<img src>` changes, through `TeamLogo` (one place), using a `<sha8>` derived from the existing logo key so there are no extra database
   reads. A logo with no local file falls back to today's hotlink.
4. Background removal for GIF wordmarks and dark-mode contrast stay in the existing logo-fit data; the pre-render step only trims the
   white box of a flat-white-background GIF. Non-free marks are never upscaled or vectorised; free/public-domain SVGs may be cleaned.
5. Expected result: /teams logos about 966 KB to about 45 KB, a season page 721 KB to about 40 KB, requests to third parties from about 30 to 0,
   repeat visits free. Deploy size grows by roughly 0.5 MB for all 296 logos at two sizes.

Needs from John: yes to building B. Build order after a yes: the render script plus `TeamLogo` change (site only, no data), then one
hand-off. Because original bytes already sit in the library and the archive, no new data rows are needed.

## Found on the way (separate tickets, not part of this one)

- /players and the other tables draw country flags as full inline-quality SVGs: 116 flags are 634 KB (Spain, Mexico and Haiti are
  about 80 KB each). The same treatment (cleaned, minified flags, immutable) would cut that by about 90 percent.
- `/team-logos/sl/*` returns 404 on any checkout that has not run `export_hosted.py`; the dev server shows missing logos for 73 hosted marks.

## Implemented (John said "get these done", 2026-10-19)

- `scripts/logos/render_site.py` (Pillow with WebP; Mac venv `~/.cache/spx-stats/logo-venv`) reads every logo address from the PostgREST
  (`team_brand`, `logo_fit`), takes the bytes from the local library's `render-src/` cache, the hosted SportsLogos.Net files or Wikimedia (1.5 s apart,
  250 px thumbnail first), and writes `web/public/team-logos/<hash>-<tag>-<24|48|96>.webp` (a tier only where the source can fill it, never enlarged),
  small safe SVGs (up to 3 KB) as they are, and `manifest.json`. All git-ignored. `deploy-prebuilt.sh` and `ds1-preview.sh` run it
  (`hosted_logos_render`) after `hosted_logos_export`; a failure only warns and removes the manifest, so every logo keeps its hot link.
- `<hash>` is FNV-1a of the logo key (`logoKey`, the same for every thumbnail size of a file), `<tag>` the first 6 hex of sha256(source bytes + render
  version), so files are immutable. `next.config.ts` puts the manifest into `SPX_LOGO_FILES` (no database read) and sends the one-year immutable header.
- `lib/logoFiles.ts` `localLogo()` gives `TeamLogo` and the player chips a 1x/2x `srcSet`; `onError` falls back to the hot link.
- Tests: `pnpm test:logofiles`, `python3 -I scripts/logos/test_render_site.py`, `bash scripts/mac/test/hosted-logos-test.sh`.
- A dry offline run on this Mac (library cache only) rendered 128 of 339 logos, 360 files, 0.9 MB; the rest need one online run (about 1.5 s per new
  file, a few minutes). No bill, no new package, no data written.

## Untested

The online render of all logos, and the effect in a real deploy (page weights above are estimates). 
Image counts come from the server markup, not a browser run (lazy loading means a real visit loads fewer). The re-encode used Pillow
at 40 px high from the existing 120 px PNGs; SVG sources were not rasterised by me. No Vercel build or deploy was done.
