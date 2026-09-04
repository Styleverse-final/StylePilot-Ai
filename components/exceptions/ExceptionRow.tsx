"use client";

import { Pill, type PillVariant } from "../Pill";
import { Stat, StatBlock } from "../StatBlock";
import { DecisionControls } from "./DecisionControls";
import {
  DASH,
  MIDDOT,
  formatInr,
  formatTimestamp,
  formatUnits,
  formatWeeks,
} from "./format";
import type { ExceptionView } from "./types";
import type { CommittedDecisionStatus } from "@/lib/queries";

/**
 * One exception, laid out as `.exc` from the visual specification: a title
 * line carrying the severity dot, the series, the action pill and the money
 * on the right; the rationale; then the numbers and the decision controls.
 *
 * The rationale is printed exactly as recommend.py composed it. It is
 * already a sentence with the real availability, the real weeks of cover and
 * the real threshold in it, so paraphrasing it here would only introduce a
 * second version of a number that already exists. The same applies to the
 * threshold basis, which is shown as the title of the threshold stat.
 */

const STATUS_VARIANT: Record<CommittedDecisionStatus, PillVariant> = {
  APPROVED: "up",
  MODIFIED: "violet",
  REJECTED: "down",
};

const STATUS_LABEL: Record<CommittedDecisionStatus, string> = {
  APPROVED: "Approved",
  MODIFIED: "Modified",
  REJECTED: "Rejected",
};

export type ExceptionRowProps = {
  row: ExceptionView;
};

export function ExceptionRow({ row }: ExceptionRowProps) {
  const severityClass =
    row.severity === "HIGH"
      ? "bg-red"
      : row.severity === "MEDIUM"
        ? "bg-amber"
        : "bg-rule2";

  return (
    <div className="px-[20px] py-[16px] border-b border-rule last:border-b-0 hover:bg-shell transition-colors duration-[120ms]">
      <div className="flex flex-wrap items-center gap-[10px] mb-[8px]">
        <span
          aria-hidden="true"
          className={`w-[8px] h-[8px] rounded-full flex-none ${severityClass}`}
        />
        <span className="sr-only">
          {row.severity === null ? "Severity not stated" : `Severity ${row.severity}`}
        </span>

        <span className="text-[12.5px] font-extrabold text-ink">
          {row.category}
          <span className="font-semibold text-mute"> {MIDDOT} </span>
          {row.channel}
          <span className="font-semibold text-mute"> {MIDDOT} </span>
          {row.region}
        </span>

        <Pill variant={row.isStockout ? "down" : "amber"}>{row.actionLabel}</Pill>

        {row.status === null ? null : (
          <Pill variant={STATUS_VARIANT[row.status]}>
            {STATUS_LABEL[row.status]}
          </Pill>
        )}

        <span className="ml-auto text-[14px] font-extrabold text-ink tabular-nums">
          {formatInr(row.valueAtStakeInr)}
        </span>
      </div>

      {row.rationale === null ? null : (
        <p
          className="text-[12.5px] text-body leading-[1.6]"
          style={{ maxWidth: "88ch" }}
        >
          {row.rationale}
        </p>
      )}

      {row.status === null ? null : (
        <p className="mt-[8px] text-[11.5px] font-semibold text-mute leading-[1.6] max-w-[88ch]">
          {STATUS_LABEL[row.status]} by{" "}
          <span className="text-ink font-bold">
            {row.accountablePlanner ?? "an unnamed actor"}
          </span>{" "}
          on {formatTimestamp(row.decidedAt)}
          {row.acceptedValue === null
            ? ""
            : `, committing ${formatInr(row.acceptedValue)}`}
          {row.overrideReason === null ? "." : `. "${row.overrideReason}"`}{" "}
          The decision log is append-only, so a change is a new row beside
          this one.
        </p>
      )}

      <StatBlock>
        <Stat label="COVER" value={formatWeeks(row.projectedWos)} />

        {row.threshold === null ? null : (
          <div title={row.threshold.basis ?? undefined}>
            <div className="text-[10.5px] text-mute font-bold">
              {row.threshold.label}
            </div>
            <div className="text-[14px] font-extrabold mt-[1px] text-ink tabular-nums">
              {formatWeeks(row.threshold.weeks)}
            </div>
          </div>
        )}

        <Stat label="UNITS AT RISK" value={formatUnits(row.unitsAtRisk)} />

        <div className="ml-auto">
          {row.id === null ? (
            <p className="text-[11.5px] font-semibold text-mute max-w-[38ch] leading-[1.55]">
              This row carries no recommendation id, so no decision can be
              recorded against it.
            </p>
          ) : (
            <DecisionControls
              recommendationId={row.id}
              valueAtStakeInr={row.valueAtStakeInr}
              alreadyDecided={row.status !== null}
            />
          )}
        </div>
      </StatBlock>

      {row.threshold !== null && row.threshold.basis === null ? (
        <p className="mt-[6px] text-[10.5px] font-semibold text-mute">
          {DASH} no derivation is recorded for this threshold.
        </p>
      ) : null}
    </div>
  );
}

export default ExceptionRow;
