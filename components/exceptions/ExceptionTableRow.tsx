"use client";

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
 * Collapsed, this row is a single line: severity, series, action, value,
 * cover against its threshold, and the FIRST CLAUSE of the rationale. That is
 * enough to triage. Everything the card showed is still here, one click away,
 * and nothing was deleted to make room.
 *
 * THE DECISION CONTROLS MOVED INTO THE EXPANSION ON PURPOSE. Committing a buy
 * or dismissing a risk is not a thing to do while skimming, and putting an
 * Approve button on every one of twenty visible rows invites exactly that. You
 * open the row you mean to act on, and the reasoning is in front of you when
 * you do.
 */

const MIDDOT = String.fromCharCode(0x00b7);

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
 * The first clause of the rationale.
 *
 * Cut at the first sentence boundary that is not a decimal point -- the same
 * rule the copilot's sentence splitter needed, for the same reason: cutting
 * "19.7 weeks" into "19." destroys the number that made the row worth reading.
 */
function firstClause(text: string): { head: string; rest: string } {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== ";") continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (ch === "." && prev >= "0" && prev <= "9" && next >= "0" && next <= "9") {
      continue;
    }
    if (i > 24) {
      return { head: text.slice(0, i + 1), rest: text.slice(i + 1).trim() };
    }
  }
  return { head: text, rest: "" };
}

export type ExceptionTableRowProps = { row: ExceptionView };

export function ExceptionTableRow({ row }: ExceptionTableRowProps) {
  const [open, setOpen] = useState(false);

  const severityClass =
    row.severity === "HIGH"
      ? "bg-red"
      : row.severity === "MEDIUM"
        ? "bg-amber"
        : "bg-rule2";

  const clause = row.rationale ? firstClause(row.rationale) : null;

  return (
    <>
      <tr
        className="border-b border-rule align-middle hover:bg-shell transition-colors duration-[120ms]"
        data-exception-row=""
      >
        <td className="py-[7px] pr-[8px] pl-[14px] w-[10px]">
          <span
            aria-hidden="true"
            className={`block h-[8px] w-[8px] rounded-full ${severityClass}`}
          />
          <span className="sr-only">
            {row.severity === null ? "Severity not stated" : `Severity ${row.severity}`}
          </span>
        </td>

        <td className="py-[7px] pr-[10px] whitespace-nowrap text-copy font-extrabold text-ink">
          {row.category}
          <span className="font-semibold text-mute"> {MIDDOT} </span>
          {row.channel}
          <span className="font-semibold text-mute"> {MIDDOT} </span>
          {row.region}
        </td>

        <td className="py-[7px] pr-[10px] whitespace-nowrap">
          <Pill variant={row.isStockout ? "down" : "amber"}>{row.actionLabel}</Pill>
          {row.status === null ? null : (
            <span className="ml-[5px]">
              <Pill variant={STATUS_VARIANT[row.status]}>
                {STATUS_LABEL[row.status]}
              </Pill>
            </span>
          )}
        </td>

        <td className="py-[7px] pr-[10px] whitespace-nowrap text-right text-copy font-extrabold text-ink tabular">
          {formatInr(row.valueAtStakeInr)}
        </td>

        <td className="py-[7px] pr-[10px] whitespace-nowrap text-right text-copy text-body tabular">
          {formatWeeks(row.projectedWos)}
          {row.threshold === null ? null : (
            <span className="text-mute">
              {" / "}
              {formatWeeks(row.threshold.weeks)}
            </span>
          )}
        </td>

        <td className="py-[7px] pr-[10px] text-small text-body leading-[1.4]">
          <span className="line-clamp-1">{clause ? clause.head : ""}</span>
        </td>

        <td className="py-[7px] pr-[14px] whitespace-nowrap text-right">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="rounded-pill bg-cream px-[9px] py-[2px] text-[10.5px] font-extrabold text-body transition-colors duration-[120ms] hover:bg-peach"
          >
            {open ? "close" : row.status === null ? "decide" : "detail"}
          </button>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-rule bg-shell">
          <td colSpan={7} className="px-[14px] py-[13px]">
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
            </div>

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
