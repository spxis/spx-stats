/**
 * Whether sign-in is set up, from an environment. Pure (no server-only import) so a script can test it.
 *
 * The kept pages bake the answer in when they are built: whether the header carries a sign-in link, and whether the browser asks /api/me who is signed in.
 * A build made on the Mac (scripts/mac/deploy-prebuilt.sh) cannot see the project's secret variables: `vercel pull` brings them down empty, so the three below read
 * as missing and every kept page was built as "no sign-in" (no link, no account menu, and the signed-in browser's hint hid the theme button for nothing).
 * The script says so with SPX_AUTH_CONFIGURED=1 in the build's environment; the deployed functions read the real values at run time as before.
 */
export const firstEnv = (env: Record<string, string | undefined>, names: string[]): string | null => {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
};

export const AUTH_ID = ["AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID"];
export const AUTH_CLIENT_SECRET = ["AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_SECRET"];
export const AUTH_SECRET = ["AUTH_SECRET", "NEXTAUTH_SECRET"];

export function authConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(firstEnv(env, AUTH_ID) && firstEnv(env, AUTH_CLIENT_SECRET) && firstEnv(env, AUTH_SECRET)) || env.SPX_AUTH_CONFIGURED === "1";
}
