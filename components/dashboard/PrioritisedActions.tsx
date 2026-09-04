import Link from "next/link";

import { Card, CardBody, CardHeader, DataTable, Pill, SeriesName } from "@/components";
import type { Column } from "@/components";
import type { RecType, RecommendationState } from "@/lib/queries";

import { formatCount, formatCrore, humanise, seriesLabel } from "./format";

/**
 * PrioritisedActions -- block 4.
 *
 * The list is ordered by value_at_stake_inr descending and nothing else.
 * That ordering is the point of the screen: a planner works down it and
 * stops when the remaining value stops justifying the attention. Rows with
 * no value figure (allocation shifts are scored in percentage points, not
 * rupees) sort last rather than being dropped, because dropping them would
 * quietly shrink the queue.
 *
 * Every row deep-links to the screen that can actually settle it.
 */

/** Where each recommendation type is decided. */
const ROUTE_BY_TYPE: Record<RecType, string> = {
  EXCEPTION: "/exceptions",
  BUY_QUANTITY: "/buy",
  ALLOCATION: "/allocation",
};

export function routeForRecType(recType: RecType | null | undefined): string {
  return recType ? ROUTE_BY_TYPE[recType] : "/exceptions";
}

/** Short label for the destination, used on the row action. */
const DESTINATION_LABEL: Record<RecType, string> = {
  EXCEPTION: "Exceptions",
  BUY_QUANTITY: "Buy plan",
  ALLOCATION: "Allocation",
};

export function destinationLabel(recType: RecType | null | undefined): string {
  return recType ? DESTINATION_LABEL[recType] : "Exceptions";
}

/** Severity drives the pill tone; confidence never does. */
function severityTone(severity: string | null): "down" | "amber" | "grey" {
  if (severity === "HIGH") return "down";
  if (severity === "MEDIUM") return "amber";
  return "grey";
}

export type PrioritisedActionsProps = {
  rows: readonly RecommendationState[];
  /** How many open rows exist in scope in total, before the cut. */
  openTotal: number;
};

export function PrioritisedActions({ rows, openTotal }: PrioritisedActionsProps) {
  const columns: ReadonlyArray<Column<RecommendationState>> = [
    {
      key: "series",
      header: "Series",
      cell: (row) => (
        <SeriesName qualifier={row.brand_id ?? undefined}>
          {seriesLabel(row.series_key)}
        </SeriesName>
      ),
    },
    {
      key: "action",
      header: "Recommended action",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-[7px]">
          <span className="font-bold text-ink">{humanise(row.action)}</span>
          {row.severity ? (
            <Pill variant={severityTone(row.severity)}>
              {humanise(row.severity)}
            </Pill>
          ) : null}
        </span>
      ),
    },
    {
      key: "rationale",
      header: "Why",
      cell: (row) => (
        <span className="block max-w-[52ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
          {row.rationale ?? "No rationale was written for this row."}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value at stake",
      numeric: true,
      cell: (row) =>
        row.value_at_stake_inr === null ? (
          <span className="text-mute">not priced</span>
        ) : (
          <b className="font-extrabold">{formatCrore(row.value_at_stake_inr)}</b>
        ),
    },
    {
      key: "go",
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={routeForRecType(row.rec_type)}
          className="inline-flex h-[28px] items-center gap-[6px] rounded-pill bg-cream px-[11px] text-[11.5px] font-bold text-ink transition-colors duration-[120ms] hover:bg-hover"
        >
          {destinationLabel(row.rec_type)}
          <span aria-hidden="true">&#8594;</span>
        </Link>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Prioritised actions"
        subtitle="Ranked by value at stake. Each row opens where it can be settled."
        actions={
          openTotal > rows.length ? (
            <span className="rounded-pill bg-cream px-[12px] py-[5px] text-[11.5px] font-semibold text-body">
              Top {formatCount(rows.length)} of {formatCount(openTotal)} open
            </span>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-[12.5px] leading-[1.6] text-body">
            Nothing in your scope is waiting on a decision. A planner scoped
            to one region can legitimately see an empty queue; it means the
            open work sits outside your categories or regions, not that the
            system produced nothing.
          </p>
        </CardBody>
      ) : (
        <DataTable
          caption="Open recommendations ranked by value at stake"
          columns={columns}
          rows={rows}
          rowKey={(row, index) => String(row.id ?? index)}
        />
      )}
    </Card>
  );
}

export default PrioritisedActions;
