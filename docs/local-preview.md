# Previewing with DS1 data and signing in locally

Moved word for word from [AGENTS.md](../AGENTS.md) on 2026-10-30, so that file stays short enough to load in every session. Read this when you need a local site with DS1's data, or need to see an admin page or the account menu locally. The port map and the checks before a push stay in AGENTS.md section 6.

**Preview with DS1 data** (nothing reaches production): `bash scripts/mac/ds1-preview.sh` runs this checkout's site on the first free port
from 7702 against a read-only PostgREST on DS1, and stops both on Ctrl-C (`--start` for a production-like build, `--detach` and `--stop` for the background).
Always on at http://localhost:7700 (Docker, restarts with Docker, pages refresh every 5 minutes): `bash scripts/mac/ds1-preview.sh --install`, then `--update`, `--status`, `--uninstall` (scripts/mac/README.md).
`--update` also moves an install made on the old ports (3150 and 3180): it stops the compose project `spx-ds1-preview` by name and brings it up on 7700 and 7750.

**Signing in on the preview** (so the admin pages and the account menu can be seen locally; the header always has the Sign in link there):
- **Google, on the always-on site (7700 only).** `zsh scripts/mac/spx-credentials.sh auth` asks once for the Google client id and secret (hidden) and the admin
  email(s) and stores them in the keychain items `spx-stats AUTH_GOOGLE_ID`, `spx-stats AUTH_GOOGLE_SECRET`, `spx-stats ADMIN_EMAILS`. `ds1-preview.sh --install`
  or `--update` copies them, with `NEXTAUTH_URL`/`AUTH_URL=http://localhost:7700` and an `AUTH_SECRET` it makes itself once (never printed), into a second 600 file,
  `~/Library/Application Support/spx-stats/ds1-preview-auth.env`, which only the site container reads. Production keeps the same names as Vercel secrets, which cannot be pulled.
  Use the address `localhost`, not `127.0.0.1`: that is what the Google client allows.
- **"Sign in (this Mac)"**, the fallback and the only way on an on-demand port (Google does not allow those). It is a next-auth credentials provider,
  `web/src/lib/auth/preview.ts`, and exists only when `SPX_PREVIEW=1` (set by the preview image and script, never on Vercel; `VERCEL` set turns it off too) and an
  `AUTH_SECRET` is present. It answers only a request whose `Host` is `localhost`, `127.0.0.1` or `[::1]` with no forwarding header naming anything else (the published
  port is bound to 127.0.0.1, and inside Docker the peer address is the bridge, so the host name is what can be checked); the login page shows the button only then,
  `authorize` checks again, and a session made this way is ignored anywhere else. It signs in as `SPX_PREVIEW_ADMIN`, else the first `ADMIN_EMAILS` entry, else `john@spxis.com`, and
  that address counts as an admin in the preview only. `pnpm test:auth` covers it (the provider is absent without `SPX_PREVIEW`, and refuses a non-loopback host).
- **Dev sign-in, for an agent's own `next dev` (7702-7749).** Start the server with `SPXN_DEV_LOGIN=1 NEXTAUTH_URL=http://localhost:<port> pnpm exec next dev -p <port>`
  (`NEXTAUTH_URL` must name that port, or sign-in redirects to port 3000). Open `http://localhost:<port>/admin/dev` (the page lists the admin pages and signs in via
  "Sign in (this Mac)" on `/login`; wait a second after the click before the next page load). You are `dev-admin@example.invalid`, an admin who can **read** `/admin/people`, `/admin/tickets`,
  `/admin/logos` and the release and ops pages, but every admin write (approve, hold, request, file a ticket) throws, because those actions use `requireAdminWrite`
  (`lib/auth/user.ts`). It exists only when `NODE_ENV=development` (so never in a build or on Vercel), `SPXN_DEV_LOGIN=1` and `VERCEL` is unset, and only for a
  request to `localhost`, `127.0.0.1` or `[::1]` (`devLogin`, `devPageAllowed` in `lib/auth/preview.ts`; `pnpm test:auth` covers them). Release data needs the
  release secret, which agents do not have, so `/admin/data` shows no releases here.
- The header is the same height signed in, signed out or with only the theme switch: the account button, the theme switch and the Sign in link all use `--control-h`.
