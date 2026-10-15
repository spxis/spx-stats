import { SoccerGroupTable, type GroupLine } from "@/components/SoccerGroupTable";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Standing } from "@/lib/soccer";
import { groupName, stageName } from "@/lib/soccerView";
import "./soccer.css";

/** The group tables of a tournament, one block per stage (a first group stage, a second one, a final round), each group a small table. */
export async function SoccerGroups({ standings }: { standings: Standing[] }) {
  const { say } = await currentSpeaker();
  const stages = [...new Set(standings.map((s) => s.stage_number))].sort((a, b) => a - b);
  return (
    <>
      {stages.map((st) => {
        const inStage = standings.filter((s) => s.stage_number === st);
        const groups = [...new Set(inStage.map((s) => s.group_name))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
        return (
          <div key={st}>
            {stages.length > 1 ? <h3>{stageName(say, inStage[0].stage_key)}</h3> : null}
            <div className="sc-groups">
              {groups.map((g) => (
                <div className="sc-group" key={g}>
                  <h3>{groupName(say, g)}</h3>
                  <SoccerGroupTable rows={inStage.filter((s) => s.group_name === g).map((s): GroupLine => [
                    s.position, s.team_slug, s.team, s.flag_code ?? null, s.played, s.wins, s.draws, s.losses, s.goals_for, s.goals_against, s.points, s.advanced ? 1 : 0,
                  ])} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="note">{say("wc.advancedNote")}</p>
    </>
  );
}
