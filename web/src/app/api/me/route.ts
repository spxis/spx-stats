import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the pages that are kept and so cannot say: the account menu, and for an admin the line above the header
 * when a release waits. `{ user: null, bar: null }` for everyone else. The browser asks only when it carries the hint cookie or has
 * never been asked (lib/auth/hint.ts); the answer is never stored.
 */
export async function GET() {
  return NextResponse.json(await currentAccount(), { headers: { "cache-control": "private, no-store" } });
}
