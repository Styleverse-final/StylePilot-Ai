import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";

import {
  DASH,
  TIMES,
  formatInr,
  formatSignedFractionPct,
  formatSignedInr,
  formatSignedUnits,
  formatUnits,
  formatUnitsCompact,
} from "./format";
import type { PlanEconomics, ScenarioComparison, ScenarioResult } from "./model";

/**
 * Base plan against the live levers and up to three saved scenarios.
 *
 * THE UNIT COLUMNS ARE NOT OPTIONAL AND NOT AT THE END BY ACCIDENT.
 * The three shaded columns on the right are the inventory consequence, and
 * they are shaded so that a reader scanning for the biggest gross margin
 * cannot reach it without crossing them. Every row carries units, including
 * the base plan, because a margin number whose unit number is missing is
 * exactly the comparison this screen exists to prevent.
 *
 * Saved scenarios are re-run against the CURRENT forecast rather than read
 * back as stored results. planner_decision keeps the parameters, not the
 * outcome: the outcome is a function of a forecast that is re-scored, and an
 * audit trail carrying figures that no longer reconcile with the model is
 * worse than one that carries none.
 */

export type ComparisonKind = "base" | "live" | "saved";

export type ComparisonRow = {
  key: string;
  name: string;
  /** Lever summary, or who filed it and when. */
  detail: string;
  kind: ComparisonKind;
  result: ScenarioResult;
  /** null on the base row, which is the reference rather than a change. */
  comparison: ScenarioComparison | null;
  /** Set when a saved scenario was filed against a different selection. */
  scopeNote: string | null;
};

export type ComparisonTableProps = {
  rows: readonly ComparisonRow[];
  economics: PlanEconomics;
  /** Clearance cost per unit, restated in the footnote. */
  clearanceSentence: string | null;
  coverageMeasured: number | null;
  /** Null when no registry row is readable; the count is then not stated. */
  coverageFolds: number | null;
  accuracyFolds: number | null;
};

const UNIT_GROUP = "bg-shell";
const UNIT_GROUP_FIRST = "bg-shell border-l border-rule2";

function KindPill({ kind }: { kind: ComparisonKind }) {
  if (kind === "base") return <Pill variant="grey">Base plan</Pill>;
  if (kind === "live") return <Pill variant="orange">Live levers</Pill>;
  return <Pill variant="violet">In the ledger</Pill>;
}

function unitTone(value: number): "up" | "down" | "grey" {
  if (Math.round(value) === 0) return "grey";
  return value > 0 ? "up" : "down";
}

