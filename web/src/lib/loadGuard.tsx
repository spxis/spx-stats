import "server-only";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ApiError } from "./api/client";
import { shouldThrow } from "./api/failure";
import { currentSpeaker } from "./i18n/currentLocale";

/** The inline note a page or section shows when the archive could not be read. */
export async function LoadFailed() {
  const { say } = await currentSpeaker();
  return <p className="note">{say("load.failed")}</p>;
}

/**
 * Wraps a page or a section that reads the archive: when a read fails (the database is busy, slow or down) it shows the
 * inline "Couldn't load" note, so the answer is a 200 and a reload usually fixes it, never a 404 or 500. Anything else
 * that goes wrong, a 404 from notFound() included, passes through untouched. In production a read the database could not
 * answer (5xx, timeout, network) is rethrown too, so a regeneration keeps the last good page (api/failure.ts).
 */
export function guard<P>(page: (props: P) => Promise<ReactNode>, fallback: (props: P) => ReactNode = () => <LoadFailed />) {
  return async (props: P): Promise<ReactNode> => {
    try {
      return await page(props);
    } catch (e) {
      if (!(e instanceof ApiError) || shouldThrow(e, process.env.NODE_ENV)) throw e;
      console.error(e);
      return fallback(props);
    }
  };
}

/** The same for a page's `generateMetadata`: a failed read gives a page that is kept out of search results. */
export function guardMeta<P>(meta: (props: P) => Promise<Metadata>) {
  return async (props: P): Promise<Metadata> => {
    try {
      return await meta(props);
    } catch (e) {
      if (!(e instanceof ApiError) || shouldThrow(e, process.env.NODE_ENV)) throw e;
      console.error(e);
      return { robots: { index: false } };
    }
  };
}
