import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import { Finding } from "./Layout";
import {
  DASH,
  formatCount,
  formatCrore,
  formatDay,
  formatFractionPct,
  formatMultiple,
  formatShare,
  fractionOf,
  plural,
} from "./format";
import type { ConcentrationRow, GridRow, MarkdownView } from "./types";

/**
 * MARKDOWN CONCENTRATION -- where the exposure actually sits.
 *
 * A single portfolio markdown number is the least useful figure a CMPO can
 * be given: it is large, it is true, and it names nothing anybody can act
 * on. The whole point of this panel is the second derivative -- not how much
 * markdown there is, but whether it is spread evenly or piled somewhere.
 *
 * THE COMPARISON THAT MAKES IT A FINDING
 * --------------------------------------
 * Rupees of markdown loss track how big a category or a region is. A large
 * region will always carry more markdown than a small one, which is not a
 * finding, it is arithmetic. So this panel shows the RATE alongside the
 * rupees -- loss as a share of net revenue over the same window -- and the
 * spread of that rate is computed for both cuts. Where the rate is flat, the
 * rupee differences are size; where the rate varies, there is something to
 * look at. Which of the two cuts that turns out to be is read off the data
 * at request time and stated in the finding, not decided here.
 *
 * TWO TABLES, TWO DIFFERENT CLAIMS, NOT MERGED
 * --------------------------------------------
 * The concentration above comes from fact_demand_weekly: markdown that has
 * ALREADY LANDED. The table below comes from markdown_recommendation: what
 * the optimiser says to do next, and it has no region column at all.
 * Spreading its category figures across regions in proportion to realised
 * loss would have produced a complete-looking grid and a number with no
 * source. It is not done, the two stay separate, and the reason is on screen.
 */

const ORANGE = "#D04A02";

// --------------------------------------------------------------- rate spread

type Spread = {
  low: ConcentrationRow;
  high: ConcentrationRow;
  /** Percentage points between the two. */
  points: number;
  /** high / low, as a multiple. Null where the low rate is zero. */
  multiple: string;
};

/**
 * The narrowest and widest markdown rate in a cut.
 *
 * Rows with no revenue in the window have no rate and are excluded rather
 * than treated as zero: a category that sold nothing did not achieve a 0%
 * markdown rate, it has no rate.
 */
function rateSpread(rows: readonly ConcentrationRow[]): Spread | null {
  const rated = rows.filter(
    (row): row is ConcentrationRow & { rate: number } => row.rate !== null,
  );
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => a.rate - b.rate);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  return {
    low,
    high,
    points: Math.round((high.rate - low.rate) * 1000) / 10,
    multiple: formatMultiple(high.rate, low.rate),
  };
}

// ------------------------------------------------------------- share bar list

