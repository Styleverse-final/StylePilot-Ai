import { Card, CardBody, CardHeader, Pill } from "@/components";
import type { AutonomyBand } from "@/lib/queries";

import { InfoIcon, UsersIcon } from "./icons";
import { MIDDOT, formatCeiling, type BandTally } from "./model";

/**
 * The band, stated as governance rather than as a setting.
 *
 * Three figures and a name: the ceiling, how many rows on this screen fall
 * each side of it, and who carries the outcome. The derivation itself is the
 * page banner, because it is the part a reader is most likely to assume was
 * chosen by someone in a meeting.
 *
 * WHAT THIS CARD USED TO CARRY, AND WHY IT NO LONGER DOES. It also held the
 * escalates_when prose split into a checklist, a callout reading "human
 * judgement where it matters", the accountable owner as a footnote, and a
 * paragraph distinguishing the band from the optimiser's ACTION threshold.
 * Every one of those was accurate. Together they turned a three-number
 * governance card into half a screen of reading placed above the board a
 * planner opened the page to work.
 *
 * The escalation rule is not lost so much as restated: "Escalating" counts
 * the rows on this board that fall outside the band, which is the form of the
 * question a planner is actually asking -- will this land on me? -- and it
 * answers it in a number rather than in conditions they have to apply
 * themselves. The full prose remains in autonomy_band.escalates_when and on
 * the governance screen, whose reader sets these bands for a living.
 *
 * THE ACCOUNTABLE OWNER SURVIVES, in the subtitle beside the agent name. It
 * is the one fact in the removed block that answers a question asked from
 * outside the team -- who is responsible when the agent is wrong -- and
 * naming a person costs three words rather than two lines.
 */

export type AgentBandCardProps = {
  band: AutonomyBand | null;
  ceilingPp: number | null;
  counts: BandTally;
  brandId: string;
};

/** One figure in the card's three-across rail. */
function BandStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "orange";
}) {
  return (
    <div>
      <div className="text-label font-bold text-mute">{label}</div>
      <div
        className={`mt-[3px] text-hero font-extrabold tabular-nums ${
          tone === "orange" ? "text-orange" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function AgentBandCard({
  band,
  ceilingPp,
  counts,
  brandId,
}: AgentBandCardProps) {

  return (
    <Card>
      <CardHeader
        actions={
          <>
            <span
              aria-hidden="true"
              className="text-mute"
              title="The ceiling, the counts and the escalation wording below are all read from the published band."
            >
              <InfoIcon />
            </span>
            <Pill variant={ceilingPp === null ? "grey" : "up"}>
              {ceilingPp === null
                ? "Nothing executes autonomously"
                : "Auto-executes within band"}
            </Pill>
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-[11px]">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-violetW text-violet"
          >
            <UsersIcon />
          </span>
          <div className="min-w-0">
            <h3 className="text-h3 font-extrabold text-ink">Agent band</h3>
            <div className="mt-[2px] truncate text-small font-semibold text-mute">
              {band
                ? `${band.agent_name} ${MIDDOT} ${brandId}${
                    band.owner_employee_id
                      ? ` ${MIDDOT} ${band.owner_employee_id}`
                      : ""
                  }${band.enabled ? "" : ` ${MIDDOT} disabled`}`
                : `No allocation band published for ${brandId}`}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {ceilingPp === null ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No enabled allocation band is published for this brand, so nothing
            on this board executes autonomously. Every movement below is a
            decision a person has to commit, which is the correct behaviour
            when the governing threshold is missing rather than merely small.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-[14px]">
              <BandStat
                label="Executes under"
                value={formatCeiling(ceilingPp)}
                tone="orange"
              />
              <BandStat label="Inside the band" value={String(counts.within)} />
              <BandStat label="Escalating" value={String(counts.escalates)} />
            </div>

          </>
        )}

      </CardBody>
    </Card>
  );
}

export default AgentBandCard;
