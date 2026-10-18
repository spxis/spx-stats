import "./sportchip.css";

/** A sport, activity, role or source as a small badge, named in the reader's language (lib/sportNames.ts); `title` is the full name on hover. */
export function SportChip({ name, title }: { name: string; title?: string }) {
  return <span className="sportchip" title={title}>{name}</span>;
}
