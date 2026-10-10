import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "@/lib/locale";

const body = z.object({ locale: z.string() });

/** Remembers the reader's language in a cookie. It touches nothing else. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isLocale(parsed.data.locale)) {
    return NextResponse.json({ error: "Not a language this site speaks." }, { status: 400 });
  }
  (await cookies()).set({
    name: LOCALE_COOKIE_NAME,
    value: parsed.data.locale,
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true, locale: parsed.data.locale });
}