function ShareList({
  rows,
  total,
  caption,
}: {
  rows: readonly ConcentrationRow[];
  total: number;
  caption: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-small font-semibold text-mute">
        No rows in this cut for the window in scope.
      </p>
    );
  }

  const widest = rows.reduce((most, row) => Math.max(most, row.lossInr), 0);

  return (
    <ul className="flex flex-col" aria-label={caption}>
      {rows.map((row) => (
        <li
          key={row.key}
          className="border-b border-rule py-[10px] last:border-b-0"
        >
          <div className="flex items-baseline justify-between gap-[10px]">
            <span className="text-copy font-extrabold text-ink">
              {row.label}
            </span>
            <span className="shrink-0 text-copy font-extrabold tabular text-ink">
              {formatCrore(row.lossInr)}
            </span>
          </div>
          <div className="mt-[5px] h-[7px] overflow-hidden rounded-pill bg-cream">
            <div
              className="h-full rounded-pill"
              style={{
                width: `${fractionOf(row.lossInr, widest) * 100}%`,
                backgroundColor: ORANGE,
              }}
            />
          </div>
          <div className="mt-[4px] flex items-baseline justify-between gap-[10px] text-small font-semibold text-mute">
            <span>{formatShare(row.lossInr, total)} of the loss in scope</span>
            <span className="tabular">
              {formatFractionPct(row.rate)} of its own revenue
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ the grid

function gridColumns(
  regions: readonly { id: string; label: string }[],
  hottest: number,
): Column<GridRow>[] {
  const cells: Column<GridRow>[] = regions.map((region, index) => ({
    key: region.id,
    header: region.label,
    numeric: true,
    cell: (row) => {
      const cell = row.cells[index];
      if (!cell) return <span className="text-mute">{DASH}</span>;
      const alpha = hottest > 0 ? (cell.lossInr / hottest) * 0.9 : 0;
      return (
        <span
          className="inline-block rounded-[5px] px-[7px] py-[3px] tabular"
          style={{
            backgroundColor: `rgba(208, 74, 2, ${alpha.toFixed(3)})`,
            color: alpha > 0.5 ? "#FFFFFF" : "#231F1C",
          }}
          title={`${formatFractionPct(cell.rate)} of revenue`}
        >
          {formatCrore(cell.lossInr)}
        </span>
      );
    },
  }));

  return [
    {
      key: "category",
      header: "Category",
      cell: (row) => (
        <span className="font-extrabold text-ink">{row.label}</span>
      ),
    },
    ...cells,
    {
      key: "total",
      header: "Category total",
      numeric: true,
      cell: (row) => (
        <span className="font-extrabold">{formatCrore(row.lossInr)}</span>
      ),
    },
  ];
}

// ---------------------------------------------------------------- the panel

export type MarkdownConcentrationProps = {
  markdown: MarkdownView;
  /** Brand names in scope, for the sentence about what is summed together. */
  brandLabels: readonly string[];
};

export function MarkdownConcentration({
  markdown,
  brandLabels,
}: MarkdownConcentrationProps) {
  const {
    byCategory,
    byRegion,
    grid,
    regions,
    totalLossInr,
    totalRevenueInr,
    recommendations,
  } = markdown;

  if (byCategory.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Markdown concentration"
          subtitle="fact_demand_weekly, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No realised demand rows came back for your scope over the trailing
            window, so there is no markdown to place. What would appear here is
            the realised markdown loss of the last{" "}
            {markdown.windowWeeks > 0
              ? `${markdown.windowWeeks} weeks`
              : "planning window"}{" "}
            split by category and by region, each with its loss as a share of
            its own revenue, so that a large region carrying a large number is
            not mistaken for a region with a problem.
          </p>
        </CardBody>
      </Card>
    );
  }

  const categorySpread = rateSpread(byCategory);
  const regionSpread = rateSpread(byRegion);
  const portfolioRate = totalRevenueInr > 0 ? totalLossInr / totalRevenueInr : null;

  const hottest = grid.reduce(
    (most, row) =>
      row.cells.reduce((inner, cell) => Math.max(inner, cell.lossInr), most),
    0,
  );

  // Which cut actually concentrates, decided by the numbers. If the region
  // rate ever spread wider than the category rate, this sentence flips.
  const categoryConcentrates =
    categorySpread !== null &&
    regionSpread !== null &&
    categorySpread.points > regionSpread.points;

  const top = byCategory.slice(0, 3);
  const topLoss = top.reduce((sum, row) => sum + row.lossInr, 0);

  const actNow = recommendations.reduce((sum, row) => sum + row.actNow, 0);
  const recStyles = recommendations.reduce((sum, row) => sum + row.styles, 0);
  const recSaved = recommendations.reduce(
    (sum, row) => sum + row.marginSavedInr,
    0,
  );

  // Does the optimiser point where the damage already is? Read off the join
  // rather than asserted, so the sentence flips if the rows do. The
  // recommendations are already sorted by margin saved, so [0] is the largest.
  const biggestRec = recommendations[0] ?? null;
  const alignment =
    biggestRec && biggestRec.realisedRate !== null && portfolioRate !== null ? (
      <>
        On these rows the largest recommended saving is {biggestRec.label} at{" "}
        {biggestRec.brandId}, where markdown has already been running at{" "}
        {formatFractionPct(biggestRec.realisedRate)} of that pair&apos;s revenue
        against {formatFractionPct(portfolioRate)} across your whole scope
        {DASH}{" "}
        {biggestRec.realisedRate > portfolioRate
          ? "so it is compounding a problem that is already visible in the actuals, not opening a new front."
          : "so it is getting ahead of a category the realised numbers have not yet flagged, which is the harder recommendation to accept and the more valuable one if it holds."}
      </>
    ) : null;

  return (
    <div className="flex flex-col gap-[16px]">
      <Card>
        <CardHeader
          title="Markdown that has already landed"
          subtitle={
            markdown.firstWeek && markdown.lastWeek
              ? `${markdown.windowWeeks} weeks to ${formatDay(markdown.lastWeek)}, from ${formatCount(markdown.rowsRead)} weekly rows`
              : "Trailing window of realised demand"
          }
          actions={
            <Pill variant="orange" tabular>
              {formatCrore(totalLossInr)} {DASH}{" "}
              {formatFractionPct(portfolioRate)} of revenue
            </Pill>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-[26px] max-[1140px]:grid-cols-1">
            <div>
              <div className="mb-[6px] text-micro font-extrabold tracking-[0.06em] text-mute">
                BY CATEGORY
              </div>
              <ShareList
                rows={byCategory}
                total={totalLossInr}
                caption="Realised markdown loss by category"
              />
            </div>
            <div>
              <div className="mb-[6px] text-micro font-extrabold tracking-[0.06em] text-mute">
                BY REGION
              </div>
              <ShareList
                rows={byRegion}
                total={totalLossInr}
                caption="Realised markdown loss by region"
              />
            </div>
          </div>

          <Finding label="Read the rate column, not the rupees">
            {top.length > 0 ? (
              <>
                {plural(top.length, "The largest category", "The largest categories")}{" "}
                by rupees {DASH}{" "}
                {top.map((row) => row.label).join(", ")} {DASH} carr
                {top.length === 1 ? "ies" : "y"}{" "}
                {formatShare(topLoss, totalLossInr)} of the markdown loss in
                scope. That is partly just size.{" "}
              </>
            ) : null}
            {categorySpread && regionSpread ? (
              <>
                What is not size is the rate. Across regions the markdown rate
                runs from {formatFractionPct(regionSpread.low.rate)} (
                {regionSpread.low.label}) to{" "}
                {formatFractionPct(regionSpread.high.rate)} (
                {regionSpread.high.label}) {DASH} a spread of{" "}
                {regionSpread.points.toFixed(1)} points. Across categories it
                runs from {formatFractionPct(categorySpread.low.rate)} (
                {categorySpread.low.label}) to{" "}
                {formatFractionPct(categorySpread.high.rate)} (
                {categorySpread.high.label}), a spread of{" "}
                {categorySpread.points.toFixed(1)} points and a factor of{" "}
                {categorySpread.multiple}.{" "}
                {categoryConcentrates ? (
                  <>
                    So the exposure is a CATEGORY property, not a regional one.
                    Every region discounts at roughly the same rate; what
                    differs is what they are discounting. A regional
                    intervention would spread effort evenly across a problem
                    that is not evenly spread.
                  </>
                ) : (
                  <>
                    So on this window the regional rate spread is the wider of
                    the two, which is the reverse of the usual pattern and
                    worth a regional look before a category one.
                  </>
                )}
              </>
            ) : (
              <>
                Too few rated rows came back to compare the two cuts, so no
                claim about which one concentrates is made.
              </>
            )}
          </Finding>

          {brandLabels.length > 1 ? (
            <Finding label="What is summed together here">
              These category and region totals sum{" "}
              {brandLabels.join(" and ")} together, because that is the scope
              you are viewing. The two brands discount differently and the
              switcher at the top of this screen separates them; a category row
              here is the pair added, not an average of the two.
            </Finding>
          ) : null}

          {markdown.truncated ? (
            <Finding label="This window is incomplete">
              The read hit its row ceiling before the window was exhausted, so
              the totals above understate the period. Nothing has been
              extrapolated to cover the gap {DASH} the figures are the rows
              that were actually read, and this line is here so they are not
              mistaken for the whole window.
            </Finding>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Category by region"
          subtitle="The same realised loss, crossed. Shading is the cell's size against the largest cell."
        />
        <DataTable
          columns={gridColumns(regions, hottest)}
          rows={grid}
          rowKey={(row) => row.key}
          caption="Realised markdown loss by category and region"
          empty="No cells in scope for this window."
        />
        <CardBody>
          <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
            Hover a cell for its markdown rate against that cell&apos;s own
            revenue. The grid is here because a category total can hide a
            single region doing all the damage, and a region total can hide a
            single category {DASH} the cross is the only place that shows.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What the optimiser says to do next"
          subtitle="markdown_recommendation -- a different claim from the loss above, and kept separate"
          actions={
            recommendations.length > 0 ? (
              <Pill variant="violet">
                {formatCrore(recSaved)} margin saved by timing
              </Pill>
            ) : undefined
          }
        />
        {recommendations.length === 0 ? (
          <CardBody>
            <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
              No markdown recommendations are readable in your scope. What
              would appear here is the optimiser&apos;s per-category exposure:
              how many styles it wants marked down, how deep, how many it
              wants marked down immediately, and the margin the timing saves
              against leaving them to clear late.
            </p>
          </CardBody>
        ) : (
          <>
            <DataTable
              columns={
                [
                  {
                    key: "category",
                    header: "Category",
                    cell: (row) => (
                      <span className="font-extrabold text-ink">
                        {row.label}
                      </span>
                    ),
                  },
                  {
                    key: "brand",
                    header: "Brand",
                    cell: (row) => (
                      <span className="text-mute font-semibold">
                        {row.brandId}
                      </span>
                    ),
                  },
                  {
                    key: "styles",
                    header: "Styles",
                    numeric: true,
                    cell: (row) => formatCount(row.styles),
                  },
                  {
                    key: "now",
                    header: markdown.actNowTiming
                      ? `Timed "${markdown.actNowTiming}"`
                      : "Earliest week",
                    numeric: true,
                    cell: (row) =>
                      row.actNow > 0 ? (
                        <b className="text-orangeD">{formatCount(row.actNow)}</b>
                      ) : (
                        <span className="text-mute">{DASH}</span>
                      ),
                  },
                  {
                    key: "depth",
                    header: "Mean depth",
                    numeric: true,
                    cell: (row) => formatFractionPct(row.meanDepth, 0),
                  },
                  {
                    key: "leftover",
                    header: "Projected leftover units",
                    numeric: true,
                    cell: (row) => formatCount(Math.round(row.leftoverUnits)),
                  },
                  {
                    key: "saved",
                    header: "Margin saved by acting on time",
                    numeric: true,
                    cell: (row) => (
                      <b>{formatCrore(row.marginSavedInr)}</b>
                    ),
                  },
                  {
                    // The join to fact_demand_weekly, on brand and category.
                    key: "realised",
                    header: "Markdown already taken there",
                    numeric: true,
                    cell: (row) =>
                      row.realisedLossInr === null ? (
                        <span className="text-mute">{DASH}</span>
                      ) : (
                        <span>
                          {formatCrore(row.realisedLossInr)}
                          <span className="ml-[6px] text-mute font-semibold">
                            {formatFractionPct(row.realisedRate)}
                          </span>
                        </span>
                      ),
                  },
                ] satisfies Column<(typeof recommendations)[number]>[]
              }
              rows={recommendations}
              rowKey={(row) => `${row.brandId}-${row.categoryId}`}
              caption="Recommended markdown exposure by category"
            />
            <CardBody>
              <Finding label="What the last column is, and what it is not">
                The final column is the join: realised markdown loss for the
                same brand and category over the same trailing window, from
                fact_demand_weekly. It is a DIFFERENT claim from everything
                left of it {DASH} what has already happened, against what the
                optimiser proposes next {DASH} and the two are placed side by
                side rather than combined, because adding a realised loss to a
                projected saving produces a number that describes no period at
                all. Read across a row to see whether the optimiser is
                pointing at a category that has already been bleeding, or at
                one where the damage has not started.{" "}
                {alignment ? alignment : null}
              </Finding>

              <Finding label="Why this table has no region column">
                markdown_recommendation carries brand, category and style, and
                no region at all {DASH} the optimiser works at style level,
                and a style is not regional. The realised loss above could be
                cut both ways because fact_demand_weekly records the region a
                sale happened in; the recommendation cannot, so it is not.
                Allocating these category figures across regions in proportion
                to realised loss would have produced a matching grid and a
                number with nothing behind it, which is why the join above
                stops at brand and category {DASH} that is the only key the
                two tables actually share.
              </Finding>
              <Finding label="What the timing column is">
                {markdown.actNowTiming ? (
                  <>
                    {formatCount(actNow)} of {formatCount(recStyles)} styles
                    carry the timing value{" "}
                    <b className="text-ink">{markdown.actNowTiming}</b>, which
                    is the label the optimiser wrote against its earliest
                    recommended week {DASH} read from the rows rather than
                    typed into this screen, so a pipeline that renamed it would
                    rename this column too. The margin saved is the difference
                    between clearing at the recommended week and clearing late;
                    it is a timing gain, not a decision anyone has taken. Who
                    acts on it, and whether they do, is a planner&apos;s
                    business and lives on the markdown screen, not here.
                  </>
                ) : (
                  <>
                    No timing label came back on these rows, so no
                    &quot;act now&quot; count is shown rather than one being
                    inferred from the week numbers.
                  </>
                )}
              </Finding>
            </CardBody>
          </>
        )}
      </Card>
    </div>
  );
}

export default MarkdownConcentration;
