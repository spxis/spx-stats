import { notFound } from "next/navigation";
import { SiteShell, siteMetadata, siteViewport } from "@/components/SiteShell";
import { isLocale, LOCALES } from "@/lib/locale";

/**
 * The root layout of every public page. The language is the route's first segment, set by the rewrites in next.config.ts
 * (lib/routing.ts), so a page is drawn once per language and kept; it asks nothing of the request. This layout's
 * 30 days is the longest a child may live; live pages set a day on themselves.
 */
export const revalidate = 2592000;
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

export const generateMetadata = siteMetadata;
export const viewport = siteViewport;

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SiteShell locale={locale}>{children}</SiteShell>;
}
