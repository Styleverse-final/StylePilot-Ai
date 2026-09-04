"use client";

import { useMemo, useState } from "react";

import { Card } from "../Card";
import { Chip, ChipRow } from "../Chip";
import { ExceptionTableRow } from "./ExceptionTableRow";
import { formatCount } from "./format";
import type { ExceptionView } from "./types";

/**
 * The exception queue: the filter chips and the ranked list.
 *
 * The order is the argument of the screen. Rows arrive already sorted by
 * value at stake, descending, straight from getExceptions(), so a planner
 * works down the list and stops when the remaining money stops justifying
 * the attention. Filtering never re-sorts.
 *
 * Filtering is local because the rows the planner may see are already in
 * hand: RLS decided the set on the server, and narrowing a set of rows in
 * the browser cannot widen it. A chip is a lens on what was fetched, never a
 * second query with a different scope.
 *
 * The chip counts are counted from those same rows, so a planner scoped to
 * one region sees their own totals rather than a portfolio number they
 * cannot act on.
 */

type Filter = "ALL" | "STOCKOUT" | "OVERSTOCK" | "HIGH" | "OPEN";

export type ExceptionQueueProps = {
  rows: readonly ExceptionView[];
  /** Names the scope in the empty-state sentence, e.g. "SpeedStyle". */
  scopeLabel: string;
};

function matches(row: ExceptionView, filter: Filter): boolean {
  switch (filter) {
    case "STOCKOUT":
      return row.isStockout;
    case "OVERSTOCK":
      return !row.isStockout;
    case "HIGH":
      return row.severity === "HIGH";
    case "OPEN":
      return row.status === null;
    default:
      return true;
  }
}

export function ExceptionQueue({ rows, scopeLabel }: ExceptionQueueProps) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(
    () => ({
      ALL: rows.length,
      STOCKOUT: rows.filter((r) => r.isStockout).length,
      OVERSTOCK: rows.filter((r) => !r.isStockout).length,
      HIGH: rows.filter((r) => r.severity === "HIGH").length,
      OPEN: rows.filter((r) => r.status === null).length,
    }),
    [rows],
  );

  const visible = useMemo(
    () => rows.filter((row) => matches(row, filter)),
    [rows, filter],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <div className="px-[20px] py-[18px]">
          <div className="text-[13px] font-extrabold text-ink mb-[3px]">
            No exceptions are in your scope.
          </div>
          <p
            className="text-[12.5px] text-body leading-[1.6]"
            style={{ maxWidth: "88ch" }}
          >
            Nothing is raised against {scopeLabel} for the categories, channels
            and regions you own. That is a real answer, not a failed load: the
            queue is read with your own session, so it shows what you are
            accountable for and nothing else. A planner scoped to one region
            can legitimately see an empty list while the portfolio has plenty.
          </p>
        </div>
      </Card>
    );
  }

  const chips: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: "ALL", label: `All ${formatCount(counts.ALL)}` },
    { key: "STOCKOUT", label: `Stockout ${formatCount(counts.STOCKOUT)}` },
    { key: "OVERSTOCK", label: `Overstock ${formatCount(counts.OVERSTOCK)}` },
    { key: "HIGH", label: `High ${formatCount(counts.HIGH)}` },
    { key: "OPEN", label: `Undecided ${formatCount(counts.OPEN)}` },
  ];

  return (
    <>
      <ChipRow>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            pressed={filter === chip.key}
            onPressedChange={() => setFilter(chip.key)}
          >
            {chip.label}
          </Chip>
        ))}
        <span className="ml-auto self-center text-[11.5px] font-semibold text-mute">
          Ranked by value at stake
        </span>
      </ChipRow>

      <Card>
        {visible.length === 0 ? (
          <div className="px-[20px] py-[18px] text-[12.5px] text-body leading-[1.6]">
            No row in your scope matches that filter. The other chips still
            have rows behind them.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/*
                A real header row. The card layout had none, so every row had
                to re-label its own numbers -- which is a large part of why a
                row was 150px tall. Labelling once at the top is what buys the
                density.
              */}
              <thead>
                <tr className="border-b border-rule text-label font-extrabold text-mute">
                  <th className="py-[7px] pl-[14px] pr-[8px] text-left w-[10px]">
                    <span className="sr-only">Severity</span>
                  </th>
                  <th className="py-[7px] pr-[10px] text-left">Series</th>
                  <th className="py-[7px] pr-[10px] text-left">Action</th>
                  <th className="py-[7px] pr-[10px] text-right whitespace-nowrap">
                    Value at stake
                  </th>
                  <th className="py-[7px] pr-[10px] text-right whitespace-nowrap">
                    Cover / ceiling
                  </th>
                  <th className="py-[7px] pr-[10px] text-left">Why</th>
                  <th className="py-[7px] pr-[14px] text-right">
                    <span className="sr-only">Expand</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <ExceptionTableRow key={row.id ?? `row-${index}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default ExceptionQueue;
