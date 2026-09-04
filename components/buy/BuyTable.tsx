"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Card, CardHeader } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { DataTable, SeriesName, type Column } from "@/components/DataTable";
import { DriverBars } from "@/components/DriverBars";
import { Pill, type PillVariant } from "@/components/Pill";
import { Stat, StatBlock } from "@/components/StatBlock";

import { DecisionComparison } from "./DecisionComparison";
import { DecisionControls } from "./DecisionControls";
import { HoldApprovalBar, useHoldApproval } from "./BulkApproveHolds";
import {
  DASH,
  MIDDOT,
  formatInr,
  formatSignedFractionPct,
  formatSignedUnits,
  formatTimestamp,
  formatUnits,
} from "./format";
import { isOpenHold, latestDecision, type BuyRow } from "./types";

/**
 * The twelve-week buy plan.
 *
 * Every number in this table was read from the BUY_QUANTITY recommendation
 * payload on the server, under the planner's own row level security. The
 * client half computes nothing except which rows to show: the P50, the
 * safety stock, the recommended quantity, the manual plan and the gap all
 * arrive already decided by the pipeline, so the figure a planner argues
 * with is the figure the system acted on.
 *
 * Expanding a row shows the rationale, the exact SHAP attribution in units,
 * the model version that produced it, and every decision ever recorded
 * against it -- including the ones that were later superseded.
 */

export type BuyTableProps = {
  rows: readonly BuyRow[];
  /** Copy for the hold confirmation, built from the rows on the server. */
  holdNote: string;
};

type Filter = "all" | "increase" | "reduce" | "hold" | "open" | "decided";

const ACTION_PILL: Record<string, { label: string; variant: PillVariant }> = {
  INCREASE_BUY: { label: "Increase", variant: "up" },
  REDUCE_BUY: { label: "Reduce", variant: "down" },
  HOLD: { label: "Hold", variant: "grey" },
};

function actionPill(action: string | null): {
  label: string;
  variant: PillVariant;
} {
  if (action && ACTION_PILL[action]) return ACTION_PILL[action];
  return { label: action ?? DASH, variant: "grey" };
}

/** The gap wears the sign of the recommendation, not of the arithmetic. */
function gapClass(action: string | null): string {
  if (action === "REDUCE_BUY") return "text-red";
  if (action === "INCREASE_BUY") return "text-green";
  return "text-mute";
}

function matches(row: BuyRow, filter: Filter): boolean {
  switch (filter) {
    case "increase":
      return row.action === "INCREASE_BUY";
    case "reduce":
      return row.action === "REDUCE_BUY";
    case "hold":
      return row.action === "HOLD";
    case "open":
      return row.decisions.length === 0;
    case "decided":
      return row.decisions.length > 0;
    default:
      return true;
  }
}

