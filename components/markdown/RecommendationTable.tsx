import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  SeriesName,
  type Column,
} from "@/components";

import {
  DELAY_WEEKS,
  LIFE_ELAPSED_TRIGGER,
  MAX_DEPTH,
  NOW_MARGIN_TRIGGER_PCT,
} from "./constants";
import {
  DASH,
  formatCount,
  formatFractionPct,
  formatInr,
  formatWeeks,
} from "./format";
import { timingDisplay, type MarkdownRow } from "./types";

/**
 * THE RECOMMENDATION LIST.
 *
 * Ranked by what the wait costs, because that is the order a planner works
 * the list in: top down, stopping when the remaining value stops justifying
 * the attention.
 *
 * TWO COLUMNS ARE NOT IN THE TABLE THEY LOOK LIKE THEY CAME FROM.
 *
 *   "Cost of waiting" is margin_saved divided by the leftover's value at
 *   list -- projected_leftover_units from the recommendation multiplied by
 *   list_price_inr from dim_sku. It is recomputed here from stored parts
 *   rather than read, so the 5% trigger beside it is a rule the reader can
 *   check against the two numbers either side of it instead of a claim.
 *
 *   "Fit" is the elasticity row behind the row's category. A depth resting
 *   on a POOLED coefficient is weaker evidence than one resting on a
 *   category's own promotions, and a table that does not say which is which
 *   invites a planner to treat every depth as equally earned. That is the
 *   single most important thing this table does that a report would not.
 */

export type RecommendationTableProps = {
  rows: readonly MarkdownRow[];
};

function DepthCell({ row }: { row: MarkdownRow }) {
  const pinned = row.recommendedDepth >= MAX_DEPTH - 1e-9;
  return (
    <span className="inline-flex items-baseline gap-[6px]">
      <b className="font-extrabold text-ink tabular-nums">
        {formatFractionPct(row.recommendedDepth, 0)}
      </b>
      {pinned ? (
        <span className="text-[10px] font-bold text-red">at ceiling</span>
      ) : null}
    </span>
  );
}

const COLUMNS: ReadonlyArray<Column<MarkdownRow>> = [
  {
    key: "style",
    header: "Style",
    cell: (row) => <SeriesName qualifier={row.styleId}>{row.styleName}</SeriesName>,
  },
  {
    key: "category",
    header: "Category",
    cell: (row) => (
      <span className="text-[11.5px] font-semibold text-mute">
        {row.categoryLabel}
      </span>
    ),
  },
  {
    key: "weeks",
    header: "Weeks since launch",
    numeric: true,
    cell: (row) => formatCount(row.weeksSinceLaunch),
  },
  {
    key: "life",
    header: "Life left",
    numeric: true,
    cell: (row) => formatCount(row.remainingLifeWeeks),
  },
  {
    key: "cover",
    header: "Current cover",
    numeric: true,
    cell: (row) => formatWeeks(row.coverWeeks),
  },
  {
    key: "depth",
    header: "Recommended depth",
    numeric: true,
    cell: (row) => <DepthCell row={row} />,
  },
  {
    key: "timing",
    header: "Timing",
    cell: (row) => {
      // Three outcomes. The label was already three-way; the tone was not,
      // so an unrecognised value used to be spelled out in the grey of a
      // hold. Amber is neither verdict.
      const timing = timingDisplay(row.timing, "Now", "Hold");
      return <Pill variant={timing.variant}>{timing.label}</Pill>;
    },
  },
  {
    key: "fit",
    header: "Fit behind it",
    cell: (row) =>
      row.fit === null ? (
        <span className="text-[11px] font-semibold text-mute">{DASH}</span>
      ) : (
        <Pill variant={row.fit.isPooled ? "amber" : "grey"}>
          {row.fit.isPooled ? "Pooled" : "Own fit"}
        </Pill>
      ),
  },
  {
    key: "cost",
    header: "Cost of waiting",
    numeric: true,
    cell: (row) =>
      row.waitCostShare === null ? (
        DASH
      ) : (
        <span
          className={
            row.waitCostShare > NOW_MARGIN_TRIGGER_PCT
              ? "font-extrabold text-orange"
              : "text-mute"
          }
        >
          {formatFractionPct(row.waitCostShare)}
        </span>
      ),
  },
  {
    key: "saved",
    header: "Margin saved",
    numeric: true,
    cell: (row) => (
      <b className="font-extrabold text-ink">{formatInr(row.marginSaved)}</b>
    ),
  },
];

export function RecommendationTable({ rows }: RecommendationTableProps) {
  const pooled = rows.filter((row) => row.fit?.isPooled === true);
  const pinned = rows.filter((row) => row.recommendedDepth >= MAX_DEPTH - 1e-9);

  return (
    <Card>
      <CardHeader
        title="Recommended actions"
        subtitle={`Ranked by what a ${DELAY_WEEKS}-week wait costs. Depth is priced for the week it would be set in.`}
      />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => String(row.id)}
        caption="Markdown timing recommendations, highest margin saved first"
        empty={`No style in your scope is both late enough in its life and overstocked enough to have a markdown question. That is a legitimate result, not an empty table: a style below ${formatFractionPct(
          LIFE_ELAPSED_TRIGGER,
          0,
        )} of its planned life, or holding cover under its category ceiling, is a buy or allocation matter and is answered on those screens.`}
      />
      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          Cost of waiting is not stored: it is{" "}
          <span className="font-mono text-[11px] text-ink">
            margin_saved / (projected_leftover_units x list_price_inr)
          </span>
          , recomputed here from the recommendation row and the style&apos;s
          list price so that the{" "}
          {formatFractionPct(NOW_MARGIN_TRIGGER_PCT, 0)} trigger is something
          you can check rather than something the screen asserts. Every row
          above that trigger reads Now; every row below it reads Hold.
          {pinned.length > 0
            ? ` ${pinned.length} ${
                pinned.length === 1 ? "row is" : "rows are"
              } pinned at the ${Math.round(
                MAX_DEPTH * 100,
              )}% ceiling. On those the depth has stopped being the variable: the cut is as deep as policy allows at both dates and only the runway moves, so what the wait actually costs is stranded stock rather than margin per unit. At that much cover against that little life, most of the loss was bought in rather than mistimed, and the buy plan is where it gets fixed next season.`
            : ""}
        </p>
        {pooled.length > 0 ? (
          <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] text-body">
            {pooled.length}{" "}
            {pooled.length === 1 ? "row rests" : "rows rest"} on a pooled
            coefficient rather than their category&apos;s own fit --{" "}
            {[...new Set(pooled.map((row) => row.categoryLabel))].join(", ")}.
            The depth is still derived, but it is derived from the brand&apos;s
            average price response rather than from that category&apos;s, so it
            is the weaker of the two claims on this page. The provenance panel
            below says how weak, in the category&apos;s own R-squared.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
