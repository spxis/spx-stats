import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { MAX_BODY_BYTES, MIN_SECRET_LENGTH, bearer, parseTags, secretMatches } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called once by the release runner after a release changed production, so the pages it touched are rebuilt now instead of
 * within the hour. POST only (Next answers 405 to anything else). The caller must send REVALIDATE_SECRET as a Bearer token,
 * compared in constant time. The only effect is revalidateTag for the listed cache tags; nothing is read or written.
 */
export async function POST(request: Request) {
  const expected = (process.env.REVALIDATE_SECRET ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return NextResponse.json({ error: "Not set up." }, { status: 503 });
  if (!secretMatches(bearer(request.headers.get("authorization")), expected)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const tags = parseTags(body);
  if (!tags) return NextResponse.json({ error: "Send { \"tags\": [...] } with 1 to 100 cache tags." }, { status: 400 });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: tags.length });
}
