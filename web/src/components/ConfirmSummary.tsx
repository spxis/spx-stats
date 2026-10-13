"use client";

import { useSpeaker } from "@/components/i18n/LocaleProvider";

export type SummaryRow = { table: string; add?: number; change?: number; remove?: number; before?: number | null; after?: number | null };

/**
 * What an approval will change, for the confirmation dialog: one line per table (rows to add, change and remove), the size
 * change, or for a DS1 step the file and the row counts before and after. The numbers come from the release's own preview.
 */
export function ConfirmSummary({ rows, step = false, size, file }: { rows: SummaryRow[]; step?: boolean; size?: string; file?: string }) {
  const { say, fmt } = useSpeaker();
  const n = (v: number | null | undefined) => (v == null ? "–" : fmt(v));
  return (
    <div className="cf-summary">
      {file ? <p className="note">{say("confirm.runs", { file })}</p> : null}
      {rows.length ? (
        <>
          <p className="cf-what">{say("confirm.changes")}</p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>{say("confirm.col.table")}</th>
                  {step ? <><th className="num">{say("confirm.col.before")}</th><th className="num">{say("confirm.col.after")}</th></> : <><th className="num">{say("confirm.col.add")}</th><th className="num">{say("confirm.col.change")}</th><th className="num">{say("confirm.col.remove")}</th></>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.table}>
                    <td><code>{r.table}</code></td>
                    {step ? <><td className="num">{n(r.before)}</td><td className="num">{n(r.after)}</td></> : <><td className="num">{n(r.add)}</td><td className="num">{n(r.change)}</td><td className="num">{n(r.remove)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {size ? <p className="note">{say("confirm.size", { size })}</p> : null}
    </div>
  );
}
