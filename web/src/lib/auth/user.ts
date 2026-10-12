import "server-only";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { isAdmin } from "./admin";
import { authEnabled, authOptions } from "./config";

export type SessionUser = { name: string | null; email: string; image: string | null; admin: boolean };

/** The signed-in user, or null (also null when sign-in is not configured). Asked on the server, every time. */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string | null; email?: string | null; image?: string | null; emailVerified?: boolean } | undefined;
  if (!user?.email) return null;
  const image = user.image && /^https:\/\//.test(user.image) ? user.image : null;
  return { name: user.name ?? null, email: user.email, image, admin: isAdmin(user.email, user.emailVerified) };
}

/** For admin pages and actions: anyone else, signed in or not, gets a 404. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user?.admin) notFound();
  return user;
}
