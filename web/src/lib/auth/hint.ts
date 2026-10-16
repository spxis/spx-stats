/**
 * How a kept (static) page knows, without asking the server on every visit, whether to look for a signed-in reader.
 *
 * The session itself is an httpOnly cookie the browser's script cannot read, and a kept page cannot read it either. So a
 * signed-in browser also carries a plain cookie, `spxn-in`, that says only "ask": the page then fetches /api/me once and draws the
 * account menu. Without the cookie the browser never asks: a signed-out visit must not call /api/me. Signing in sets the cookie;
 * a signed-in page that already knows the reader (`initial`) sets it too. Nothing here is trusted for anything: /api/me answers
 * from the real session.
 */
export const HINT_COOKIE = "spxn-in";
export const PROBED_KEY = "spxn-probed";
/** A session lasts seven days (lib/auth/config.ts); so does the hint. */
const HINT_SECONDS = 60 * 60 * 24 * 7;

/** Runs in the head before the first paint: marks <html> so the signed-out controls are hidden for a browser that will turn out to be signed in. */
export const HINT_SCRIPT = `try{if(/(?:^|; )${HINT_COOKIE}=1/.test(document.cookie))document.documentElement.setAttribute('data-in','')}catch(e){}`;

export function hasHint(): boolean {
  try {
    return new RegExp(`(?:^|; )${HINT_COOKIE}=1`).test(document.cookie);
  } catch {
    return false;
  }
}

export function setHint(on: boolean): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${HINT_COOKIE}=${on ? "1" : ""}; Path=/; Max-Age=${on ? HINT_SECONDS : 0}; SameSite=Lax${secure}`;
    if (on) document.documentElement.setAttribute("data-in", "");
    else document.documentElement.removeAttribute("data-in");
  } catch { /* cookies may be blocked */ }
}

export function wasProbed(): boolean {
  try {
    return localStorage.getItem(PROBED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProbed(on: boolean): void {
  try {
    if (on) localStorage.setItem(PROBED_KEY, "1");
    else localStorage.removeItem(PROBED_KEY);
  } catch { /* storage may be blocked */ }
}
