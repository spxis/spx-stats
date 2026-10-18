import "server-only";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "./admin";
import { authEnabled, authOptions } from "./config";
import { devLogin, loopbackRequest, previewSignInEnabled } from "./preview";

export type SessionUser = { name: string | null; email: string; image: string | null; admin: boolean };

/** The signed-in user, or null (also null when sign-in is not configured). Asked on the server, every time. */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string | null; email?: string | null; image?: string | null; emailVerified?: boolean } | undefined;
  if (!user?.email) return null;
  // A session made by the preview sign-in counts only in the preview and only for a request sent to a loopback host (lib/auth/preview.ts).
  if ((session as { preview?: boolean } | null)?.preview === true && !(previewSignInEnabled(process.env) && loopbackRequest(await headers()))) return null;
  const image = user.image && /^https:\/\//.test(user.image) ? user.image : null;
  return { name: user.name ?? null, email: user.email, image, admin: isAdmin(user.email, user.emailVerified) };
}

/** For the /me pages: a 404 when sign-in is off, the login page when signed out. */
export async function requireUser(path: string): Promise<SessionUser> {
  if (!authEnabled()) notFound();
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return user;
}

/** For admin pages and actions: anyone else, signed in or not, gets a 404. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user?.admin) notFound();
  return user;
}

/** For admin actions that write (approve, hold, request, file a ticket): refused under the dev sign-in, whose fake admin must never reach DS1 or production. */
export async function requireAdminWrite(): Promise<SessionUser> {
  const user = await requireAdmin();
  if (devLogin(process.env)) throw new Error("Writes are turned off with the dev sign-in (SPXN_DEV_LOGIN).");
  return user;
}
