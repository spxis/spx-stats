import { sourceLabel } from "@/lib/sourceLabels";
import "./positions.css";

/** The key at the bottom of a page: each short source label drawn on it with its full name, licence and link. Nothing for no codes. */
export function SourceKey({ codes, title, note }: { codes: readonly string[]; title: string; note: string }) {
  if (!codes.length) return null;
  return (
    <section className="section poskey" id="sources-key">
      <h2>{title}</h2>
      <p className="note">{note}</p>
      <dl>
        {codes.map((code) => {
          const s = sourceLabel(code);
          return (
            <div className="poskey-row" key={code}>
              <dt>{s.short}</dt>
              <dd>
                {s.url ? <a href={s.url} rel="noreferrer">{s.name}</a> : s.name}
                {s.licence ? ` · ${s.licence}` : ""}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
