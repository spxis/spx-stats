import { SiteShell, siteMetadata, siteViewport } from "@/components/SiteShell";
import { currentAccount } from "@/lib/auth/account";
import { currentLocale } from "@/lib/i18n/currentLocale";

/**
 * The root layout of the signed-in pages (/me, /admin, /login, /tickets): drawn for each request, in the language of the cookie
 * and of Accept-Language, for the reader the session names. The public pages have their own, kept (app/[locale]/layout.tsx).
 */
export const generateMetadata = siteMetadata;
export const viewport = siteViewport;

export default async function DynamicLayout({ children }: { children: React.ReactNode }) {
  const [locale, account] = await Promise.all([currentLocale(), currentAccount()]);
  return <SiteShell locale={locale} account={account}>{children}</SiteShell>;
}
