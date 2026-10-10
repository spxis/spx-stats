import type { Metadata } from "next";

/** Title, description, canonical address (always the plain path on spxn.com) and the matching social tags. */
export function pageMeta(opts: { title: string; description: string; path: string }): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: { title: `${opts.title} · SPXN`, description: opts.description, url: opts.path, siteName: "SPXN", type: "website", locale: "en_CA" },
    twitter: { card: "summary", title: `${opts.title} · SPXN`, description: opts.description },
  };
}
