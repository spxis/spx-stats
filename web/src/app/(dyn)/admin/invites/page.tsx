import type { Metadata } from "next";
import { LocalTime } from "@/components/LocalTime";
import { adminEmails } from "@/lib/auth/admin";
import { requireAdmin } from "@/lib/auth/user";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { siteClosed } from "@/lib/invite/rules";
import { inviteReadable, inviteWritable, listInvites, listSignins, type InviteRow, type SigninRow } from "@/lib/invite/store";
import { inviteAddress, removeAddress } from "./actions";

/**
 * The invite list of the closed site (lib/invite): who may open it besides the admins of ADMIN_EMAILS, when each person last signed in, and a form
 * to invite or remove an address. Admin only (anyone else gets a 404); read from and written to Turso, never to DS1 or production.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Invite list", robots: { index: false, follow: false } };

type Query = { done?: string; email?: string };

export default async function InvitesPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireAdmin();
  const { done, email } = await searchParams;
  const { say } = await currentSpeaker();
  const closed = siteClosed(process.env);
  const readable = inviteReadable();

  let invites: InviteRow[] = [];
  let signins: SigninRow[] = [];
  let problem: string | null = null;
  if (readable) {
    try {
      [invites, signins] = await Promise.all([listInvites(), listSignins()]);
    } catch (e) {
      problem = e instanceof Error ? e.message : "error";
    }
  }
  const listed = new Set(invites.map((i) => i.email));
  const admins = adminEmails(process.env);
  const others = signins.filter((s) => !listed.has(s.email) && !admins.includes(s.email));
  const notice =
    done === "added" ? say("invite.admin.added", { email: email ?? "" })
    : done === "removed" ? say("invite.admin.removed", { email: email ?? "" })
    : done === "bad" ? say("invite.admin.badEmail")
    : done === "failed" ? say("invite.admin.unavailable", { reason: "Turso" })
    : null;

  return (
    <section className="head fade">
      <h1>{say("invite.admin.title")}</h1>
      <p className="lede">{say("invite.admin.lede")}</p>
      <p className="note">{closed ? say("invite.admin.state.closed") : say("invite.admin.state.open")}</p>
      {!readable ? <p className="note" role="alert">{say("invite.admin.noTurso")}</p> : null}
      {readable && !inviteWritable() ? <p className="note">{say("invite.admin.readOnly")}</p> : null}
      {problem ? <p className="note" role="alert">{say("invite.admin.unavailable", { reason: problem })}</p> : null}
      {notice ? <p className="note" role="status">{notice}</p> : null}

      <h2>{say("invite.admin.add")}</h2>
      <form action={inviteAddress} className="tk-filters">
        <label>
          {say("invite.admin.email")}{" "}
          <input type="text" inputMode="email" name="email" required maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </label>
        <label>
          {say("invite.admin.note")}{" "}
          <input type="text" name="note" maxLength={200} autoComplete="off" />
        </label>
        <button type="submit" className="signin-btn" disabled={!inviteWritable()}>{say("invite.admin.addGo")}</button>
      </form>

      <h2>{say("invite.admin.invited")} ({invites.length})</h2>
      {invites.length === 0 ? (
        <p className="note">{say("invite.admin.empty")}</p>
      ) : (
        <table className="runs-table">
          <thead>
            <tr>
              <th>{say("invite.admin.col.email")}</th>
              <th>{say("invite.admin.note")}</th>
              <th>{say("invite.admin.col.by")}</th>
              <th>{say("invite.admin.col.at")}</th>
              <th>{say("invite.admin.col.last")}</th>
              <th>{say("invite.admin.col.count")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.email}>
                <td>{i.email}</td>
                <td>{i.note ?? ""}</td>
                <td>{i.invited_by}</td>
                <td><LocalTime iso={i.invited_at} /></td>
                <td>{i.last_at ? <LocalTime iso={i.last_at} /> : say("invite.admin.never")}</td>
                <td>{i.signins}</td>
                <td>
                  <form action={removeAddress}>
                    <input type="hidden" name="email" value={i.email} />
                    <button type="submit" className="signin-btn" disabled={!inviteWritable()}>{say("invite.admin.remove")}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{say("invite.admin.admins")} ({admins.length})</h2>
      <p className="note">{say("invite.admin.adminsNote")}</p>
      <ul>
        {admins.map((a) => <li key={a}>{a}</li>)}
      </ul>

      {others.length > 0 ? (
        <>
          <h2>{say("invite.admin.others")} ({others.length})</h2>
          <p className="note">{say("invite.admin.othersNote")}</p>
          <table className="runs-table">
            <thead>
              <tr>
                <th>{say("invite.admin.col.email")}</th>
                <th>{say("invite.admin.col.last")}</th>
                <th>{say("invite.admin.col.count")}</th>
              </tr>
            </thead>
            <tbody>
              {others.map((s) => (
                <tr key={s.email}>
                  <td>{s.email}</td>
                  <td><LocalTime iso={s.last_at} /></td>
                  <td>{s.signins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