export function BuyTable({ rows, holdNote }: BuyTableProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const holdIds = useMemo(
    () => rows.filter(isOpenHold).map((row) => row.id),
    [rows],
  );
  const holds = useHoldApproval(holdIds);

  const counts = useMemo(
    () => ({
      all: rows.length,
      increase: rows.filter((row) => row.action === "INCREASE_BUY").length,
      reduce: rows.filter((row) => row.action === "REDUCE_BUY").length,
      hold: rows.filter((row) => row.action === "HOLD").length,
      open: rows.filter((row) => row.decisions.length === 0).length,
      decided: rows.filter((row) => row.decisions.length > 0).length,
    }),
    [rows],
  );

  const visible = useMemo(
    () => rows.filter((row) => matches(row, filter)),
    [rows, filter],
  );

  const open = useMemo(
    () => rows.find((row) => row.id === openId) ?? null,
    [rows, openId],
  );

  // The detail panel sits under the table rather than inside it, so bring it
  // into view when a row is expanded. Without this a row near the top of a
  // long list would open a panel the planner never sees.
  useEffect(() => {
    if (openId !== null && panelRef.current) {
      panelRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [openId]);

  const horizons = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row.horizonWeeks)
            .filter((weeks): weeks is number => typeof weeks === "number"),
        ),
      ].sort((a, b) => a - b),
    [rows],
  );
  const horizonTitle =
    horizons.length === 1
      ? `${horizons[0]}-week recommendations`
      : "Buy recommendations";

  const columns: ReadonlyArray<Column<BuyRow>> = [
    {
      key: "series",
      header: "Series",
      cell: (row) => (
        <SeriesName qualifier={`${MIDDOT} ${row.channelLabel} ${MIDDOT} ${row.regionLabel}`}>
          {row.categoryLabel}
        </SeriesName>
      ),
    },
    {
      key: "p50",
      header: "P50 demand",
      numeric: true,
      cell: (row) => formatUnits(row.p50Units),
    },
    {
      key: "safety",
      header: "Safety",
      numeric: true,
      cell: (row) => formatUnits(row.safetyUnits),
    },
    {
      key: "recommended",
      header: "Recommended",
      numeric: true,
      cell: (row) => (
        <span className="font-extrabold">{formatUnits(row.recommendedUnits)}</span>
      ),
    },
    {
      key: "manual",
      header: "Manual plan",
      numeric: true,
      cell: (row) => (
        <span className="text-mute">{formatUnits(row.manualUnits)}</span>
      ),
    },
    {
      key: "gap",
      header: "Gap",
      numeric: true,
      cell: (row) => (
        <span className={`font-extrabold ${gapClass(row.action)}`}>
          {formatSignedFractionPct(row.deltaPct)}
          <span className="block text-[10.5px] font-semibold text-mute">
            {formatSignedUnits(row.deltaUnits)}
          </span>
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => {
        const pill = actionPill(row.action);
        return <Pill variant={pill.variant}>{pill.label}</Pill>;
      },
    },
    {
      key: "value",
      header: "Value at stake",
      numeric: true,
      cell: (row) => (
        <span className="font-extrabold">{formatInr(row.valueAtStakeInr)}</span>
      ),
    },
    {
      key: "decision",
      header: "Decision",
      headerClassName: "w-[210px]",
      cell: (row) => {
        const decision = latestDecision(row);
        if (!decision) {
          return <span className="text-mute font-semibold">Open</span>;
        }
        return (
          <>
            <DecisionComparison decision={decision} compact />
            {row.decisions.length > 1 ? (
              <div className="mt-[4px] text-[10.5px] font-bold text-mute">
                {row.decisions.length} entries on the record
              </div>
            ) : null}
          </>
        );
      },
    },
    {
      key: "review",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          size="sm"
          aria-expanded={openId === row.id}
          aria-controls="buy-detail-panel"
          onClick={() => setOpenId(openId === row.id ? null : row.id)}
        >
          {openId === row.id ? "Close" : "Review"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <ChipRow>
        <Chip pressed={filter === "all"} onPressedChange={() => setFilter("all")}>
          All {counts.all}
        </Chip>
        <Chip
          pressed={filter === "increase"}
          onPressedChange={() => setFilter("increase")}
        >
          Increase {counts.increase}
        </Chip>
        <Chip
          pressed={filter === "reduce"}
          onPressedChange={() => setFilter("reduce")}
        >
          Reduce {counts.reduce}
        </Chip>
        <Chip pressed={filter === "hold"} onPressedChange={() => setFilter("hold")}>
          Hold {counts.hold}
        </Chip>
        <Chip pressed={filter === "open"} onPressedChange={() => setFilter("open")}>
          Undecided {counts.open}
        </Chip>
        <Chip
          pressed={filter === "decided"}
          onPressedChange={() => setFilter("decided")}
        >
          Decided {counts.decided}
        </Chip>
      </ChipRow>

      <Card>
        <CardHeader
          title={horizonTitle}
          subtitle="Forecast plus interval-derived safety stock, against the manual plan"
          actions={
            holds.count > 0 ? (
              <Button
                variant="dark"
                size="sm"
                disabled={holds.pending || holds.armed}
                onClick={holds.arm}
              >
                Approve {formatUnits(holds.count)}{" "}
                {holds.count === 1 ? "hold" : "holds"}
              </Button>
            ) : undefined
          }
        />

        <HoldApprovalBar state={holds} note={holdNote} />

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) => (row.id === openId ? "bg-shell" : undefined)}
          caption="Buy quantity recommendations against the manual plan"
          empty="No rows match this filter."
        />

        {open ? (
          <div
            id="buy-detail-panel"
            ref={panelRef}
            className="border-t-[2px] border-orange bg-shell px-[20px] py-[18px]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-mute">
                  Expanded row
                </div>
                <h4 className="mt-[2px] text-[15px] font-extrabold tracking-[-0.01em] text-ink">
                  {open.categoryLabel} {MIDDOT} {open.channelLabel} {MIDDOT}{" "}
                  {open.regionName}
                </h4>
              </div>
              <Button size="sm" onClick={() => setOpenId(null)}>
                Close
              </Button>
            </div>

            <div className="mt-[14px] grid grid-cols-1 gap-[16px] min-[1100px]:grid-cols-2">
              <div className="rounded-inner bg-white">
                <div className="border-b border-rule px-[20px] py-[14px]">
                  <h5 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
                    Why this recommendation
                  </h5>
                  <p className="mt-[6px] max-w-[80ch] text-copy leading-[1.6] text-body">
                    {open.rationale || "No rationale was recorded on this row."}
                  </p>
                </div>
                {open.drivers.length > 0 ? (
                  <DriverBars
                    drivers={open.drivers}
                    footnote={
                      <>
                        Attribution method{" "}
                        <span className="font-mono text-[11px] font-bold text-ink">
                          {open.driverMethod ?? "not recorded"}
                        </span>
                        , in units, signed toward the forecast. Model{" "}
                        <span className="font-mono text-[11px] font-bold text-ink">
                          {open.modelVersion}
                        </span>
                        , generated{" "}
                        <span className="tabular-nums">
                          {formatTimestamp(open.generatedAt)}
                        </span>
                        .
                      </>
                    }
                  />
                ) : (
                  <div className="px-[20px] py-[14px] text-copy font-semibold text-mute">
                    No driver attribution was written for this row, so the
                    recommendation cannot be decomposed here.
                  </div>
                )}
              </div>

              <div className="rounded-inner bg-white px-[20px] py-[16px]">
                <h5 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
                  Decide
                </h5>
                <StatBlock className="mt-[8px]">
                  <Stat label="P50 demand" value={formatUnits(open.p50Units)} />
                  <Stat label="Safety stock" value={formatUnits(open.safetyUnits)} />
                  <Stat
                    label="Recommended buy"
                    value={formatUnits(open.recommendedUnits)}
                    tone="orange"
                  />
                  <Stat label="Manual plan" value={formatUnits(open.manualUnits)} tone="mute" />
                  <Stat
                    label="Gap"
                    value={formatSignedFractionPct(open.deltaPct)}
                    tone={
                      open.action === "REDUCE_BUY"
                        ? "red"
                        : open.action === "INCREASE_BUY"
                          ? "green"
                          : "mute"
                    }
                  />
                  <Stat
                    label="Value at stake"
                    value={formatInr(open.valueAtStakeInr)}
                  />
                  <Stat
                    label="Confidence"
                    value={open.confidence ?? DASH}
                    tabular={false}
                  />
                  <Stat
                    label="Service tier"
                    value={open.serviceTier ?? DASH}
                    tabular={false}
                  />
                </StatBlock>

                <div className="mt-[16px] border-t border-rule pt-[14px]">
                  {/* Keyed by row: the prefilled quantity and the reason are
                      per-recommendation state, and carrying either one into a
                      different series is how a planner commits the wrong
                      number without noticing. */}
                  <DecisionControls
                    key={open.id}
                    recommendationId={open.id}
                    recommendedUnits={open.recommendedUnits ?? 0}
                    seriesLabel={`${open.categoryLabel} ${MIDDOT} ${open.channelLabel} ${MIDDOT} ${open.regionName}`}
                  />
                </div>

                <div className="mt-[16px] border-t border-rule pt-[14px]">
                  <h5 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
                    Decision record
                  </h5>
                  <p className="mt-[3px] text-small font-semibold text-mute leading-[1.55]">
                    Append-only. A change of mind is a new entry and the earlier
                    one stays exactly where it was.
                  </p>
                  {open.decisions.length === 0 ? (
                    <p className="mt-[10px] text-copy font-semibold text-mute">
                      Nothing recorded yet. This recommendation is open.
                    </p>
                  ) : (
                    <div className="mt-[10px] flex flex-col gap-[10px]">
                      {open.decisions.map((decision, index) => (
                        <DecisionComparison
                          key={decision.id}
                          decision={decision}
                          superseded={index < open.decisions.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {/* A figure the header cannot carry: what the visible rows add up to. */}
      <p className="mt-[10px] px-[8px] text-small font-semibold text-mute leading-[1.6]">
        {`Showing ${formatUnits(visible.length)} of ${formatUnits(rows.length)} recommendations in your scope` +
          (counts.decided > 0
            ? `, ${formatUnits(counts.decided)} already carrying a decision.`
            : ".") +
          " Row level security scopes this screen to the brand, region and" +
          " categories you own, so a colleague on another region sees a" +
          " different list from the same table." +
          (horizons.length > 1
            ? ` Horizons on screen: ${horizons.map((weeks) => `${weeks} weeks`).join(", ")}.`
            : "")}
      </p>
    </>
  );
}

export default BuyTable;
