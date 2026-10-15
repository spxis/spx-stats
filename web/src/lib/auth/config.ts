import "server-only";
import type { NextAuthOptions } from "next-auth";
import { AUTH_CLIENT_SECRET, AUTH_ID, AUTH_SECRET, authConfigured, firstEnv } from "./enabled";
import { authProviders } from "./providers";
import { previewSignInEnabled } from "./preview";

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
const secret = firstEnv(process.env, AUTH_SECRET);

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
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "preview") return previewSignInEnabled(process.env);
      if (account?.provider !== "google") return false;
      return typeof profile?.email === "string" && profile.email.length > 0;
    },
    jwt({ token, profile, account }) {
      if (account?.provider === "preview") {
        token.emailVerified = true;
        token.preview = true;
      } else if (profile) {
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
