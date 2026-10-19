import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/SignInButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { authEnabled, googleConfigured } from "@/lib/auth/config";
import { loopbackRequest, previewSignInEnabled } from "@/lib/auth/preview";
import { safeDestination } from "@/lib/auth/redirect";
import { currentUser } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { siteClosed, verdict } from "@/lib/invite/rules";
import { isInvited } from "@/lib/invite/store";

/**
 * What a signed-out visitor, or a signed-in one who is not on the invite list, sees while the site is closed (lib/invite/rules.ts): one short
 * message and a sign-in button, no data. The proxy rewrites a browser's page request here (the address in the bar stays the page asked for, in
 * `next`), and a refused Google sign-in lands here with ?error=. It reads no database for a signed-out visitor. Once the site is open again, or the
 * visitor is let in, it sends them on to where they were going.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite only", robots: { index: false, follow: false } };

export default async function InviteOnlyPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const destination = safeDestination(next);
  if (!siteClosed(process.env)) redirect(destination);
  const s = await currentSpeaker();
  const user = await currentUser();
  if (user) {
    const decided = verdict({ email: user.email, emailVerified: true, invitedClaim: false }, user.admin ? true : await isInvited(user.email), process.env);
    if (decided === "allow") redirect(destination);
  }
  const signIn = authEnabled();
  // Only the DS1 preview, and only for a request sent to a loopback host, offers the sign-in that needs no Google client (as on /login).
  const preview = previewSignInEnabled(process.env) && loopbackRequest(await headers());
  return (
    <section className="head fade" data-site-gate="closed">
      <h1>{s.say("invite.title")}</h1>
      {user ? (
        <>
          <p className="lede" role="alert">{s.say("invite.deniedSignedIn", { email: user.email })}</p>
          <SignOutButton />
        </>
      ) : (
        <>
          <p className="lede">{s.say("invite.lede")}</p>
          {error ? <p className="note" role="alert">{s.say("invite.denied")}</p> : null}
          {signIn ? <SignInButton next={destination} google={googleConfigured() || !preview} preview={preview} /> : <p className="note">{s.say("invite.noSignIn")}</p>}
        </>
      )}
    </section>
  );
}
