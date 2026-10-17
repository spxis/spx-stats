/** Words that follow a name and are not part of it. Same list as the players letter filter. */
const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

/**
 * The last name as it should read on a retired-number banner: the last word of `name`, with Jr, Sr, II, III
 * and IV set aside. A one-word name is left as it is. Does not invent a name from a league-wide label.
 */
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1]!)) parts.pop();
  return parts.at(-1) ?? name.trim();
}
