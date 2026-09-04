import { Pill } from "@/components/Pill";

import {
  formatInr,
  formatMultiplier,
  formatSignedInr,
  formatSignedUnits,
  formatUnits,
} from "./format";
import type { PlanEconomics, ScenarioResult } from "./model";

/**
 * The live scenario, category by category.
 *
 * Two jobs. First, it is where the pooled-coefficient flag stops being a
 * footnote: the borrowed row is named on the line whose number it produced,
 * beside the response it produced, so "this part of the answer is borrowed"
 * is attached to the borrowed part rather than to the table as a whole.
 *
 * Second, it answers the question the totals cannot -- which category is
 * actually driving the unit change. A plan that grows by 34% because one
 * elastic category doubled is a different commercial argument from one that
 * grew evenly, and the holding cost lands in a different warehouse.
 */

export type CategoryBreakdownProps = {
  base: ScenarioResult;
  scenario: ScenarioResult;
  economics: PlanEconomics;
  /** Coefficient per category, for the response column's provenance. */
  coefficients: ReadonlyMap<string, number | null>;
};

const TH =
  "border-b border-rule px-[14px] py-[10px] text-[10.5px] font-extrabold tracking-[0.04em] text-mute";
const TD = "border-b border-rule px-[14px] py-[10px] text-[12px]";

export function CategoryBreakdown({
  base,
  scenario,
  economics,
  coefficients,
}: CategoryBreakdownProps) {
  const baseByCategory = new Map(base.rows.map((row) => [row.categoryId, row]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} text-left`}>Category</th>
            <th className={`${TH} text-right`}>Coefficient</th>
            <th className={`${TH} text-right`}>Demand response</th>
            <th className={`${TH} text-right`}>Plan units</th>
            <th className={`${TH} text-right bg-shell border-l border-rule2`}>
              Unit change
            </th>
            <th className={`${TH} text-right bg-shell`}>Holding cost</th>
            <th className={`${TH} text-right`}>Gross margin</th>
          </tr>
        </thead>
        <tbody>
          {scenario.rows.map((row) => {
            const before = baseByCategory.get(row.categoryId);
            const unitChange = row.planUnits - (before?.planUnits ?? 0);
            const holding =
              unitChange *
              economics.holdingCostPerUnitWeekInr *
              economics.horizonWeeks;
            const coefficient = coefficients.get(row.categoryId) ?? null;

            return (
              <tr
                key={row.categoryId}
                className="transition-colors duration-[120ms] hover:bg-shell"
              >
                <td className={`${TD} text-left`}>
                  <span className="font-extrabold text-ink">
                    {row.categoryName}
                  </span>
                  {row.pooledFallback ? (
                    <span className="ml-[7px] align-middle">
                      <Pill variant="amber">Pooled coefficient</Pill>
                    </span>
                  ) : null}
                  {row.unfitted ? (
                    <span className="ml-[7px] align-middle">
                      <Pill variant="grey">No fit -- price levers inert</Pill>
                    </span>
                  ) : null}
                </td>
                <td className={`${TD} text-right tabular-nums text-body`}>
                  {coefficient === null ? "--" : coefficient.toFixed(3)}
                </td>
                <td className={`${TD} text-right font-bold tabular-nums text-ink`}>
                  {formatMultiplier(row.multiplier)}
                </td>
                <td className={`${TD} text-right tabular-nums text-body`}>
                  {formatUnits(row.planUnits)}
                </td>
                <td
                  className={`${TD} text-right font-extrabold tabular-nums text-ink bg-shell border-l border-rule2`}
                >
                  {formatSignedUnits(unitChange)}
                </td>
                <td className={`${TD} text-right font-bold tabular-nums text-ink bg-shell`}>
                  {formatSignedInr(holding)}
                </td>
                <td className={`${TD} text-right tabular-nums text-body`}>
                  {formatInr(row.grossMarginInr)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CategoryBreakdown;
