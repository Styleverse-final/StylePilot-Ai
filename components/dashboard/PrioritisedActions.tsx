import Link from "next/link";

import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  SeriesName,
} from "@/components";
import type { Column } from "@/components";
import type { RecType, RecommendationState } from "@/lib/queries";

import { formatCount, formatCrore, humanise, seriesLabel } from "./format";
import { QueueApprove } from "./QueueApprove";
import { RowLimit } from "./RowLimit";

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
 * Every row deep-links to the screen that can actually settle it, and every
 * row can be approved without going there. See <QueueApprove> for why approve
 * is the only decision this screen takes: it is the only one the server
 * accepts without a written reason, and a reason needs the room the owning
 * screen has.
 *
 * THE FILTER IS A LINK, NOT A TOGGLE. The queue is mixed -- buy, allocation
 * and exception rows in one ranking -- and a planner clearing buys wants only
 * buys. Filtering in the browser would filter the twelve rows on screen out
 * of ninety-three, which is a different and much less useful thing, so the
 * chips are links that re-rank the whole queue on the server.
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

/** The chips above the table, in the order the queue is usually worked. */
const FILTERS: ReadonlyArray<{ label: string; type: RecType | null }> = [
  { label: "Everything", type: null },
  { label: "Exceptions", type: "EXCEPTION" },
  { label: "Buy", type: "BUY_QUANTITY" },
  { label: "Allocation", type: "ALLOCATION" },
];

const CHIP =
  "rounded-pill px-[12px] py-[6px] text-[11.5px] font-bold transition-colors duration-[120ms]";

/**
 * How many rows stand open before the reader asks for the rest.
 *
 * The card fetches and renders more than this -- see ACTION_ROWS on the page
 * -- and <RowLimit> hides the overflow behind one button. Four is enough to
 * show what the top of the ranking looks like without a summary screen giving
 * half its height to a list the reader has not asked to work yet.
 */
const VISIBLE_ROWS = 4;

export type PrioritisedActionsProps = {
  rows: readonly RecommendationState[];
  /** How many open rows exist in scope in total, before the cut. */
  openTotal: number;
  /** The rec_type currently filtered to, or null for the whole queue. */
  activeType?: RecType | null;
  /** Open rows per type across the whole scope, for the chip counts. */
  countsByType?: Readonly<Record<string, number>>;
};

export function PrioritisedActions({
  rows,
  openTotal,
  activeType = null,
  countsByType,
}: PrioritisedActionsProps) {
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
          <b className="font-extrabold">
            {formatCrore(row.value_at_stake_inr)}
          </b>
        ),
    },
    {
      key: "decide",
      header: "Decide",
      align: "right",
      headerClassName: "w-[150px]",
      cell: (row) =>
        row.id === null ? null : (
          <QueueApprove
            recommendationId={row.id}
            rowLabel={`${humanise(row.action)} on ${seriesLabel(row.series_key)}`}
          />
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
        subtitle="Ranked by value at stake. Approve here, or open the screen that owns the rest of the decision."
        actions={
          openTotal > rows.length ? (
            <span className="rounded-pill bg-cream px-[12px] py-[5px] text-[11.5px] font-semibold text-body">
              Top {formatCount(rows.length)} of {formatCount(openTotal)} open
            </span>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-[7px] border-b border-rule px-[20px] py-[11px]">
        {FILTERS.map((filter) => {
          const isActive = filter.type === activeType;
          const count =
            filter.type === null ? undefined : countsByType?.[filter.type];
          return (
            <Link
              key={filter.label}
              href={filter.type === null ? "/" : `/?type=${filter.type}`}
              scroll={false}
              aria-current={isActive ? "true" : undefined}
              className={`${CHIP} ${
                isActive
                  ? "bg-ink text-white"
                  : "bg-cream text-body hover:bg-hover"
              }`}
            >
              {filter.label}
              {count === undefined ? null : (
                <span className={isActive ? "text-white/70" : "text-mute"}>
                  {" "}
                  {formatCount(count)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-[12.5px] leading-[1.6] text-body">
            {activeType === null
              ? `Nothing in your scope is waiting on a decision. A planner scoped to one region can legitimately see an empty queue; it means the open work sits outside your categories or regions, not that the system produced nothing.`
              : `No ${destinationLabel(activeType).toLowerCase()} row in your scope is waiting on a decision. Other types may still have open work -- clear the filter to see the whole queue.`}
          </p>
        </CardBody>
      ) : (
        <RowLimit visible={VISIBLE_ROWS} total={rows.length}>
          <DataTable
            caption="Open recommendations ranked by value at stake"
            columns={columns}
            rows={rows}
            rowKey={(row, index) => String(row.id ?? index)}
          />
        </RowLimit>
      )}
    </Card>
  );
}

export default PrioritisedActions;
