import { Card, CardBody, CardHeader, Pill } from "@/components";
import type { AutonomyBand } from "@/lib/queries";

import { ArrowRightIcon, InfoIcon, ShieldIcon, UsersIcon } from "./icons";
import {
  MIDDOT,
  escalationClauses,
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
 * THE ESCALATION PANEL IS A LIST BECAUSE IT IS A CHECKLIST. A planner reading
 * this card is asking one question -- "will the agent commit my row, or will
 * it land on me?" -- and a paragraph makes them hold every condition in their
 * head while they answer it. The items are verbatim slices of the band's own
 * escalates_when column, split by escalationClauses(); when the prose does not
 * enumerate anything the card keeps the paragraph rather than manufacturing
 * bullets out of one sentence.
 *
 * IT IS HEADED "WHEN IT ESCALATES" AND NOT "ESCALATION TRIGGERS", which is a
 * smaller distinction than it looks. escalates_when is one prose column and
 * the brands populate it with more than a list of triggers -- this brand's
 * second sentence is the rule a future WIDENING of the band has to follow.
 * Under a heading promising triggers, that sentence reads as one, and a
 * planner would come away thinking an override rate escalates their row. The
 * column's own name is the honest heading, and it covers every sentence the
 * column actually holds.
 *
 * THE CLOSING CALLOUT IS NOT DECORATION EITHER. Everything above it is the
 * machinery of what the agent does alone; the reason the ceiling is set where
 * it is, is that the rows above it are the ones worth a person's judgement.
 * Saying so is the difference between a governance card and a settings panel.
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
  const widened = formatDate(band?.last_widened_at);
  const clauses = escalationClauses(band?.escalates_when);

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
                    band.enabled ? "" : ` ${MIDDOT} disabled`
                  }`
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

            {clauses.length === 0 ? (
              <p className="mt-[14px] text-[12.5px] leading-[1.6] text-body">
                {band?.escalates_when}
              </p>
            ) : (
              <div className="mt-[15px] grid grid-cols-[1.25fr_1fr] gap-[12px] max-[1180px]:grid-cols-1">
                <div className="rounded-inner bg-shell px-[14px] py-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <span aria-hidden="true" className="text-violet">
                      <ShieldIcon />
                    </span>
                    <span className="text-[12.5px] font-extrabold text-ink">
                      When it escalates
                    </span>
                  </div>
                  <ul className="mt-[9px] list-none">
                    {clauses.map((clause) => (
                      <li
                        key={clause}
                        className="flex gap-[8px] py-[3px] text-[11.5px] font-semibold leading-[1.55] text-body"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[6px] h-[4px] w-[4px] flex-none rounded-full bg-orange"
                        />
                        <span>{clause}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center gap-[10px] rounded-inner bg-peach px-[14px] py-[12px]">
                  <span aria-hidden="true" className="flex-none text-orange">
                    <ArrowRightIcon />
                  </span>
                  <span className="text-[12.5px] font-extrabold leading-[1.4] text-ink">
                    Human judgement
                    <br />
                    where it matters.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-[13px] border-t border-rule pt-[11px] text-[11.5px] font-semibold leading-[1.6] text-mute">
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
