import { Card, CardHeader, DataTable, Pill, type Column } from "@/components";

import {
  LEAD_SEARCH_MAX_LAG_WEEKS,
  LEAD_SEARCH_MIN_OVERLAP_WEEKS,
} from "./contract";
import {
  formatCorrelation,
  formatLead,
  formatThreshold,
  joinNames,
  pairLabel,
  plural,
} from "./format";
import { verdictFor, type GateRule, type GateVerdict, type SignalPair } from "./types";

/**
 * MEASURED LEAD, AND NEVER WITHOUT ITS CORRELATION.
 *
 * A three-week lead at r=0.26 and a four-week lead at r=0.84 are not the
 * same claim, and a table that put the leads in one column and the
 * correlations in another would let a reader skim the leads alone and treat
 * them as equivalent. So the correlation is printed INSIDE the lead cell,
 * directly under the number, where it cannot be read past -- and printed
 * again as a bar whose length is the correlation itself, so 0.26 is a
 * quarter of the width of 0.84 and the difference survives being glanced at.
 *
 * Pairs below the admission threshold are greyed across the whole row and
 * carry the bar in stone rather than orange. They are NOT removed. The five
 * weak pairs are the most informative rows on this screen: they are what a
 * measured claim looks like when the measurement comes back negative, and a
 * screen that hid them would be asserting that external signals work
 * everywhere, which this dataset says they do not.
 */

const VERDICT: Record<
  GateVerdict,
  { pill: string; tone: "up" | "amber" | "grey"; bar: string; muted: boolean }
> = {
  weighted: { pill: "Weighted", tone: "up", bar: "bg-orange", muted: false },
  concurrent: {
    pill: "No forward window",
    tone: "amber",
    bar: "bg-amber",
    muted: false,
  },
  below: {
    pill: "Displayed, not weighted",
    tone: "grey",
    bar: "bg-rule2",
    muted: true,
  },
  unmeasured: { pill: "Not measured", tone: "grey", bar: "bg-rule2", muted: true },
  "no-gate": { pill: "No gate readable", tone: "grey", bar: "bg-rule2", muted: true },
};

function StrengthBar({
  correlation,
  fill,
}: {
  correlation: number | null;
  fill: string;
}) {
  // The bar is the correlation, not a rank and not a normalised score: a
  // pair at 0.056 gets 5.6% of the track, which is what the measurement
  // says. Rescaling to the strongest pair would make the weakest look
  // moderate on a screen whose entire argument is that it is not.
  const width = correlation === null ? 0 : Math.min(100, Math.abs(correlation) * 100);
  return (
    <div className="flex items-center justify-end gap-[10px]">
      <span className="tabular-nums font-bold">{formatCorrelation(correlation)}</span>
      <span
        className="block h-[7px] w-[96px] shrink-0 overflow-hidden rounded-pill bg-cream"
        aria-hidden="true"
      >
        <span
          className={`block h-full rounded-pill ${fill}`}
          style={{ width: `${width}%` }}
        />
      </span>
    </div>
  );
}

export type LeadTableProps = {
  pairs: readonly SignalPair[];
  gates: Record<string, GateRule>;
};

