/**
 * Where the archive is read from. Both values are public by design: the key is Supabase's
 * publishable key and can only read what the `api` schema exposes. Override with env vars.
 */
// Read by name at run time (not inlined at build), so a deployment can change them without a rebuild.
const env = (name: string): string | undefined => process.env[name];

const BASE = (env("NEXT_PUBLIC_SUPABASE_URL") || "https://njpvfrceahkvnrduerkk.supabase.co").replace(/\/+$/, "");

/**
 * SPX_REST_URL points the site at a PostgREST on this computer instead of production, for two purposes only: `scripts/mac/deploy-prebuilt.sh`
 * builds the pages against DS1 through a local PostgREST (AGENTS.md section 7), so a build reads production no more; and
 * `scripts/mac/ds1-preview.sh` runs the site on the Mac against DS1 (AGENTS.md section 6). Only a loopback address is accepted, so a stray
 * value on Vercel or in a shared env file can never send visitors' reads anywhere else; anything else is ignored and production is used.
 * The one extra address is the always-on preview's compose service, `http://pgrst:<port>/`, and only when SPX_PREVIEW=1 is also set (the
 * preview image sets it; Vercel never does). Never set either variable on Vercel: pages revalidated at run time must read production.
 */
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?(\/.*)?$/;
const PREVIEW_SERVICE = /^http:\/\/pgrst(:\d{2,5})?(\/.*)?$/;
const preview = env("SPX_PREVIEW") === "1";
const local = (env("SPX_REST_URL") ?? "").trim();

export const REST_URL = LOCAL.test(local) || (preview && PREVIEW_SERVICE.test(local)) ? local.replace(/\/*$/, "/") : `${BASE}/rest/v1/`;
export const API_KEY =
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC";

/**
 * Seconds a response is kept before the next request refreshes it in the background. Data changes only through releases, and
 * the release runner revalidates the changed tables' cache tags (POST /api/revalidate, lib/api/tags.ts) right after each one, so the
 * time is only a safety net. Live pages (home, league, scores) keep one day; historical pages keep 30 days (`REVALIDATE_HISTORICAL`).
 * Segment config (`export const revalidate = …`) must be a literal number, so pages repeat it; scripts/revalidate.test.ts checks the literals.
 * Only the always-on DS1 preview (SPX_PREVIEW=1, local and free) may shorten it with SPX_REVALIDATE (30 to 2591999 seconds), so new DS1 data shows
 * within minutes; its image build rewrites the segment literals to the same number (scripts/mac/ds1-preview/Dockerfile).
 */
export const REVALIDATE_DAY = 86400;
export const REVALIDATE_HISTORICAL = 2592000;
const previewSeconds = Number(env("SPX_REVALIDATE"));
export const REVALIDATE = preview && Number.isInteger(previewSeconds) && previewSeconds >= 30 && previewSeconds < REVALIDATE_HISTORICAL ? previewSeconds : REVALIDATE_HISTORICAL;
/** Seconds a retried read is kept (and so, because a page lives no longer than its shortest read, how long a page drawn after a failed first try is kept). */
export const RETRY_REVALIDATE = 15;
/** Rows PostgREST returns per request. */
export const PAGE_SIZE = 1000;
