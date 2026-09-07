import Link from "next/link";

import { seriesKeyOf } from "@/components/allocation/model";

import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  SeriesName,
} from "@/components";
import type { Column } from "@/components";
import { firstClause } from "@/components/clause";
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

/**
 * The destination for one row, carrying that row's identity with it.
 *
 * A link to /exceptions alone lands the reader on the queue and leaves them
 * to find, by eye, the row they had just clicked -- which on a screen whose
 * whole argument is "this one first" throws away the ranking at the moment it
 * matters. The target names the row instead.
 *
 * TWO DIFFERENT KEYS, BECAUSE THE TWO SCREENS ADDRESS DIFFERENT THINGS. The
 * allocation board is not a list of recommendations; it groups them into one
 * series and decides the whole group together, so ?series= is the only handle
 * that resolves there (resolveGroup already reads it). Everywhere else a row
 * IS the unit of decision, so ?rec= carries the recommendation id.
 *
 * A row with neither key falls back to the bare route rather than to a
 * parameter naming nothing -- the queue is still the right place to land.
 *
 * NOT recommendation.series_key, FOR ALLOCATION. The stored key is three
 * segments -- category|channel|region, e.g. "ACCS|D2C|IN-E" -- because a
 * recommendation is written per region. The allocation board groups regions
 * into a category x channel cell and decides the cell as a whole, so its own
 * key is two segments. Passing the stored key would never match, and
 * resolveGroup falls back to the first group rather than erroring, so the
 * planner would land silently on the WRONG cell -- the failure mode that looks
 * like the feature working. The key is therefore rebuilt at the board's own
 * grain through seriesKeyOf, imported so the two spellings cannot drift.
 */
export function hrefForRow(row: RecommendationState): string {
  const route = routeForRecType(row.rec_type);
  if (row.rec_type === "ALLOCATION") {
    return row.category_id === null || row.channel_id === null
      ? route
      : `${route}?series=${encodeURIComponent(
          seriesKeyOf(row.category_id, row.channel_id),
        )}`;
  }
  return row.id === null ? route : `${route}?rec=${row.id}`;
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
      /**
       * The first clause, clamped to two lines.
       *
       * This cell sets the height of the most important list on the home
       * screen, and it was setting it from whichever row happened to have the
       * longest paragraph: a buy rationale runs to about 297 characters
       * against about 133 for an exception, so one buy row could double the
       * height of the twelve around it. The reader is scanning for which row
       * to open, not reading the argument here.
       *
       * NOTHING IS REWRITTEN AND NOTHING IS LOST. firstClause cuts on a real
       * sentence boundary (never between two digits, so "19.7 weeks" survives
       * intact) and the whole stored string stays on the title attribute, so
       * the full text is one hover away and the screen that owns the decision
       * still shows it in full.
       *
       * line-clamp-2 carries its own display rule, so no `block` is set
       * beside it -- the two are competing display utilities and which one
       * won would depend on stylesheet order, not on this line.
       */
      cell: (row) => {
        if (row.rationale === null) {
          return (
            <span className="block max-w-[52ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
              No rationale was written for this row.
            </span>
          );
        }
        return (
          <span
            title={row.rationale}
            className="line-clamp-2 max-w-[52ch] text-[11.5px] font-semibold leading-[1.6] text-mute"
          >
            {firstClause(row.rationale).head}
          </span>
        );
      },
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
      /* A control, not a line of text: it sits in the middle of a row whose
         text columns are read from the top. */
      valign: "middle",
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
      valign: "middle",
      cell: (row) => (
        <Link
          href={hrefForRow(row)}
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
            /* The why column now runs to two lines while the series and the
               action run to one, so the cells have to start at the same
               height or the row reads as a ragged pile instead of a line to
               read across. The two control columns override this back to
               middle for themselves. */
            valign="top"
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
