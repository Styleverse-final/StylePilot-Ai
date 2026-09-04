import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import type { Reallocation } from "./data";
import { ARROW, count, fte, pct } from "./format";
import {
  REDEPLOYMENT_LEDGER,
  REDEPLOYMENT_SOURCE,
  REDEPLOYMENT_TOTAL_FTE,
  ROLES_REMOVED,
  type RedeploymentRow,
} from "./premise";

/**
 * THE REDEPLOYMENT LEDGER -- A COMMITMENT, PRINTED AS ONE.
 *
 * Every figure in the table below is a case premise. There is no
 * redeployment table in this schema, no FTE column anywhere, and nothing
 * that records a destination for freed capacity; FINAL_SPEC.md lists the 146
 * under a heading marked "measured", and it is not measured here. Saying so
 * costs the panel some authority and buys back the only thing that matters,
 * which is that a reader can tell which numbers on this screen they could go
 * and check.
 *
 * So the panel does two things at once. It prints the commitment -- four
 * named destinations, zero roles removed -- because a zero-layoff pledge
 * with no destination is a slogan. And it prints, beside it, the FTE figure
 * the tables DO support: headcount from v_time_reallocation, the automatable
 * shares from the task audit, the measured agent-execution rate from
 * v_touchless_rate. The two do not agree, the gap is stated in the open, and
 * the automation rate that would close it is named so the commitment can be
 * argued with rather than merely believed.
 *
 * The two decompositions are NOT the same decomposition. The ledger's four
 * categories are the case's own and do not map onto the six activities in
 * the view -- "reporting analysis" and "report assembly" are one column
 * there and two rows here. Only the totals are comparable, and the panel
 * says so rather than inviting a row-by-row reconciliation that would not
 * hold.
 */

function ledgerColumns(): Column<RedeploymentRow>[] {
  return [
    {
      key: "from",
      header: "From",
      cell: (row) => <span className="font-bold text-ink">{row.from}</span>,
    },
    {
      key: "fte",
      header: "FTE",
      numeric: true,
      cell: (row) => row.fte.toFixed(0),
      headerClassName: "w-[70px]",
    },
    {
      key: "to",
      header: "To",
      cell: (row) => (
        <div>
          <div className="font-bold text-ink">
            <span aria-hidden="true" className="mr-[6px] text-mute">
              {ARROW}
            </span>
            {row.to}
          </div>
          <p className="mt-[3px] max-w-[64ch] text-small leading-[1.55] text-mute">
            {row.because}
          </p>
        </div>
      ),
    },
  ];
}

export function RedeploymentLedger({
  reallocation,
}: {
  reallocation: Reallocation;
}) {
  const automatable = reallocation.automatableFte;
  const freed = reallocation.freedFte;
  const requiredRate =
    automatable > 0 ? REDEPLOYMENT_TOTAL_FTE / automatable : null;
  const reachable = requiredRate !== null && requiredRate <= 1;

  return (
    <Card>
      <CardHeader
        title="Redeployment"
        subtitle="No role removed. Capacity moves."
        actions={
          <>
            <Pill variant="up">{ROLES_REMOVED} roles cut</Pill>
            <Pill variant="amber">Case premise</Pill>
          </>
        }
      />

      <CardBody className="pb-[6px]">
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          Every figure in this table is a premise of the case study, not a
          reading: {REDEPLOYMENT_SOURCE}. It is on the screen because the
          commitment is the point of the programme and a commitment with no
          named destination is a slogan &mdash; but it is marked, because a
          premise printed in the same weight as a measurement is how a
          governance argument gets lost. The panel underneath is the same
          question answered from the tables.
        </p>
      </CardBody>

      <DataTable
        rows={REDEPLOYMENT_LEDGER}
        columns={ledgerColumns()}
        rowKey={(row) => row.from}
        caption="Redeployment ledger: where freed capacity is committed"
      />

      <div className="flex flex-wrap items-baseline justify-between gap-[10px] border-t border-rule px-[20px] py-[12px]">
        <span className="text-small font-bold text-mute">
          Committed by the case
        </span>
        <span className="text-[19px] font-extrabold text-ink tabular">
          {REDEPLOYMENT_TOTAL_FTE} FTE
          <span className="ml-[8px] text-small font-bold text-mute">
            across {REDEPLOYMENT_LEDGER.length} destinations, {ROLES_REMOVED}{" "}
            reductions
          </span>
        </span>
      </div>

      <CardBody className="border-t border-rule">
        <h4 className="text-[13px] font-extrabold text-ink">
          The same question, answered from the tables
        </h4>
        <p className="mt-[4px] max-w-[92ch] text-small leading-[1.6] text-body">
          Headcount and the split of the week come from v_time_reallocation,
          the automatable shares from the task audit, and the automation rate
          from v_touchless_rate. Multiplied out across the{" "}
          {count(reallocation.planners)} planners readable in your scope, the
          rows support{" "}
          <b className="tabular text-ink">{fte(automatable)} FTE</b> of
          automatable work in total, of which the measured agent-execution rate
          of <b className="tabular text-ink">{pct(reallocation.realisedAutomation, 1)}</b>{" "}
          actually frees <b className="tabular text-ink">{fte(freed)} FTE</b>{" "}
          today.
        </p>
        <p className="mt-[8px] max-w-[92ch] text-small leading-[1.6] text-body">
          {requiredRate === null ? (
            <>
              With no time-split rows readable there is nothing to compare the
              committed {REDEPLOYMENT_TOTAL_FTE} FTE against, so this screen
              reports the commitment and no derived figure at all rather than a
              comparison with one side missing.
            </>
          ) : reachable ? (
            <>
              So the ledger commits{" "}
              <b className="tabular text-ink">{REDEPLOYMENT_TOTAL_FTE} FTE</b>{" "}
              and the tables support{" "}
              <b className="tabular text-ink">{fte(freed)}</b> at today&apos;s rate
              &mdash; a gap of{" "}
              <b className="tabular text-ink">
                {fte(Math.max(0, REDEPLOYMENT_TOTAL_FTE - freed))} FTE
              </b>
              . It closes when the agent-execution rate reaches{" "}
              <b className="tabular text-ink">{pct(requiredRate, 0)}</b> of
              in-scope recommendations, up from{" "}
              {pct(reallocation.realisedAutomation, 1)}. That is a testable
              condition on a number this product already measures every time
              the agents run, which is a better thing to hand a board than a
              figure nobody can move.
            </>
          ) : (
            <>
              The committed {REDEPLOYMENT_TOTAL_FTE} FTE exceeds the{" "}
              <b className="tabular text-ink">{fte(automatable)} FTE</b> of
              automatable work the rows in your scope contain at ALL, so no
              agent-execution rate reaches it. That is a real disagreement
              between the case and the data rather than a rounding difference,
              and it is stated here rather than resolved by quietly dropping
              one of the two numbers.
            </>
          )}
        </p>
        <p className="mt-[8px] max-w-[92ch] text-small leading-[1.6] text-mute">
          The two decompositions are not comparable row by row. The ledger&apos;s
          four categories are the case&apos;s own; the view carries six activities,
          and reporting analysis and report assembly both land inside one of
          them. Only the totals line up against each other, and only loosely,
          which is why this panel compares totals and stops.
        </p>
      </CardBody>
    </Card>
  );
}

export default RedeploymentLedger;
