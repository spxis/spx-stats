import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { AUTH_CLIENT_SECRET, AUTH_ID, AUTH_SECRET, authConfigured, firstEnv } from "./enabled";

/**
 * Google sign-in with next-auth, set up the way Itsutsu and UmaKuma do it and with the same variable
 * names: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET (and the fallbacks they accept). The session is
 * a signed, encrypted JWT in an httpOnly, SameSite=Lax cookie (Secure on https); nothing is stored in a
 * database. next-auth checks the OAuth state and PKCE and only follows same-origin callback URLs.
 */
const clientId = firstEnv(process.env, AUTH_ID);
const clientSecret = firstEnv(process.env, AUTH_CLIENT_SECRET);
const secret = firstEnv(process.env, AUTH_SECRET);

/** False when any of the three is missing: the login UI is then hidden and every auth route is a 404. (A prebuilt deploy's build cannot see the secrets and says so with SPX_AUTH_CONFIGURED: lib/auth/enabled.ts.) */
export function authEnabled(): boolean {
  return authConfigured(process.env);
}

export const authOptions: NextAuthOptions = {
  providers: clientId && clientSecret
    ? [GoogleProvider({ clientId, clientSecret, checks: ["pkce", "state"], authorization: { params: { prompt: "select_account" } } })]
    : [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      return typeof profile?.email === "string" && profile.email.length > 0;
    },
    jwt({ token, profile }) {
      if (profile) token.emailVerified = (profile as { email_verified?: boolean }).email_verified === true;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { emailVerified?: boolean }).emailVerified = token.emailVerified === true;
      return session;
    },
  },
  secret: secret ?? undefined,
};
