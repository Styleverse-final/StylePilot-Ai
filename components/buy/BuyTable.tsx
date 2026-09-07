"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Card, CardHeader } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { DataTable, type Column, type SortDirection } from "@/components/DataTable";
import { DriverBars } from "@/components/DriverBars";
import { Pill, type PillVariant } from "@/components/Pill";
import { Stat, StatBlock } from "@/components/StatBlock";
import { firstClause } from "@/components/clause";

import { DecisionComparison } from "./DecisionComparison";
import { DecisionControls } from "./DecisionControls";
import { HoldApprovalBar, useHoldApproval } from "./BulkApproveHolds";
import {
  ARROW,
  DASH,
  MIDDOT,
  formatInr,
  formatSignedFractionPct,
  formatSignedUnits,
  formatTimestamp,
  formatUnits,
  humaniseRole,
} from "./format";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  SearchIcon,
  SlidersIcon,
} from "./icons";
import { isOpenHold, latestDecision, type BuyDecision, type BuyRow } from "./types";

/**
 * The twelve-week buy plan.
 *
 * Every number in this table was read from the BUY_QUANTITY recommendation
 * payload on the server, under the planner's own row level security. The
 * client half computes nothing except which rows to show and in what order:
 * the P50, the safety stock, the recommended quantity, the manual plan and
 * the gap all arrive already decided by the pipeline, so the figure a planner
 * argues with is the figure the system acted on.
 *
 * THREE WAYS TO NARROW, ONE SET OF ROWS. The chips, the search field and the
 * filter panel all cut the same list that row level security already handed
 * over, in the browser. None of them can widen it, none of them issues a
 * second query, and none of them changes what the header counts: a filter is
 * a way of working the queue, not a claim that the rest of it stopped
 * existing. The line under the table always says how many of how many are on
 * screen, so a narrowed list can never be mistaken for the whole scope.
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

/** The four columns the rows can be ordered by. */
type SortKey = "p50" | "recommended" | "gap" | "value";

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

