import "server-only";
import { cookies, headers } from "next/headers";
import { locale as routeLocale } from "next/root-params";
import { cache } from "react";
import { effectiveLocale, isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/locale";
import type { Speaker } from "./i18n";
import { speaker } from "./speaker";

/**
 * The language this request is answered in.
 *
 * The public pages live under `app/[locale]` and are drawn once per language, then kept (static pages with a one-hour
 * revalidate): the language is a segment of the route, so it costs no request data and a page can be cached. The address a
 * reader sees has no language in it; next.config.ts rewrites each request to its language from the cookie the footer's
 * picker sets, then the browser's Accept-Language, then English.
 *
 * The signed-in pages (`app/(dyn)`: /me, /admin, /login) are drawn for each request, so they read that cookie and header
 * themselves. Asked once per request (`cache()`).
 */
export const currentLocale = cache(async (): Promise<Locale> => {
  const fromRoute = await routeLocale();
  if (isLocale(fromRoute)) return fromRoute;
  const remembered = (await cookies()).get(LOCALE_COOKIE_NAME)?.value ?? null;
  const accept = (await headers()).get("accept-language");
  return effectiveLocale(remembered, accept);
});

/** The site, ready to talk to whoever sent this request. */
export async function currentSpeaker(): Promise<Speaker> {
  return speaker(await currentLocale());
}
