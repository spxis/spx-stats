import type { Metadata } from "next";
import { ClosedSignIn } from "@/components/auth/ClosedSignIn";
import { authEnabled } from "@/lib/auth/config";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/**
 * What a signed-out browser sees while the site is closed (lib/invite/gate.ts): the same message and sign-in button as /invite-only, but kept, one
 * copy per language, so it costs no render however many visitors arrive. The proxy rewrites any page address here and the address in the bar stays
 * the page asked for; the button reads it in the browser and sends the reader back there after sign-in. Nothing here reads the request.
 * A signed-in visitor who is not invited, a refused Google sign-in (?error=) and the DS1 preview's own sign-in keep /invite-only, drawn per request.
 */
export const revalidate = 86400;
export const metadata: Metadata = { title: "Invite only", robots: { index: false, follow: false } };

export default async function ClosedPage() {
  const { say } = await currentSpeaker();
  return (
    <section className="head fade" data-site-gate="closed">
      <h1>{say("invite.title")}</h1>
      <p className="lede">{say("invite.lede")}</p>
      {authEnabled() ? <ClosedSignIn /> : <p className="note">{say("invite.noSignIn")}</p>}
    </section>
  );
}
