import "./sportchip.css";

/** A sport or activity as a small badge, named in the reader's language (lib/sportNames.ts). */
export function SportChip({ name }: { name: string }) {
  return <span className="sportchip">{name}</span>;
}
