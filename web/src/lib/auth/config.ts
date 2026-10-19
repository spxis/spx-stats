import "server-only";
import type { NextAuthOptions } from "next-auth";
import { AUTH_CLIENT_SECRET, AUTH_ID, AUTH_SECRET, authConfigured, firstEnv } from "./enabled";
import { authProviders } from "./providers";
import { isInvited, recordSignIn } from "../invite/store";
import { isEnvAdmin, siteClosed } from "../invite/rules";
import { DEV_SECRET, devLogin, previewSignInEnabled } from "./preview";

/**
 * Google sign-in with next-auth, set up the way Itsutsu and UmaKuma do it and with the same variable
 * names: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET (and the fallbacks they accept). The session is
 * a signed, encrypted JWT in an httpOnly, SameSite=Lax cookie (Secure on https); nothing is stored in a
 * database. next-auth checks the OAuth state and PKCE and only follows same-origin callback URLs.
 *
 * The one other provider, "preview" (lib/auth/preview.ts), exists only in the DS1 preview (SPX_PREVIEW=1, never on Vercel) and only answers
 * a request sent to a loopback host: it signs in as the admin without Google. Production builds carry no trace of it in the provider list.
 */
const clientId = firstEnv(process.env, AUTH_ID);
const clientSecret = firstEnv(process.env, AUTH_CLIENT_SECRET);
// The dev sign-in (SPXN_DEV_LOGIN=1 under next dev) signs its throwaway session with a fixed key when none is set; devLogin is false in every production build.
const secret = firstEnv(process.env, AUTH_SECRET) ?? (devLogin(process.env) ? DEV_SECRET : null);

/** False when any of the three is missing: the login UI is then hidden and every auth route is a 404. (A prebuilt deploy's build cannot see the secrets and says so with SPX_AUTH_CONFIGURED: lib/auth/enabled.ts.) */
export function authEnabled(): boolean {
  return authConfigured(process.env);
}

/** True when Google sign-in is set up (the login page offers it only then). */
export function googleConfigured(): boolean {
  return Boolean(clientId && clientSecret);
}

export const authOptions: NextAuthOptions = {
  providers: authProviders(process.env),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  // While the site is closed (SITE_ACCESS, lib/invite/rules.ts) a refused sign-in lands on the invite page, which says so.
  pages: { signIn: "/login", error: siteClosed(process.env) ? "/invite-only" : "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "preview") return previewSignInEnabled(process.env);
      if (account?.provider !== "google") return false;
      const email = typeof profile?.email === "string" ? profile.email : "";
      if (email.length === 0) return false;
      // The invite-only gate (lib/invite): while the site is closed only a verified address that is an admin or on the invite list gets a session. The list is read fresh here.
      if (siteClosed(process.env)) {
        if ((profile as { email_verified?: boolean }).email_verified !== true) return false;
        if (!isEnvAdmin(email, process.env) && (await isInvited(email, { fresh: true })) !== true) return false;
        await recordSignIn(email);
      }
      return true;
    },
    jwt({ token, profile, account }) {
      if (account?.provider === "preview") {
        token.emailVerified = true;
        token.preview = true;
        token.invited = true;
      } else if (profile) {
        // Set only after signIn() above let the address in while the site was closed; the proxy trusts it only when the invite list cannot be read.
        token.invited = siteClosed(process.env);
        token.emailVerified = (profile as { email_verified?: boolean }).email_verified === true;
        token.preview = false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { emailVerified?: boolean }).emailVerified = token.emailVerified === true;
      (session as { preview?: boolean }).preview = token.preview === true;
      return session;
    },
  },
  secret: secret ?? undefined,
};
