import { Card, CardBody, CardHeader, Stat, StatBlock } from "@/components";
import type { AutonomyBand } from "@/lib/queries";

import {
  MIDDOT,
  formatCeiling,
  formatDate,
  type BandTally,
} from "./model";

/**
 * The band, stated as governance rather than as a setting.
 *
 * Three things have to be visible together for the band to mean anything:
 * the ceiling, how many rows on this screen fall each side of it, and who
 * carries the outcome. The derivation itself is the page banner, because it
 * is the part a reader is most likely to assume was chosen by someone in a
 * meeting.
 *
 * The last paragraph exists to stop a specific misreading. A row's own
 * rationale quotes an ACTION threshold -- the point at which the optimiser
 * calls a movement a shift rather than a hold. That is a different number
 * from the band, and a reader who conflates the two will think the agent is
 * acting on shifts it never sees.
 */

export type AgentBandCardProps = {
  band: AutonomyBand | null;
  ceilingPp: number | null;
  counts: BandTally;
  brandId: string;
};

export function AgentBandCard({
  band,
  ceilingPp,
  counts,
  brandId,
}: AgentBandCardProps) {
  const widened = formatDate(band?.last_widened_at);

  return (
    <Card>
      <CardHeader
        title="Agent band"
        subtitle={
          band
            ? `${band.agent_name} ${MIDDOT} ${brandId}${
                band.enabled ? "" : ` ${MIDDOT} disabled`
              }`
            : `No allocation band published for ${brandId}`
        }
      />
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
            <StatBlock className="mt-0">
              <Stat label="Executes under" value={formatCeiling(ceilingPp)} tone="orange" />
              <Stat label="Inside the band" value={counts.within} />
              <Stat label="Escalating" value={counts.escalates} />
            </StatBlock>

            <p className="mt-[14px] text-[12.5px] leading-[1.6] text-body">
              {band?.escalates_when}
            </p>
          </>
        )}

        <div className="mt-[12px] border-t border-rule pt-[11px] text-[11.5px] font-semibold leading-[1.6] text-mute">
          {band?.owner_employee_id ? (
            <>
              Accountable owner{" "}
              <span className="font-extrabold text-ink">
                {band.owner_employee_id}
              </span>
              . A person, not a team, so an agent action has a name against it
              in the ledger.
              <br />
            </>
          ) : null}
          {widened
            ? `Last widened ${widened}${band?.widened_by ? ` by ${band.widened_by}` : ""}.`
            : "Never widened. A widening is a recorded event, not a config change."}
        </div>

        <div className="mt-[11px] text-[11.5px] font-semibold leading-[1.6] text-mute">
          A row&apos;s rationale may quote an action threshold. That is a
          different number: it decides whether the optimiser calls a movement a
          shift at all. The band decides who is allowed to commit it.
        </div>
      </CardBody>
    </Card>
  );
}

export default AgentBandCard;
