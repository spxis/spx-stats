# Sign-in setup (Google)

Sign-in is off until all three secrets below are set; with none set the site looks and works as before
(no sign-in link, `/login`, `/me/*`, `/admin/*` and `/api/auth/*` all answer 404). Names only here; values
go in Vercel (Project Settings, Environment Variables), never in the repository.

Same names as Itsutsu and UmaKuma, so the same Google client can be reused.

## Environment variables

| Name | Needed | What |
|---|---|---|
| `AUTH_GOOGLE_ID` | yes | Google OAuth client id (fallback name `GOOGLE_CLIENT_ID`) |
| `AUTH_GOOGLE_SECRET` | yes | Google OAuth client secret (fallback `GOOGLE_CLIENT_SECRET`) |
| `AUTH_SECRET` | yes | random string that signs and encrypts the session cookie, e.g. `openssl rand -base64 32` (fallback `NEXTAUTH_SECRET`) |
| `ADMIN_EMAILS` | for admins | comma-separated admin addresses (Itsutsu's name); `ADMIN_GOOGLE_ALLOWED_EMAILS` (UmaKuma's name) is read too |
| `SUMILABU_BOARD_URL`, `SUMILABU_BOARD_TOKEN` | for the ticket pages | already used by `pnpm task`; read on the server only |
| `NEXTAUTH_URL` | no | leave UNSET on Vercel so each domain signs in on itself; set it only locally (`http://localhost:3000`) |

An admin is an address on the admin list AND a Google account that reports the email as verified. Everyone
else who signs in only gets their name and picture in the corner, a profile and settings.

## Authorized redirect URIs (Google Cloud console, the OAuth client)

    https://spxn.com/api/auth/callback/google
    https://stats.spxn.com/api/auth/callback/google
    http://localhost:3000/api/auth/callback/google

Authorized JavaScript origins (if the client asks): `https://spxn.com`, `https://stats.spxn.com`,
`http://localhost:3000`.

## Locally

Put the variables in `web/.env.local` (git-ignored) and run `pnpm dev`.
