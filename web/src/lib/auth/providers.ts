import type { NextAuthOptions } from "next-auth";
import CredentialsModule from "next-auth/providers/credentials";
import GoogleModule from "next-auth/providers/google";
import { AUTH_CLIENT_SECRET, AUTH_ID, firstEnv } from "./enabled.ts";
import { previewSignInEnabled, previewUser } from "./preview.ts";

// next-auth ships CommonJS: under Node (the test) the default import is the module object, under the bundler it is the function.
const unwrap = <T,>(m: T): T => (m as unknown as { default?: T }).default ?? m;
const GoogleProvider = unwrap(GoogleModule);
const CredentialsProvider = unwrap(CredentialsModule);

/**
 * The provider list for an environment (no server-only import, so scripts/authPreview.test.ts can run it): Google when its client is set,
 * plus the preview sign-in (lib/auth/preview.ts) only in the DS1 preview. Production's list is Google alone, whatever else is in its environment.
 */
export function authProviders(env: Record<string, string | undefined>): NextAuthOptions["providers"] {
  const id = firstEnv(env, AUTH_ID);
  const clientSecret = firstEnv(env, AUTH_CLIENT_SECRET);
  const providers: NextAuthOptions["providers"] = [];
  if (id && clientSecret) {
    providers.push(GoogleProvider({ clientId: id, clientSecret, checks: ["pkce", "state"], authorization: { params: { prompt: "select_account" } } }));
  }
  if (previewSignInEnabled(env)) {
    providers.push(CredentialsProvider({
      id: "preview",
      name: "This Mac",
      credentials: {},
      // Checked again here, on the request that signs in: only a loopback host gets a session.
      authorize: (_credentials, req) => previewUser(env, { get: (name) => { const v = req?.headers?.[name.toLowerCase()]; return typeof v === "string" ? v : null; } }),
    }));
  }
  return providers;
}
