import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { effectiveLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/locale";
import { speaker, type Speaker } from "./i18n";

/**
 * The language this request is answered in: the cookie the footer's picker sets, then the browser's
 * Accept-Language, then English. Asked once per request (`cache()`): the root layout, the page and its
 * metadata all hear the same answer.
 */
export const currentLocale = cache(async (): Promise<Locale> => {
  const remembered = (await cookies()).get(LOCALE_COOKIE_NAME)?.value ?? null;
  const accept = (await headers()).get("accept-language");
  return effectiveLocale(remembered, accept);
});

/** The site, ready to talk to whoever sent this request. */
export async function currentSpeaker(): Promise<Speaker> {
  return speaker(await currentLocale());
}
