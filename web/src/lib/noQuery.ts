/**
 * The query of an address that has none: what a page in app/[locale]/s is given for `searchParams`. The page reads it like the
 * real thing, but nothing about the request is involved, so the page can be kept and revalidated (see lib/routing.ts).
 */
export const NO_QUERY: Promise<Record<string, string | string[] | undefined>> = Promise.resolve({});
