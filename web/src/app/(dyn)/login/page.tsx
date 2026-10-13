import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/SignInButton";
import { authEnabled } from "@/lib/auth/config";
import { safeDestination } from "@/lib/auth/redirect";
import { currentUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!authEnabled()) notFound();
  const { next, error } = await searchParams;
  const destination = safeDestination(next);
  if (await currentUser()) redirect(destination);
  return (
    <section className="head fade">
      <h1>Sign in</h1>
      <p className="lede">Sign in with your Google account to get a profile and settings. Everything on the site stays open without signing in.</p>
      {error ? <p className="note" role="alert">Sign-in did not complete. Please try again.</p> : null}
      <SignInButton next={destination} />
    </section>
  );
}
