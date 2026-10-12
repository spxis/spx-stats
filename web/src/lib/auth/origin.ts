/**
 * CSRF check for state-changing requests: the browser's Origin header must name the host the request was
 * sent to. A request with no Origin is refused (browsers send it on every cross-site POST).
 */
export function sameOrigin(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