/** Everything a planner might type into the search field, as one haystack. */
function haystack(row: BuyRow): string {
  return [
    row.categoryLabel,
    row.channelLabel,
    row.regionLabel,
    row.regionName,
    row.serviceTier ?? "",
    row.confidence ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** The sortable measure, or null where the row does not carry one. */
function sortValue(row: BuyRow, key: SortKey): number | null {
  switch (key) {
    case "p50":
      return row.p50Units;
    case "recommended":
      return row.recommendedUnits;
    case "gap":
      return row.deltaPct;
    case "value":
      return row.valueAtStakeInr;
  }
}

/** The status dot in the decision cell. */
const DECISION_DOT: Record<BuyDecision["status"], string> = {
  APPROVED: "bg-green",
  MODIFIED: "bg-orange",
  REJECTED: "bg-red",
};

/** The word beside it. */
const DECISION_WORD: Record<BuyDecision["status"], string> = {
  APPROVED: "Approved",
  MODIFIED: "Modified",
  REJECTED: "Rejected",
};

/** Two-digit row numbers, so the column keeps its width down the list. */
function rowNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/* The toolbar wears the same hairline as the header cards and the table
   below it, so the three surfaces on this screen read as one set rather than
   as three components that happen to share a page. */
const FIELD =
  "h-[38px] w-full rounded-pill border border-rule bg-white pl-[38px] pr-[14px] text-copy font-semibold text-ink shadow-raised outline-none transition-colors duration-[120ms] placeholder:text-mute focus:border-peach focus:ring-2 focus:ring-peach";

export function BuyTable({ rows, holdNote }: BuyTableProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [bands, setBands] = useState<readonly string[]>([]);
  const [tiers, setTiers] = useState<readonly string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
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

  // The panel offers the bands and tiers THESE rows carry, not the enum. A
  // planner whose scope holds nothing at Low confidence is not offered a
  // filter that would empty the table for a reason they cannot see.
  const availableBands = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row.confidence)
            .filter((band): band is string => typeof band === "string"),
        ),
      ].sort(),
    [rows],
  );
  const availableTiers = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row.serviceTier)
            .filter((tier): tier is string => typeof tier === "string"),
        ),
      ].sort(),
    [rows],
  );

  const needle = query.trim().toLowerCase();
  const narrowed = bands.length + tiers.length;

  const visible = useMemo(() => {
    const kept = rows.filter((row) => {
      if (!matches(row, filter)) return false;
      if (needle.length > 0 && !haystack(row).includes(needle)) return false;
      if (bands.length > 0 && !bands.includes(row.confidence ?? "")) return false;
      if (tiers.length > 0 && !tiers.includes(row.serviceTier ?? "")) return false;
      return true;
    });

    if (sortKey === null) return kept;

    // Sorted off a copy, and rows with no value for the column sink to the
    // bottom in both directions rather than pretending to be zero -- a series
    // with no value at stake recorded is not the cheapest one on the screen.
    return [...kept].sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return sortDir === "asc" ? left - right : right - left;
    });
  }, [rows, filter, needle, bands, tiers, sortKey, sortDir]);

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

  /** First press on a column sorts it largest-first; the second reverses. */
  function changeSort(key: string) {
    const next = key as SortKey;
    if (sortKey === next) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
      return;
    }
    setSortKey(next);
    setSortDir("desc");
  }

  function toggle(
    value: string,
    current: readonly string[],
    set: (next: readonly string[]) => void,
  ) {
    set(
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  }

  /**
   * The opened row's argument, rendered in the row's own position.
   *
   * It used to sit under the whole table, which meant clicking Review on row
   * 31 scrolled the reader past every row below it to reach the rationale,
   * and back up again to carry on. In place, the row and the reason for it
   * stay on screen together.
   */
  function detail(row: BuyRow) {
    /*
      WHO OWNS THIS ROW, STATED AT THE TOP OF ITS OWN PANEL.

      The owner left the table when the column did, and the full attribution
      still sits on every entry of the decision record below. But the record
      is a list of what happened, and a reader opening a row wants one answer
      first -- whose call is this? -- without reading a history to infer it.
      So the latest decision's planner is named here, at the head of the
      panel, and a row nobody has decided says exactly that rather than
      showing an empty space that could be read either way.
    */
    const owner = latestDecision(row);
    const ownerRole = owner ? humaniseRole(owner.plannerRole) : null;


    return (
      <div
        id="buy-detail-panel"
        ref={panelRef}
        className="border-t-[2px] border-orange bg-shell px-[20px] py-[18px]"
      >
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-mute">
              Expanded row
            </div>
            <h4 className="mt-[2px] text-[15px] font-extrabold tracking-[-0.01em] text-ink">
              {row.categoryLabel} {MIDDOT} {row.channelLabel} {MIDDOT}{" "}
              {row.regionName}
            </h4>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-[10px]">
            <div className="rounded-inner border border-rule bg-white px-[13px] py-[8px] shadow-raised">
              <span className="block text-micro font-extrabold uppercase text-mute">
                Owner
              </span>
              {owner ? (
                <>
                  <span className="block text-[12.5px] font-extrabold text-ink">
                    {owner.plannerName}
                  </span>
                  <span className="block text-[10.5px] font-semibold text-mute">
                    {ownerRole ? `${ownerRole} ${MIDDOT} ` : ""}
                    {DECISION_WORD[owner.status].toLowerCase()}{" "}
                    <span className="tabular-nums">
                      {formatTimestamp(owner.decidedAt)}
                    </span>
                    {owner.actorType !== "human" ? ` ${MIDDOT} ${owner.actorType}` : ""}
                  </span>
                </>
              ) : (
                <span className="block text-[12px] font-semibold text-mute">
                  Nobody yet {MIDDOT} this recommendation is open
                </span>
              )}
            </div>

            <Button size="sm" onClick={() => setOpenId(null)}>
              Close
            </Button>
          </div>
        </div>

        <div className="mt-[14px] grid grid-cols-1 gap-[16px] min-[1100px]:grid-cols-2">
          <div className="rounded-inner bg-white">
            <div className="border-b border-rule px-[20px] py-[14px]">
              <h5 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
                Why this recommendation
              </h5>
              {/*
                THE WHOLE RATIONALE, ALWAYS VISIBLE. The collapsed row now
                carries the lead clause in its own Why column, which is what
                makes the queue scannable -- but this panel is the one place a
                planner has deliberately opened to read the entire argument,
                and putting a toggle in front of it would hide the reasoning at
                the exact moment it was asked for.
              */}
              <p className="mt-[6px] max-w-[80ch] text-copy leading-[1.6] text-body">
                {row.rationale ?? "No rationale was recorded on this row."}
              </p>
            </div>
            {row.drivers.length > 0 ? (
              <DriverBars
                drivers={row.drivers}
                footnote={
                  <>
                    Attribution method{" "}
                    <span className="font-mono text-[11px] font-bold text-ink">
                      {row.driverMethod ?? "not recorded"}
                    </span>
                    , in units, signed toward the forecast. Model{" "}
                    <span className="font-mono text-[11px] font-bold text-ink">
                      {row.modelVersion}
                    </span>
                    , generated{" "}
                    <span className="tabular-nums">
                      {formatTimestamp(row.generatedAt)}
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
              <Stat label="P50 demand" value={formatUnits(row.p50Units)} />
              <Stat label="Safety stock" value={formatUnits(row.safetyUnits)} />
              <Stat
                label="Recommended buy"
                value={formatUnits(row.recommendedUnits)}
                tone="orange"
              />
              <Stat label="Manual plan" value={formatUnits(row.manualUnits)} tone="mute" />
              <Stat
                label="Gap"
                value={formatSignedFractionPct(row.deltaPct)}
                tone={
                  row.action === "REDUCE_BUY"
                    ? "red"
                    : row.action === "INCREASE_BUY"
                      ? "green"
                      : "mute"
                }
              />
              <Stat
                label="Value at stake"
                value={formatInr(row.valueAtStakeInr)}
              />
              <Stat
                label="Confidence"
                value={row.confidence ?? DASH}
                tabular={false}
              />
              <Stat
                label="Service tier"
                value={row.serviceTier ?? DASH}
                tabular={false}
              />
            </StatBlock>

            {/*
              WHAT VALUE AT STAKE ACTUALLY IS, WHICH THIS SCREEN NEVER SAID.

              It is not a priority score and not the cost of the buy: it is the
              money the pipeline says riding on accepting this recommendation
              instead of the manual plan, and the arithmetic differs by
              direction.

              A SECOND "gap revenue" STAT WAS BUILT HERE AND REMOVED. Checked
              against the seeded rows, value_at_stake / (|delta| x asp) is
              EXACTLY 1.0000 on all 102 INCREASE_BUY rows and 0.298-0.304 -- the
              brand's markdown depth -- on all 72 REDUCE_BUY rows. So on an
              increase the two figures are the same number to the rupee, and
              printing both under copy claiming they answer different questions
              would have stated one quantity twice and been wrong about it.
              Naming the existing figure is the honest version of the same fix.
            */}
            <p className="mt-[10px] max-w-[70ch] text-small font-semibold leading-[1.55] text-mute">
              <b className="text-ink">Value at stake</b>{" "}
              {row.action === "REDUCE_BUY" ? (
                <>
                  is the discount given away on the surplus: the{" "}
                  <span className="tabular-nums">
                    {formatSignedUnits(row.deltaUnits)}
                  </span>{" "}
                  unit gap at{" "}
                  <span className="tabular-nums">{formatInr(row.aspInr)}</span>{" "}
                  each, taken down by the brand&apos;s markdown depth, because
                  units bought over plan are modelled as clearing at a cut
                  rather than at list.
                </>
              ) : (
                <>
                  is the demand that goes unserved if the manual plan stands:
                  the{" "}
                  <span className="tabular-nums">
                    {formatSignedUnits(row.deltaUnits)}
                  </span>{" "}
                  unit gap at the payload&apos;s own{" "}
                  <span className="tabular-nums">{formatInr(row.aspInr)}</span>{" "}
                  selling price. Revenue, with no cost or margin netted against
                  it.
                </>
              )}
            </p>

            <div className="mt-[16px] border-t border-rule pt-[14px]">
              {/* Keyed by row: the prefilled quantity and the reason are
                  per-recommendation state, and carrying either one into a
                  different series is how a planner commits the wrong
                  number without noticing. */}
              <DecisionControls
                key={row.id}
                recommendationId={row.id}
                recommendedUnits={row.recommendedUnits ?? 0}
                seriesLabel={`${row.categoryLabel} ${MIDDOT} ${row.channelLabel} ${MIDDOT} ${row.regionName}`}
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
              {row.decisions.length === 0 ? (
                <p className="mt-[10px] text-copy font-semibold text-mute">
                  Nothing recorded yet. This recommendation is open.
                </p>
              ) : (
                <div className="mt-[10px] flex flex-col gap-[10px]">
                  {row.decisions.map((decision, index) => (
                    <DecisionComparison
                      key={decision.id}
                      decision={decision}
                      superseded={index < row.decisions.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const columns: ReadonlyArray<Column<BuyRow>> = [
    {
      key: "index",
      header: "#",
      headerClassName: "w-[38px]",
      className: "pl-[20px] pr-[2px] text-mute tabular-nums",
      cell: (_row, index) => (
        <span className="text-[11.5px] font-bold">{rowNumber(index)}</span>
      ),
    },
    {
      key: "series",
      header: "Series",
      cell: (row) => (
        <>
          <span className="block text-[12.5px] font-extrabold text-ink">
            {row.categoryLabel}
          </span>
          <span className="block whitespace-nowrap text-[11px] font-semibold text-mute">
            {row.channelLabel} {MIDDOT} {row.regionLabel}
          </span>
        </>
      ),
    },
    {
      key: "p50",
      header: "P50 demand",
      numeric: true,
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
      valign: "middle",
      cell: (row) => {
        const pill = actionPill(row.action);
        return <Pill variant={pill.variant}>{pill.label}</Pill>;
      },
    },
    {
      /*
        WHY THIS ROW, ON THE ROW ITSELF.

        A planner working the queue top down had ten numbers and no reason
        for any of them until they opened a row: the argument lived entirely
        in the expansion, so triage meant expanding rows to find out which
        ones were worth expanding. The exception queue already solved this
        with the same shared splitter, and this column is that column.

        It is the FIRST CLAUSE and it is clamped to one line on purpose. The
        cell is a way to decide which row to open, not a place to read the
        rationale; the full string is unchanged in the panel, one click away.
        The width is capped on the span rather than the cell because a td in
        an auto-layout table treats a width as a suggestion, and an
        unconstrained clause would push the two pinned columns off a laptop.
      */
      key: "rationale",
      header: "Why",
      headerClassName: "w-[190px]",
      cell: (row) => (
        <span className="max-w-[190px] text-[11.5px] font-semibold leading-[1.5] text-mute line-clamp-1">
          {firstClause(row.rationale).head}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value at stake",
      numeric: true,
      sortable: true,
      cell: (row) => (
        <span className="font-extrabold">{formatInr(row.valueAtStakeInr)}</span>
      ),
    },
    {
      /*
        THE DECISION AND WHO MADE IT ARE TWO COLUMNS, NOT ONE.

        They used to share a cell, which meant the status, the two quantities
        and the attribution were stacked inside about 210px and read as a
        paragraph. Split, the left cell answers "what was decided" at a glance
        down the column, and the right one keeps the name, the job title and
        the moment -- which is the evidence, and is why neither half was
        allowed to become a tooltip.
      */
      key: "decision",
      header: "Decision",
      headerClassName: "w-[150px]",
      cell: (row) => {
        const decision = latestDecision(row);
        if (!decision) {
          return (
            <span className="flex items-center gap-[7px] text-[12px] font-semibold text-mute">
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] flex-none rounded-full bg-rule2"
              />
              Open
            </span>
          );
        }
        const committed =
          decision.status === "MODIFIED"
            ? decision.acceptedValue
            : decision.status === "APPROVED"
              ? decision.recommendedValue
              : null;
        return (
          <>
            <span className="flex items-center gap-[7px] text-[12px] font-extrabold text-ink">
              <span
                aria-hidden="true"
                className={`h-[7px] w-[7px] flex-none rounded-full ${DECISION_DOT[decision.status]}`}
              />
              {DECISION_WORD[decision.status]}
            </span>
            <span className="mt-[3px] block whitespace-nowrap text-[11px] font-semibold tabular-nums text-mute">
              {formatUnits(decision.recommendedValue)} {ARROW}{" "}
              <span
                className={
                  decision.status === "MODIFIED"
                    ? "font-extrabold text-orange"
                    : "font-extrabold text-ink2"
                }
              >
                {committed === null ? DASH : formatUnits(committed)}
              </span>
            </span>
            {row.decisions.length > 1 ? (
              <span className="mt-[3px] block whitespace-nowrap text-[10.5px] font-bold text-mute">
                {row.decisions.length} on the record
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      /*
        The control now stands where the owner used to, which is the width
        that column gave back, and it stays pinned to the right edge: the
        table can still be narrower than its content on a small laptop, and
        the one control that opens a row is not a thing to let scroll out of
        reach.
      */
      key: "review",
      header: "Review",
      align: "right",
      valign: "middle",
      stickyRight: true,
      className: "pr-[20px] border-l border-rule",
      headerClassName: "w-[112px] border-l border-rule",
      cell: (row) => (
        <Button
          size="sm"
          aria-expanded={openId === row.id}
          aria-controls="buy-detail-panel"
          /* The row carries the same handler. Without stopping here the
             click would toggle twice and nothing would open. */
          onClick={(event) => {
            event.stopPropagation();
            setOpenId(openId === row.id ? null : row.id);
          }}
        >
          {openId === row.id ? (
            "Close"
          ) : (
            <>
              Review
              <span aria-hidden="true" className="text-mute">
                <ArrowRightIcon />
              </span>
            </>
          )}
        </Button>
      ),
    },
  ];

  return (
    <>
      {/*
        The toolbar. Chips at the left because they are the coarse cut a
        planner reaches for first; the search field and the filter panel at
        the right because they are the fine one, and a planner only narrows by
        confidence or service tier once they already know which slice of the
        queue they are working.
      */}
      <div className="mb-[16px] flex flex-wrap items-center gap-[10px]">
        <ChipRow className="mb-0 flex-1">
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

        <div className="relative min-w-[240px] max-w-[420px] flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-mute"
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search series, category, or region..."
            aria-label="Search the recommendations in your scope"
            className={FIELD}
          />
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
          aria-controls="buy-filter-panel"
          aria-label={
            narrowed > 0
              ? `Filters, ${narrowed} applied`
              : "Filter by confidence band and service tier"
          }
          className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-pill border shadow-raised transition-colors duration-[120ms] ${
            panelOpen || narrowed > 0
              ? "border-ink bg-ink text-white"
              : "border-rule bg-white text-body hover:bg-hover"
          }`}
        >
          <SlidersIcon />
        </button>
      </div>

      {panelOpen ? (
        <div
          id="buy-filter-panel"
          className="mb-[16px] rounded-inner border border-rule bg-white px-[18px] py-[14px] shadow-raised"
        >
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[12px]">
            <div>
              <div className="mb-[7px] text-micro font-extrabold uppercase text-mute">
                Confidence band
              </div>
              <div className="flex flex-wrap gap-[7px]">
                {availableBands.length === 0 ? (
                  <span className="text-small font-semibold text-mute">
                    No band is recorded on these rows.
                  </span>
                ) : (
                  availableBands.map((band) => (
                    <Chip
                      key={band}
                      pressed={bands.includes(band)}
                      onPressedChange={() => toggle(band, bands, setBands)}
                    >
                      {band}
                    </Chip>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-[7px] text-micro font-extrabold uppercase text-mute">
                Service tier
              </div>
              <div className="flex flex-wrap gap-[7px]">
                {availableTiers.length === 0 ? (
                  <span className="text-small font-semibold text-mute">
                    No tier is recorded on these rows.
                  </span>
                ) : (
                  availableTiers.map((tier) => (
                    <Chip
                      key={tier}
                      pressed={tiers.includes(tier)}
                      onPressedChange={() => toggle(tier, tiers, setTiers)}
                    >
                      {tier}
                    </Chip>
                  ))
                )}
              </div>
            </div>

            {narrowed > 0 ? (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setBands([]);
                  setTiers([]);
                }}
              >
                Clear {narrowed}
              </Button>
            ) : null}
          </div>

          <p className="mt-[11px] text-small font-semibold leading-[1.55] text-mute">
            Both lists offer only the values these rows actually carry, and
            narrowing here changes what is listed, never what the chips count.
            Nothing is re-read from the database: row level security already
            decided this set on the server.
          </p>
        </div>
      ) : null}

      <Card className="border border-rule">
        <CardHeader
          actions={
            holds.count > 0 ? (
              <Button
                variant="dark"
                disabled={holds.pending || holds.armed}
                onClick={holds.arm}
              >
                <span aria-hidden="true">
                  <CheckIcon />
                </span>
                Approve {formatUnits(holds.count)}{" "}
                {holds.count === 1 ? "hold" : "holds"}
              </Button>
            ) : undefined
          }
        >
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-peach text-orange"
            >
              <CalendarIcon />
            </span>
            <div>
              <h3 className="text-[14px] font-extrabold tracking-[-0.01em] text-ink">
                {horizonTitle}
              </h3>
              <div className="mt-[2px] text-[11.5px] font-semibold text-mute">
                Forecast plus interval-derived safety stock, against the manual
                plan.
              </div>
            </div>
          </div>
        </CardHeader>

        <HoldApprovalBar state={holds} note={holdNote} />

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) => (row.id === openId ? "bg-shell" : undefined)}
          caption="Buy quantity recommendations against the manual plan"
          empty="No row in your scope matches that combination. The other chips still have rows behind them."
          valign="top"
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={changeSort}
          expanded={(row) => (row.id === openId ? detail(row) : null)}
          onRowClick={(row) => setOpenId(openId === row.id ? null : row.id)}
        />

      </Card>

      {/* A figure the header cannot carry: what the visible rows add up to. */}
      <p className="mt-[10px] px-[8px] text-small font-semibold text-mute leading-[1.6]">
        {`Showing ${formatUnits(visible.length)} of ${formatUnits(rows.length)} recommendations in your scope` +
          (counts.decided > 0
            ? `, ${formatUnits(counts.decided)} already carrying a decision.`
            : ".") +
          (needle.length > 0 || narrowed > 0
            ? ` The list is narrowed by ${[
                needle.length > 0 ? `the search for "${query.trim()}"` : null,
                narrowed > 0
                  ? `${narrowed} filter${narrowed === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}; the counts on the chips are the whole scope.`
            : "") +
          " Row level security scopes this screen to the brand, region and" +
          " categories you own, so a colleague on another region sees a" +
          " different list from the same table." +
          (horizons.length > 1
            ? ` Horizons on screen: ${horizons.map((weeks) => `${weeks} weeks`).join(", ")}.`
            : "") +
          (sortKey === null
            ? ""
            : " The order is a view on those rows and changes nothing about them.")}
      </p>
    </>
  );
}

export default BuyTable;
