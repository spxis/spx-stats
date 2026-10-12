import Link from "next/link";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { atUtc } from "@/lib/format";
import { getPlayerPaths } from "@/lib/playerLinks";
import { getStaff, type StaffMember } from "@/lib/roster";

/** The season's head coaches (managers in MLB), captains and alternate captains, when the archive has them; nothing otherwise. */
export async function TeamStaff({ lg, teamSeasonId }: { lg: string; teamSeasonId: number }) {
  const staff = await getStaff(teamSeasonId);
  if (!staff.length) return null;
  const { say, dt } = await currentSpeaker();
  const playerPath = await getPlayerPaths();
  const of = (role: StaffMember["role"]) => staff.filter((s) => s.role === role);
  const coaches = of("head_coach"), captains = of("captain"), alts = of("alternate_captain");
  const parts: [string, StaffMember[]][] = [
    [say(lg === "mlb" ? (coaches.length > 1 ? "staff.managers" : "staff.manager") : coaches.length > 1 ? "staff.headCoaches" : "staff.headCoach"), coaches],
    [say(captains.length > 1 ? "staff.captains" : "staff.captain"), captains],
    [say("staff.altCaptains"), alts],
  ];
  return (
    <p className="lede">
      {parts.filter(([, m]) => m.length).map(([label, members], i) => (
        <span key={label}>
          {i ? " · " : null}<strong>{label}:</strong>{" "}
          {members.map((m, j) => (
            <span key={`${j}-${m.name}`}>
              {j ? ", " : null}
              {m.id ? <Link href={playerPath(m.id, m.name, lg)} prefetch={false}>{m.name}</Link> : m.name}
              {members.length > 1 && m.firstOn && m.lastOn ? ` (${say("staff.dates", { from: dt.monthDayShort(atUtc(m.firstOn)), to: dt.monthDayShort(atUtc(m.lastOn)) })})` : null}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
