"use client";

import { firstClause } from "@/components/clause";
import { useState } from "react";

import { Pill, type PillVariant } from "../Pill";
import { DecisionControls } from "./DecisionControls";
import {
  formatInr,
  formatTimestamp,
  formatUnits,
  formatWeeks,
} from "./format";
import type { ExceptionView } from "./types";
import type { CommittedDecisionStatus } from "@/lib/queries";

/**
 * One exception, as a TABLE ROW rather than a card.
 *
 * WHY THIS REPLACED THE CARD
 * --------------------------
 * The card rendered every attribute of every exception at once: a header line,
 * the full rationale paragraph, a four-stat block and the decision controls,
 * inside 16px of vertical padding. About 150px a row, so roughly six fitted on
 * a 1080p screen. A queue you can see six of is not a queue, it is a stack --
 * you cannot tell whether the eleventh item matters more than the second
 * without scrolling past ten.
 *
 * Collapsed, this row is a single line: rank, severity, series, action, value,
 * cover against its threshold, and the FIRST CLAUSE of the rationale. That is
 * enough to triage. Everything the card showed is still here, one click away,
 * and nothing was deleted to make room.
 *
 * THE RANK IS THE ARGUMENT OF THE SCREEN, so it is printed rather than left to
 * be counted off the scrollbar. It is a position in the list as currently
 * ordered and filtered -- not an identifier and not a severity grade -- which
 * is why the queue derives it on every render instead of the row carrying it.
 *
 * THE DECISION CONTROLS MOVED INTO THE EXPANSION ON PURPOSE. Committing a buy
 * or dismissing a risk is not a thing to do while skimming, and putting an
 * Approve button on every one of twenty visible rows invites exactly that. You
 * open the row you mean to act on, and the reasoning is in front of you when
 * you do.
 */

const MIDDOT = String.fromCharCode(0x00b7);
const ARROW = String.fromCharCode(0x2192);

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

/**
 * Two digits to 99, then as many as the number needs. The padding holds the
 * column on one width for a queue of the size a queue usually is; it never
 * truncates, so a hundredth row still reads as the hundredth.
 */
function formatRank(rank: number): string {
  return rank < 10 ? `0${rank}` : String(rank);
}

export type ExceptionTableRowProps = {
  row: ExceptionView;
  /** 1-based position in the list as currently ordered and filtered. */
  rank: number;
  /**
   * True for the one row a ?rec= deep link named. It seeds the open state and
   * nothing more: the reader closes it with the same button as any other row,
   * and every other row still starts collapsed.
   */
  initialOpen?: boolean;
};