export function ComparisonTable({
  rows,
  economics,
  clearanceSentence,
  coverageMeasured,
  coverageFolds,
  accuracyFolds,
}: ComparisonTableProps) {
  // The dagger marks rows the pooled coefficient CHANGED, not rows a pooled
  // category happens to sit in. At the plan's own price point the price ratio
  // is 1 and the coefficient is an exponent on 1, so the base plan row carries
  // a pooled category whose borrowed slope moved nothing -- flagging it
  // claimed a borrowed answer where none had been borrowed, and a footnote
  // that cries wolf on the reference row is a footnote nobody reads on the
  // rows that matter.
  const anyPooled = rows.some((row) => row.result.pooledCoefficientApplied);
  const anyCapped = rows.some((row) => row.result.capacityBinds);

  const columns: ReadonlyArray<Column<ComparisonRow>> = [
    {
      key: "scenario",
      header: "Scenario",
      cell: (row) => (
        <div className="min-w-[210px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="text-[12.5px] font-extrabold text-ink">
              {row.name}
              {row.result.pooledCoefficientApplied ? (
                <span
                  className="text-orangeD"
                  title={`Pooled coefficient applied to ${row.result.pooledCategories.join(", ")}`}
                >
                  {" †"}
                </span>
              ) : null}
            </span>
            <KindPill kind={row.kind} />
            {row.result.capacityBinds ? (
              <Pill variant="amber">Capacity binds</Pill>
            ) : null}
            {row.result.priceFractionClamped ? (
              <Pill variant="amber">Priced at the curve floor</Pill>
            ) : null}
          </div>
          <div className="mt-[3px] text-[11px] font-semibold leading-[1.5] text-mute">
            {row.detail}
          </div>
          {row.scopeNote === null ? null : (
            <div className="mt-[3px] text-[11px] font-semibold leading-[1.5] text-amber">
              {row.scopeNote}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "demand",
      header: "Demand",
      numeric: true,
      cell: (row) => (
        <div>
          <div className="font-bold">{formatUnitsCompact(row.result.demandUnits)}</div>
          {row.comparison === null ? null : (
            <div className="text-[10.5px] font-semibold text-mute">
              {formatSignedFractionPct(
                row.result.demandUnits / Math.max(rows[0]?.result.demandUnits ?? 0, 1) - 1,
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "markdown",
      header: "Markdown exposure",
      numeric: true,
      cell: (row) => formatInr(row.result.markdownExposureInr),
    },
    {
      key: "lost",
      header: "Lost sales at P90",
      numeric: true,
      cell: (row) => formatInr(row.result.lostSalesInr),
    },
    {
      key: "margin",
      header: "Gross margin",
      numeric: true,
      cell: (row) => (
        <div>
          <div className="text-[13px] font-extrabold text-ink">
            {formatInr(row.result.grossMarginInr)}
          </div>
          {row.comparison === null ? null : (
            <div className="text-[10.5px] font-semibold text-mute">
              {formatSignedInr(row.comparison.marginChangeInr)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "units",
      header: "Plan units",
      numeric: true,
      className: UNIT_GROUP_FIRST,
      cell: (row) => (
        <span className="text-[13.5px] font-extrabold text-ink">
          {formatUnits(row.result.planUnits)}
        </span>
      ),
    },
    {
      key: "unitChange",
      header: "Unit change",
      numeric: true,
      className: UNIT_GROUP,
      cell: (row) =>
        row.comparison === null ? (
          <span className="text-[11px] font-bold text-mute">reference</span>
        ) : (
          <div className="flex flex-col items-end gap-[3px]">
            <span className="text-[13px] font-extrabold text-ink">
              {formatSignedUnits(row.comparison.unitChange)}
            </span>
            <Pill variant={unitTone(row.comparison.unitChange)} tabular>
              {formatSignedFractionPct(row.comparison.unitChangePct)}
            </Pill>
          </div>
        ),
    },
    {
      key: "holding",
      header: "Holding cost",
      numeric: true,
      className: UNIT_GROUP,
      cell: (row) =>
        row.comparison === null ? (
          <span className="text-[11px] font-bold text-mute">{DASH}</span>
        ) : (
          <span className="text-[13px] font-extrabold text-ink">
            {formatSignedInr(row.comparison.holdingCostChangeInr)}
          </span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        caption="Base plan against the live levers and every saved scenario, with the unit and holding-cost consequence of each"
        empty="No plan to compare."
      />

      <div className="border-t border-rule px-[20px] py-[16px]">
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          The three shaded columns are the inventory consequence, and they carry
          the same weight as the margin beside them on purpose. Holding cost is{" "}
          <b className="text-ink">
            unit change {TIMES} {formatInr(economics.holdingCostPerUnitWeekInr)}{" "}
            per unit-week {TIMES} {economics.horizonWeeks} weeks
          </b>
          , reported beside the margin rather than netted out of it, because the
          case constrains it as a separate ceiling.
        </p>

        <details className="mt-[12px]">
          <summary className="cursor-pointer text-[11.5px] font-extrabold text-orangeD">
            What each column is, and the arithmetic behind it
          </summary>
          <div className="mt-[9px] max-w-[96ch] text-[11.5px] leading-[1.65] text-body">
            <p>
              <b className="text-ink">Demand</b> is the stored p50 forecast for
              the selection multiplied by the category&apos;s own elasticity
              response to the levers. Nothing is re-scored: the model ran
              offline and these are its rows.
            </p>
            <p className="mt-[6px]">
              <b className="text-ink">Plan units</b> is what the plan commits to
              buying: demand plus the safety stock the buy plan already applies,
              which is sum(p90 - p50){" "}
              {TIMES} {economics.spreadFactor} {TIMES}{" "}
              {economics.aggregationFactor}, both read from policy_parameter.
              Run at the base setting this lands on the buy screen&apos;s own
              recommended quantity to within the per-row rounding in its stored
              payload, which is what makes the comparison mean anything.
            </p>
            <p className="mt-[6px]">
              <b className="text-ink">Markdown exposure</b> is the plan units
              left unsold if demand lands at the point forecast, valued at what
              a stranded unit gives away
              {clearanceSentence === null ? null : (
                <>
                  {" "}
                  --{" "}
                  <span className="tabular-nums">
                    {formatInr(economics.clearanceCostPerUnitInr)}
                  </span>{" "}
                  per unit, which is the same cost of being long that the
                  newsvendor service level prices
                </>
              )}
              . It scales with the realised price, because the give-away is a
              share of the price the unit was going to fetch.
            </p>
            <p className="mt-[6px]">
              <b className="text-ink">Lost sales at P90</b> is the demand the
              plan cannot serve if every week lands at the top of its own
              calibrated band at once. It is a BOUND, not an expectation, and
              deliberately the worst case: the plan buys to the applied service
              level rather than to p90, so this column is never zero, and it is
              the money the safety factors are trading against. Read the
              movement between rows rather than the level.
              {coverageMeasured === null ? null : (
                <>
                  {" "}
                  That interval&apos;s measured coverage is{" "}
                  <span className="tabular-nums">
                    {(coverageMeasured * 100).toFixed(1)}%
                  </span>
                  {coverageFolds === null ? (
                    <>
                      . Its own parameter row does not state how many folds
                      that mean covers, so no count is given here rather than
                      one inferred from the accuracy figure.
                    </>
                  ) : accuracyFolds === null ? (
                    <>
                      {" "}
                      over {coverageFolds} folds, as that parameter row states.
                      No registry row is readable in your scope, so the accuracy
                      fold count is not named beside it.
                    </>
                  ) : (
                    <>
                      {" "}
                      over {coverageFolds} folds, as that parameter row states,
                      against the {accuracyFolds} behind the accuracy figure --
                      the two differ because
                      split-conformal calibration fits its offset on a prior
                      fold and the first fold has nothing to calibrate against.
                    </>
                  )}
                </>
              )}
            </p>
            <p className="mt-[6px]">
              <b className="text-ink">Gross margin</b> is units sold at the
              scenario&apos;s realised price times the brand&apos;s own gross
              margin ({(economics.grossMargin * 100).toFixed(0)}%), less the
              markdown exposure above. Lost sales are not subtracted from it --
              they are revenue that never happened, and charging them against
              margin would count them twice.
            </p>
          </div>
        </details>

        {anyPooled ? (
          <p className="mt-[11px] max-w-[96ch] text-[11.5px] font-semibold leading-[1.6] text-amber">
            {"†"} Marked rows moved a category whose price response uses
            the POOLED coefficient rather than its own fit. The category&apos;s
            own regression did not clear the pipeline&apos;s defensibility
            floor, so it borrows the brand-wide curve; the elasticity panel names
            it and shows the r-squared that forced the substitution. That part of
            the answer is borrowed, and it is flagged here rather than applied
            silently.
          </p>
        ) : null}

        {rows.some((row) => row.result.priceFractionClamped) ? (
          <p className="mt-[8px] max-w-[96ch] text-[11.5px] font-semibold leading-[1.6] text-amber">
            A marked row asked for a realised price below the floor the fitted
            curve stops at, so it was costed at that floor instead. The units,
            the revenue and the markdown on that row all use the same clamped
            price -- they cannot disagree with each other -- but the price they
            use is not the one the levers name, and the row says so rather than
            reading a curve that was never fitted there.
          </p>
        ) : null}

        {anyCapped ? (
          <p className="mt-[8px] max-w-[96ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
            Where the capacity cap binds, the plan is cut pro rata across every
            category and the units it can no longer make appear in lost sales.
            Nothing here decides which category should lose them -- that is an
            allocation question and it has its own screen.
          </p>
        ) : null}
      </div>
    </>
  );
}

export default ComparisonTable;
