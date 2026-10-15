/**
 * Goes to a team's squad on a tournament page (`#squad-<code>`): the address takes the reader there and the closed list opens (components/LazySquad.tsx listens for the
 * address). A press on the strip is a plain link; this is for the map, which has no link to press. Browser only.
 */
export function jumpToSquad(anchor: string): void {
  if (window.location.hash === `#${anchor}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = anchor;
}
