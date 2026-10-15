import type { Metadata } from "next";
import { SOCIAL_IMAGES } from "@/lib/brandAssets";
import { LOCALE_OG, type Locale } from "@/lib/locale";

/** Title, description, canonical address (always the plain path on spxn.com, whatever the language) and the matching social tags. */
export function pageMeta(opts: { title: string; description: string; path: string; locale: Locale }): Metadata {
  const locale = LOCALE_OG[opts.locale];
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: { title: `${opts.title} · SPXN`, description: opts.description, url: opts.path, siteName: "SPXN", type: "website", locale, images: [...SOCIAL_IMAGES.openGraph] },
    twitter: { card: "summary_large_image", title: `${opts.title} · SPXN`, description: opts.description, images: [...SOCIAL_IMAGES.twitter] },
  };
}
