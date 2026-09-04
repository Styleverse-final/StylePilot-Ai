import { Card, CardBody, CardHeader } from "@/components";
import type { ValueSummary } from "@/lib/queries";

import { formatCount, formatCrore, formatPct, fractionOf, plural } from "./format";
import { ProgressRow } from "./ProgressRow";

/**
 * ImpactTracker -- block 6.
 *
 * PROJECTED and REALISED are not the same unit, and this card refuses to
 * pretend otherwise.
 *
 *   PROJECTED comes from value_summary. Read its `basis`: markdown avoided
 *   is already a margin figure, and lost sales recovered has been converted
 *   to margin at the brand's own gross margin before being combined. That
 *   conversion is what makes total_margin_inr a legitimate sum; adding raw
 *   revenue to margin would inflate it by roughly a third.
 *
 *   REALISED is the value_at_stake carried by recommendations a planner or
 *   an agent has actually approved or modified. It is exposure committed
 *   against, not margin banked. It sits in its own row, labelled, and is
 *   never added to the projected figure.
 *
 * The realised number is small. That is the age of the decision log, not a
 * defect, and the card says so in as many words rather than hiding it.
 */

export type ImpactTrackerProps = {
  /** The value_summary row that matches the planner's scope. */
  summary: ValueSummary | null;
  /** Sum of value_at_stake_inr on rows with an APPROVED or MODIFIED decision. */
  realisedValueInr: number;
  /** How many recommendations that is. */
  decidedCount: number;
  /** Total recommendations in scope, decided or not. */
  totalCount: number;
  /** Sum of value_at_stake_inr across every row in scope, decided or not. */
  totalValueInr: number;
};

export function ImpactTracker({
  summary,
  realisedValueInr,
  decidedCount,
  totalCount,
  totalValueInr,
}: ImpactTrackerProps) {
  const markdownAvoided = summary?.markdown_avoided_margin_inr ?? null;
  const lostSales = summary?.lost_sales_recovered_margin_inr ?? null;
  const totalMargin = summary?.total_margin_inr ?? null;
  const unitChangePct = summary?.unit_change_pct ?? null;
  const holdingCost = summary?.holding_cost_change_inr ?? null;

  return (
    <Card>
      <CardHeader
        title="Value realised against projected"
        subtitle="Projected margin from value_summary; realised from decided rows only"
      />
      <CardBody>
        {summary === null && totalCount === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No value summary and no recommendations are visible in your scope,
            so there is nothing to compare. Nothing is estimated to fill the
            gap.
          </p>
        ) : (
          <>
            {summary === null ? (
              <p className="mb-[10px] text-[12.5px] leading-[1.6] text-body">
                No value_summary row is readable in your scope, so only the
                realised side is shown.
              </p>
            ) : (
              <>
                <ProgressRow
                  label="Markdown avoided"
                  value={formatCrore(markdownAvoided)}
                  fraction={fractionOf(markdownAvoided, totalMargin)}
                  note="Already a margin figure. Not converted, not double counted."
                />
                <ProgressRow
                  label="Lost sales recovered"
                  value={formatCrore(lostSales)}
                  fraction={fractionOf(lostSales, totalMargin)}
                  note="Revenue converted to margin at this brand's own gross margin before it was combined."
                />
              </>
            )}

            <ProgressRow
              label="Committed by a decision"
              value={formatCrore(realisedValueInr)}
              tone="mute"
              fraction={fractionOf(realisedValueInr, totalValueInr)}
              note={
                <>
                  Value at stake on the {formatCount(decidedCount)} of{" "}
                  {formatCount(totalCount)}{" "}
                  {plural(totalCount, "recommendation", "recommendations")} in
                  your scope that carry an approved or modified decision. This
                  is exposure a person or an agent has committed against, not
                  margin banked, so it is shown beside the projection rather
                  than inside it.
                </>
              }
            />

            {summary === null ? null : (
              <div className="mt-[12px] border-t border-rule pt-[12px]">
                <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[10px]">
                  <div>
                    <div className="text-[10.5px] font-bold text-mute">
                      Projected margin, 12 weeks
                    </div>
                    <div className="mt-[1px] text-[14px] font-extrabold tabular-nums text-ink">
                      {formatCrore(totalMargin)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-bold text-mute">
                      Unit change
                    </div>
                    <div
                      className={`mt-[1px] text-[14px] font-extrabold tabular-nums ${
                        (unitChangePct ?? 0) > 0 ? "text-amber" : "text-green"
                      }`}
                    >
                      {unitChangePct === null
                        ? "--"
                        : `${unitChangePct > 0 ? "+" : ""}${formatPct(unitChangePct)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-bold text-mute">
                      Holding cost change
                    </div>
                    <div className="mt-[1px] text-[14px] font-extrabold tabular-nums text-ink">
                      {formatCrore(holdingCost)}
                    </div>
                  </div>
                </div>
                <p className="mt-[10px] max-w-[72ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
                  {summary.basis}
                </p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default ImpactTracker;