export function ExceptionTableRow({
  row,
  rank,
  initialOpen = false,
}: ExceptionTableRowProps) {
  const [open, setOpen] = useState(initialOpen);

  const severityClass =
    row.severity === "HIGH"
      ? "bg-red"
      : row.severity === "MEDIUM"
        ? "bg-amber"
        : "bg-rule2";

  const clause = row.rationale ? firstClause(row.rationale) : null;

  /*
    WHAT THE MONEY IS.

    A row states one INR figure, a unit count and a cover reading, and never
    says what the rupees are the rupees OF. These three say it, and not one of
    them is a new measurement: each is arithmetic over figures already on the
    row -- units at risk, the distance past the threshold printed in the cover
    cell -- times a rate readPlanEconomics() resolved for the brand. They are
    labelled DERIVED on screen because they are formed here rather than stored
    on the recommendation, and any missing input makes the figure a dash. A
    plausible product of a guessed rate is the one thing worse than a dash.

    The carry cost is charged over row.breachWeeks, which for an overstock row
    IS projected cover minus the ceiling -- the same subtraction, taken from
    the same function the queue sorts by, so the weeks being charged for are
    the weeks the row says it is over by.
  */
  const units = row.unitsAtRisk;
  const markdownExposureInr =
    units === null || row.clearanceCostPerUnitInr === null
      ? null
      : units * row.clearanceCostPerUnitInr;
  // The weeks past the ceiling are the weeks there is anything to charge for.
  // Where the distance is not positive there are none, and a negative product
  // would be a carry cost that pays the business back for holding stock; that
  // is a dash, and the cover cell beside it already says the row is clear of
  // its ceiling.
  const carryCostInr =
    units === null ||
    row.holdingCostPerUnitWeekInr === null ||
    row.breachWeeks === null ||
    row.breachWeeks <= 0
      ? null
      : units * row.holdingCostPerUnitWeekInr * row.breachWeeks;
  const lostMarginInr =
    row.valueAtStakeInr === null || row.grossMargin === null
      ? null
      : row.valueAtStakeInr * row.grossMargin;

  // The provenance line is worth a line only where there is a figure whose
  // provenance it explains; beside three dashes it would be an explanation of
  // nothing.
  const hasDerived = row.isStockout
    ? lostMarginInr !== null
    : markdownExposureInr !== null || carryCostInr !== null;

  return (
    <>
      <tr
        className={`border-b border-rule align-middle transition-colors duration-[120ms] ${
          open ? "bg-shell" : "hover:bg-shell"
        }`}
        data-exception-row=""
      >
        <td className="py-[9px] pl-[18px] pr-[10px] whitespace-nowrap text-small font-extrabold tabular text-mute">
          {formatRank(rank)}
        </td>

        <td className="py-[9px] pr-[12px] whitespace-nowrap text-copy font-extrabold text-ink">
          <span className="flex items-center gap-[9px]">
            <span
              aria-hidden="true"
              className={`block h-[8px] w-[8px] flex-none rounded-full ${severityClass}`}
            />
            <span className="sr-only">
              {row.severity === null
                ? "Severity not stated"
                : `Severity ${row.severity}`}
            </span>
            <span>
              {row.category}
              <span className="font-semibold text-mute"> {MIDDOT} </span>
              {row.channel}
              <span className="font-semibold text-mute"> {MIDDOT} </span>
              {row.region}
            </span>
          </span>
        </td>

        <td className="py-[9px] pr-[12px] whitespace-nowrap">
          <Pill variant={row.isStockout ? "down" : "amber"}>
            {row.actionLabel}
          </Pill>
          {row.status === null ? null : (
            <span className="ml-[5px]">
              <Pill variant={STATUS_VARIANT[row.status]}>
                {STATUS_LABEL[row.status]}
              </Pill>
            </span>
          )}
        </td>

        <td className="py-[9px] pr-[12px] whitespace-nowrap text-right text-base font-extrabold text-ink tabular">
          {formatInr(row.valueAtStakeInr)}
        </td>

        <td className="py-[9px] pr-[12px] whitespace-nowrap text-right text-copy text-body tabular">
          {formatWeeks(row.projectedWos)}
          {row.threshold === null ? null : (
            <span className="text-mute">
              {" / "}
              {formatWeeks(row.threshold.weeks)}
            </span>
          )}
          {/*
            THE DISTANCE, NOT JUST THE TWO ENDS OF IT. A reader can do the
            subtraction -- but the queue offers an ordering BY exactly this
            distance, and an ordering nobody can read off the rows is one they
            have to take on trust. So it goes as a second line inside the cell
            the two ends already occupy: no new column, and the distance sits
            against the pair it was measured from rather than across the table
            from them.
          */}
          {/*
            THE SIGN IS NOT DECORATION. Not every row is past its threshold: a
            stockout can be raised because recent availability was low enough
            that the series sold short while demand was still rising, and that
            row's projected cover can sit comfortably above its floor. The
            distance is then negative, and "-1.4w past the floor" would be a
            sentence saying the opposite of what happened. It says clear of it
            instead, which is both true and the reason to read the rationale.
          */}
          {row.breachWeeks === null ? null : (
            <span className="mt-[2px] block text-[10.5px] font-semibold text-mute">
              {row.breachWeeks > 0
                ? `${formatWeeks(row.breachWeeks)} past the `
                : `${formatWeeks(Math.abs(row.breachWeeks))} clear of the `}
              {row.isStockout ? "floor" : "ceiling"}
            </span>
          )}
        </td>

        <td className="py-[9px] pr-[12px] text-small text-body leading-[1.4]">
          <span className="line-clamp-1">{clause ? clause.head : ""}</span>
        </td>

        <td className="py-[9px] pr-[18px] whitespace-nowrap text-right">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-[6px] rounded-pill bg-cream px-[11px] py-[4px] text-[10.5px] font-extrabold text-body transition-colors duration-[120ms] hover:bg-peach hover:text-orangeD"
          >
            {open ? "close" : row.status === null ? "decide" : "detail"}
            <span
              aria-hidden="true"
              className={`text-[11px] leading-none transition-transform duration-[120ms]${
                open ? " rotate-90" : ""
              }`}
            >
              {ARROW}
            </span>
          </button>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-rule bg-shell">
          <td colSpan={7} className="px-[18px] py-[13px]">
            {row.rationale === null ? null : (
              <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
                {row.rationale}
              </p>
            )}

            {row.threshold?.basis ? (
              <p className="mt-[7px] max-w-[92ch] text-small font-semibold leading-[1.55] text-mute">
                <b className="text-ink">{row.threshold.label}:</b>{" "}
                {row.threshold.basis}
              </p>
            ) : null}

            <div className="mt-[9px] flex flex-wrap items-center gap-x-[22px] gap-y-[7px]">
              <Stat label="COVER" value={formatWeeks(row.projectedWos)} />
              {row.threshold === null ? null : (
                <Stat
                  label={row.threshold.label}
                  value={formatWeeks(row.threshold.weeks)}
                />
              )}
              <Stat label="UNITS AT RISK" value={formatUnits(row.unitsAtRisk)} />
              {row.isStockout ? (
                <Stat
                  label="LOST MARGIN (DERIVED)"
                  value={formatInr(lostMarginInr)}
                />
              ) : (
                <>
                  <Stat
                    label="MARKDOWN EXPOSURE (DERIVED)"
                    value={formatInr(markdownExposureInr)}
                  />
                  <Stat
                    label="CARRY COST PAST CEILING (DERIVED)"
                    value={formatInr(carryCostInr)}
                  />
                </>
              )}
            </div>

            {hasDerived ? (
              <p className="mt-[7px] max-w-[92ch] text-small font-semibold leading-[1.55] text-mute">
                {row.isStockout
                  ? "Derived on this screen, not stored on the recommendation: the value at stake taken at the brand's gross margin."
                  : "Derived on this screen, not stored on the recommendation. Both rates are brand-level, so a category whose own selling price sits above or below the brand's is priced against the brand's. The carry figure charges every excess unit for the whole distance past the ceiling, which makes it a ceiling on the cost rather than an expected one -- the same weeks-of-supply reading says the pile depletes as it goes."}
              </p>
            ) : null}

            {row.status === null ? null : (
              <p className="mt-[9px] max-w-[92ch] text-small font-semibold leading-[1.6] text-mute">
                {STATUS_LABEL[row.status]} by{" "}
                <span className="font-bold text-ink">
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

            <div className="mt-[11px]">
              {row.id === null ? (
                <p className="max-w-[46ch] text-small font-semibold leading-[1.55] text-mute">
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
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold text-mute">{label}</div>
      <div className="mt-[1px] text-[13.5px] font-extrabold text-ink tabular">
        {value}
      </div>
    </div>
  );
}

export default ExceptionTableRow;