export function LeadTable({ pairs, gates }: LeadTableProps) {
  const thresholds = [
    ...new Set(
      Object.values(gates).map((gate) => gate.minCorrelation),
    ),
  ].sort((a, b) => a - b);

  const verdicts = pairs.map((pair) => verdictFor(pair, gates[pair.brandId]));
  const below = pairs.filter((_, index) => verdicts[index] === "below");
  const concurrent = pairs.filter((_, index) => verdicts[index] === "concurrent");

  const columns: ReadonlyArray<Column<SignalPair>> = [
    {
      key: "series",
      header: "Brand and category",
      cell: (pair) => (
        <div>
          <div className="font-bold text-ink">{pair.categoryName}</div>
          <div className="text-[11px] font-semibold text-mute">
            {pair.brandName} <span className="font-mono text-[10.5px]">{pair.key}</span>
          </div>
        </div>
      ),
    },
    {
      key: "lead",
      header: "Measured lead",
      align: "right",
      headerClassName: "w-[150px]",
      cell: (pair) => (
        // Lead and correlation in ONE cell. This is the rule of the screen
        // expressed as markup: there is no arrangement of these two columns
        // that shows a reader the lead without the number that qualifies it.
        <div>
          <div className="tabular-nums text-[13px] font-extrabold">
            {formatLead(pair.leadWeeks)}
          </div>
          <div className="text-[11px] font-semibold text-mute tabular-nums">
            at r {formatCorrelation(pair.correlation)}
          </div>
        </div>
      ),
    },
    {
      key: "strength",
      header: "Correlation at that lag",
      align: "right",
      headerClassName: "w-[220px]",
      cell: (pair, index) => (
        <StrengthBar
          correlation={pair.correlation}
          fill={VERDICT[verdicts[index] ?? "no-gate"].bar}
        />
      ),
    },
    {
      key: "verdict",
      header: "Against the gate",
      headerClassName: "w-[190px]",
      cell: (_pair, index) => {
        const verdict = VERDICT[verdicts[index] ?? "no-gate"];
        return <Pill variant={verdict.tone}>{verdict.pill}</Pill>;
      },
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Measured lead by brand and category"
        subtitle={
          thresholds.length === 1
            ? `Deseasonalised cross-correlation, measured per category, admitted at r ${formatThreshold(thresholds[0])}`
            : "Deseasonalised cross-correlation, measured per category"
        }
      />
      <DataTable
        columns={columns}
        rows={pairs}
        rowKey={(pair) => pair.key}
        rowClassName={(_pair, index) =>
          VERDICT[verdicts[index] ?? "no-gate"].muted
            ? "bg-shell [&>td]:text-mute"
            : undefined
        }
        caption="Measured signal lead and its correlation, per brand and category"
        empty="No signal series are readable in your scope, so there is no lead to measure. Row level security filters this table to your brand and to the categories on your planner record."
      />
      <div className="border-t border-rule px-[20px] py-[16px]">
        <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
          Every lead above was found by lagging deseasonalised search interest
          against deseasonalised demand for the same category and keeping the
          lag with the strongest correlation. Deseasonalising first is what
          makes the number mean anything: signal and demand share an annual
          cycle, so on the raw series every lag correlates strongly for reasons
          that have nothing to do with one leading the other. The search
          covered lags of 0 to {LEAD_SEARCH_MAX_LAG_WEEKS} weeks and scored a
          lag only where at least {LEAD_SEARCH_MIN_OVERLAP_WEEKS} paired weeks
          survived the lag -- neither figure is in a table, both come from the
          pipeline module that wrote these rows, and both are listed under
          &ldquo;What has no table behind it&rdquo; below. A lead of{" "}
          <em>same week</em> is therefore a search that looked{" "}
          {LEAD_SEARCH_MAX_LAG_WEEKS} weeks ahead and found nothing better,
          not a search that never looked.
        </p>
        {below.length > 0 ? (
          <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
            <b className="text-ink">
              {plural(below.length, "pair falls", "pairs fall")} below the
              threshold
            </b>{" "}
            of the {plural(pairs.length, "pair", "pairs")} readable here:{" "}
            {joinNames(
              below.map(
                (pair) =>
                  `${pairLabel(pair.brandName, pair.categoryName)} at r ${formatCorrelation(pair.correlation)}`,
              ),
            )}
            . Those rows stay on the screen, greyed, because a measurement that
            came back weak is evidence and deleting it would leave the
            impression that external signals lead demand everywhere.
          </p>
        ) : null}
        {concurrent.length > 0 ? (
          <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
            {joinNames(
              concurrent.map((pair) =>
                pairLabel(pair.brandName, pair.categoryName),
              ),
            )}{" "}
            {concurrent.length === 1 ? "clears" : "clear"} the correlation bar
            but {concurrent.length === 1 ? "peaks" : "peak"} at a lead of zero.
            The signal is real and it moves with demand rather than ahead of
            it, so there is no forward window to brief a campaign into. That is
            a third state, not a pass: reading it as a pass would promise
            planning time that the measurement does not support.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export default LeadTable;
