/**
 * Who counts as an admin: an address on the environment's list whose Google
 * account says the address is verified. An empty or missing list means nobody.
 * Names match Itsutsu (ADMIN_EMAILS) and UmaKuma (ADMIN_GOOGLE_ALLOWED_EMAILS);
 * both are read, so either can be set.
 */
export const ADMIN_ENV_NAMES = ["ADMIN_EMAILS", "ADMIN_GOOGLE_ALLOWED_EMAILS"] as const;

export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return ADMIN_ENV_NAMES.flatMap((name) => (env[name] ?? "").split(/[,\s]+/))
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function isAdmin(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!email || emailVerified !== true) return false;
  return adminEmails(env).includes(email.trim().toLowerCase());
}
