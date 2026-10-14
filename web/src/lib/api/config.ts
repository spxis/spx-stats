/**
 * Where the archive is read from. Both values are public by design: the key is Supabase's
 * publishable key and can only read what the `api` schema exposes. Override with env vars.
 */
// Read by name at run time (not inlined at build), so a deployment can change them without a rebuild.
const env = (name: string): string | undefined => process.env[name];

const BASE = (env("NEXT_PUBLIC_SUPABASE_URL") || "https://njpvfrceahkvnrduerkk.supabase.co").replace(/\/+$/, "");

/**
 * SPX_REST_URL points the site at a PostgREST on this computer instead of production, for ONE purpose: `scripts/mac/deploy-prebuilt.sh`
 * builds the pages against DS1 through a local PostgREST (AGENTS.md section 7), so a build reads production no more. Only a loopback
 * address is accepted, so a stray value on Vercel or in a shared env file can never send visitors' reads anywhere else; anything else
 * is ignored and production is used. Never set it on Vercel: pages revalidated at run time must read production.
 */
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?(\/.*)?$/;
const local = (env("SPX_REST_URL") ?? "").trim();

export const REST_URL = LOCAL.test(local) ? local.replace(/\/*$/, "/") : `${BASE}/rest/v1/`;
export const API_KEY =
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC";

/** Seconds a response is kept before the next request refreshes it in the background. */
export const REVALIDATE = 3600;
/** Seconds a retried read is kept (and so, because a page lives no longer than its shortest read, how long a page drawn after a failed first try is kept). */
export const RETRY_REVALIDATE = 15;
/** Rows PostgREST returns per request. */
export const PAGE_SIZE = 1000;
