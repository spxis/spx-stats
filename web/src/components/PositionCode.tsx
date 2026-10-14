import { POSITION_SEP, POSITIONS_KEY_ID } from "@/lib/positions";
import "./positions.css";

/**
 * One position code, upper case, wherever a page shows one. It links to the key at the bottom of the page (#positions-key) and carries the full
 * name for hover (the browser's own title) and for keyboard focus (a tip drawn in CSS from data-name), with no script. No name known: the bare code.
 */
export function PositionCode({ code, name }: { code: string; name?: string | null }) {
  const shown = code.toUpperCase();
  if (!name) return <span className="poscode">{shown}</span>;
  return <a className="poscode" href={`#${POSITIONS_KEY_ID}`} title={name} data-name={name} aria-label={`${shown}: ${name}`}>{shown}</a>;
}

/**
 * A person's positions, the main one first, each a PositionCode, with the one separator between them ("C/LW"). With `full` each code is
 * preceded by its name ("Left wing (LW)/Right wing (RW)"), for the player page. Nothing at all for none.
 */
export function PositionList({ items, full }: { items: readonly { code: string; name: string | null }[]; full?: boolean }) {
  if (!items.length) return null;
  return (
    <span className={full ? "poslist full" : "poslist"}>
      {items.map((x, i) => (
        <span key={x.code}>
          {i > 0 ? <span className="possep">{POSITION_SEP}</span> : null}
          {full && x.name ? <>{x.name} (<PositionCode code={x.code} name={x.name} />)</> : <PositionCode code={x.code} name={x.name} />}
        </span>
      ))}
    </span>
  );
}
