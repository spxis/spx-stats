/**
 * Where sign-in may send someone afterwards. The value comes from a query string, so it is attacker
 * controlled: only a path on this site is kept. "//host" and "/\host" read as off-site to a browser, and
 * control characters are refused, so all of those become "/".
 */
export function safeDestination(next: string | null | undefined): string {
  if (!next || next.length > 512) return "/";
  if (!next.startsWith("/")) return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  return next;
}
