import {
  Banner,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  Why,
  type Column,
} from "@/components";

import {
  MAX_DEPTH,
  MIN_PROMOS_PER_CATEGORY,
  MIN_R2,
  PIPELINE_SOURCE,
  type FitLedger,
} from "./constants";
import {
  DASH,
  formatCoefficient,
  formatCount,
  formatFittedForm,
  formatFractionPct,
  formatR2,
} from "./format";
import type { CategoryFit, MarkdownRow } from "./types";

/**
 * ELASTICITY PROVENANCE -- how much to trust each depth on this screen.
 *
 * Every recommended depth on this page is the inverse of one of the six
 * curves below. A screen that shows the depths and not the curves is asking
 * to be believed; this panel is what makes it possible to disagree.
 *
 * THREE THINGS IT HAS TO SAY, AND SAYS
 * ------------------------------------
 * 1. R-squared per category, for the brand in scope, and the promotion count
 *    behind it. Both are read from `elasticity`, and the R-squared shown is
 *    always the category's OWN even where the pooled coefficient shipped --
 *    that is the whole point of storing them separately.
 *
 * 2. Which categories fell back to the pooled coefficient, and therefore
 *    which recommended depths rest on the brand's average price response
 *    rather than on their own category's. A pooled depth is weaker evidence
 *    than a fitted one. The table above marks each row the same way, so the
 *    two never disagree.
 *
 * 3. What was kept out of the fit. Every promotion whose outcome had not yet
 *    happened was excluded, so no future-dated uplift entered a curve that
 *    now sets prices. The kept side of that ledger is queryable -- it is the
 *    sum of n_observations across the six rows -- and is summed from the
 *    query rather than quoted. The excluded side was never shipped as a
 *    table and is named as such on screen.
 */

export type ElasticityPanelProps = {
  fits: readonly CategoryFit[];
  rows: readonly MarkdownRow[];
  brandId: string;
  /** The workbook-side counts, which have no table behind them. */
  ledger: FitLedger | null;
};

function StrengthBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  const weak = value !== null && value < MIN_R2;
  return (
    <div className="mt-[5px] h-[5px] w-[86px] overflow-hidden rounded-pill bg-cream">
      <div
        className={`h-full rounded-pill ${weak ? "bg-amber" : "bg-violet"}`}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </div>
  );
}

const COLUMNS: ReadonlyArray<Column<CategoryFit>> = [
  {
    key: "category",
    header: "Category",
    cell: (fit) => (
      <span className="text-[12.5px] font-extrabold text-ink">
        {fit.categoryLabel}
        <span className="ml-[7px] font-mono text-[10.5px] font-semibold text-mute">
          {fit.categoryId}
        </span>
      </span>
    ),
  },
  {
    key: "coefficient",
    header: "Coefficient shipped",
    numeric: true,
    cell: (fit) => formatCoefficient(fit.coefficient),
  },
  {
    key: "r2",
    header: "R-squared, own fit",
    numeric: true,
    cell: (fit) => (
      <span className="inline-flex flex-col items-end">
        <b
          className={`font-extrabold tabular-nums ${
            fit.rSquared !== null && fit.rSquared < MIN_R2
              ? "text-amber"
              : "text-ink"
          }`}
        >
          {formatR2(fit.rSquared)}
        </b>
        <StrengthBar value={fit.rSquared} />
      </span>
    ),
  },
  {
    key: "n",
    header: "Promotions fitted",
    numeric: true,
    cell: (fit) => formatCount(fit.nObservations),
  },
  {
    key: "source",
    header: "Source",
    cell: (fit) => (
      <Pill variant={fit.isPooled ? "amber" : "grey"}>
        {fit.isPooled ? "Pooled" : "Own fit"}
      </Pill>
    ),
  },
  // DELETED: "How far a depth from it carries".
  //
  // It rendered one of two sentences per row, and on this brand every row got
  // the same one -- six verbatim copies of the same 23 words, 138 words of
  // column saying what the "Own fit" badge two columns left already says. The
  // pooled variant is the only one that carried anything extra, and that is
  // now the sentence under the table, shown only when a row is actually
  // pooled. Both sentences are preserved in the panel's Why.
];

export function ElasticityPanel({
  fits,
  rows,
  brandId,
  ledger,
}: ElasticityPanelProps) {
  const pooled = fits.filter((fit) => fit.isPooled);
  const thin = fits.filter(
    (fit) =>
      fit.nObservations !== null && fit.nObservations < MIN_PROMOS_PER_CATEGORY,
  );

  // The kept side of the drop ledger, summed from the query rather than
  // quoted: one fit per category, each keeping its own usable promotion
  // count, so the six add up to the rows the regression actually saw.
  const fittedTotal = fits.reduce(
    (sum, fit) => sum + (fit.nObservations ?? 0),
    0,
  );

  const pooledCategories = new Set(pooled.map((fit) => fit.categoryId));
  const rowsOnPooled = rows.filter((row) => pooledCategories.has(row.categoryId));

  // The spread of FITTED responses across the brand, which is the argument
  // for why a pooled coefficient is a weaker claim than a category's own.
  // Pooled rows are excluded: the coefficient they ship is the brand average
  // itself, so counting it would put the thing being argued against inside
  // the spread that is meant to argue against it, and would call a value
  // that was never fitted "fitted".
  const fittedCoefficients = fits
    .filter((fit) => !fit.isPooled)
    .map((fit) => fit.coefficient)
    .filter((value): value is number => typeof value === "number");
  const strongest =
    fittedCoefficients.length > 0 ? Math.min(...fittedCoefficients) : null;
  const weakest =
    fittedCoefficients.length > 0 ? Math.max(...fittedCoefficients) : null;

  return (
    <Card>
      <CardHeader
        title="Where the depths come from"
        subtitle={`Fitted price elasticity for ${brandId}, and how much weight each row can carry`}
      />

      {pooled.length > 0 ? (
        <CardBody>
          <Banner
            variant="amber"
            icon="!"
            title={`${pooled
              .map((fit) => `${brandId} ${fit.categoryId}`)
              .join(", ")} ships the pooled coefficient, not its own`}
            measureCh={96}
          >
            {pooled
              .map(
                (fit) =>
                  `${fit.categoryLabel} fitted at R-squared ${formatR2(
                    fit.rSquared,
                  )} on ${formatCount(
                    fit.nObservations,
                  )} promotions, below the ${MIN_R2.toFixed(2)} floor`,
              )
              .join("; ")}
            . A per-category coefficient nobody can defend is worse than a
            pooled one that can be, so the brand-wide fit shipped on{" "}
            {pooled.length === 1 ? "that row" : "those rows"} while the
            category&apos;s own R-squared and promotion count stayed on it, in
            the open, as the reason.{" "}
            {rowsOnPooled.length > 0
              ? `${rowsOnPooled.length} of the recommendations above (${rowsOnPooled
                  .map((row) => row.styleId)
                  .join(", ")}) rest on it, and are marked "Pooled" in the Fit column.`
              : "No recommendation currently in your scope rests on it."}
          </Banner>
        </CardBody>
      ) : null}

      <DataTable
        columns={COLUMNS}
        rows={fits}
        rowKey={(fit) => fit.categoryId}
        caption="Fitted price elasticity per category"
        empty="No elasticity rows are readable for this brand, so nothing on this screen could quote a fitted curve. If the depths above are present without this table, treat them as unprovenanced and do not act on them."
      />

      <CardBody>
        {/* Four paragraphs explaining a table that already carries the
            coefficient, the fit quality, the promotion count and the
            source. All of it is true and none of it should cost a reader
            the table below. */}
        <Why
          lead={`Every depth here is priced off ${brandId}'s own fitted elasticity.`}
          label="the fit, the rails and where the numbers come from"
          className="block max-w-[92ch]"
        >
        <span className="block">
          The form is not assumed, it is fitted:{" "}
          <span className="font-mono text-[11px] text-ink">
            {fits[0]
              ? formatFittedForm(fits[0].intercept, fits[0].coefficient)
              : formatFittedForm(null, null)}
          </span>{" "}
          is the {fits[0]?.categoryLabel ?? "first"} row, and every category
          gets its own least-squares fit of log uplift on the log of the price
          actually paid. A negative coefficient is the economically sensible
          sign -- cut price, sell more -- and its magnitude is the elasticity
          itself: {formatCoefficient(fits[0]?.coefficient ?? null)} means a
          one percent cut in realised price buys roughly{" "}
          {fits[0]?.coefficient === null || fits[0]?.coefficient === undefined
            ? DASH
            : Math.abs(fits[0].coefficient).toFixed(2)}
          % more units. Two rails sit above the fit and both are visible
          here: a category keeps its own coefficient only if it clears an
          R-squared floor of {MIN_R2.toFixed(2)} and has at least{" "}
          {MIN_PROMOS_PER_CATEGORY} usable promotions
          {thin.length > 0
            ? `, and ${thin.length} ${
                thin.length === 1 ? "category is" : "categories are"
              } below that promotion count`
            : ", and no category here is short of that count"}
          .
        </span>

        <span className="mt-[10px] block">
          <b className="text-ink">
            A depth resting on a pooled coefficient is weaker than one resting
            on a category fit.
          </b>{" "}
          The pooled curve is the brand&apos;s average price response across
          every category, so a depth taken from it assumes this category
          behaves like the brand. It usually does not:{" "}
          {fittedCoefficients.length > 1
            ? `on ${brandId} the ${fittedCoefficients.length} categories that kept their own fitted coefficient span ${formatCoefficient(
                strongest,
              )} to ${formatCoefficient(
                weakest,
              )}, which is a real spread in how hard a cut has to work.`
            : fittedCoefficients.length === 1
              ? `on ${brandId} only one category kept its own fitted coefficient (${formatCoefficient(
                  strongest,
                )}), so there is no fitted spread to quote here -- which is itself how much work the pooled figure is doing on this brand.`
              : `on ${brandId} no category kept its own fitted coefficient, so there is no fitted spread to quote at all: every depth on this screen is the brand's pooled average and none of them is that category's own measured response.`}{" "}
          {pooled.length === 0
            ? `No category on this brand fell back: all ${fits.length} cleared both rails, so every depth on this screen is that category's own measured response. The rule is stated anyway, because it is the rule and not a note about today's data.`
            : `That is why the ${
                pooled.length === 1 ? "row" : "rows"
              } above ${
                pooled.length === 1 ? "is" : "are"
              } marked in the table, in the Fit column of the recommendations, and in the banner -- three places, because a planner who misses it has been misled by the screen rather than by the model.`}
        </span>

        {ledger ? (
          <span className="mt-[10px] block">
            <b className="text-ink">Nothing future-dated entered the fit.</b>{" "}
            The {brandId} workbook holds {ledger.promotionsInWorkbook}{" "}
            promotions. {ledger.plannedExcluded} of them carry status PLANNED
            and sit in {ledger.plannedWindow}, past the{" "}
            {ledger.lastHistoryWeek} end of history, yet still carry a
            populated observed uplift. Every single one was excluded --{" "}
            {ledger.plannedExcluded} of {ledger.plannedExcluded}, not a
            sample -- because fitting a price curve on an outcome that has not
            happened is exactly the forward leakage the pipeline&apos;s
            leakage assertion exists to stop. What is left, and what the{" "}
            {fits.length} rows above were fitted on, is{" "}
            <b className="text-ink tabular-nums">{formatCount(fittedTotal)}</b>{" "}
            executed promotions whose outcome was already observable -- and
            that figure is the sum of the promotion counts in the table, not a
            number typed in beside it. Their observed depths run from{" "}
            {formatFractionPct(ledger.shallowestObservedDepth, 0)} to{" "}
            {formatFractionPct(ledger.deepestObservedDepth, 1)}, which is why
            the {formatFractionPct(MAX_DEPTH, 0)} cap on a recommended cut is a
            hard stop rather than a working value: it already sits well outside
            the range the curve was fitted over.
          </span>
        ) : null}

        <span className="mt-[10px] block">
          Provenance of the numbers in this panel. Read from the database: the
          coefficients, intercepts, R-squareds, promotion counts and pooled
          flags are rows in{" "}
          <span className="font-mono text-[10.5px]">elasticity</span>, read
          with your session, and the {formatCount(fittedTotal)} fitted total
          is the sum of those promotion counts rather than a figure of its
          own. That table is readable to any signed-in user, so it shows all{" "}
          {fits.length} categories for {brandId} even where the
          recommendations above are narrowed to the categories on your planner
          record -- the fit is a property of the brand, not of your scope, and
          hiding the rest of it would misrepresent the model rather than
          protect anything.
        </span>

        <span className="mt-[8px] block">
          Not read from the database, because no table holds them. There are{" "}
          {ledger ? "nine" : "three"} such figures on this panel and these are
          all of them. Three are pipeline policy thresholds -- the{" "}
          {MIN_R2.toFixed(2)} R-squared floor, the{" "}
          {MIN_PROMOS_PER_CATEGORY}-promotion minimum and the{" "}
          {formatFractionPct(MAX_DEPTH, 0)} depth ceiling -- which live as
          module constants in {PIPELINE_SOURCE} and were never written to{" "}
          <span className="font-mono text-[10.5px]">policy_parameter</span>,
          so there is no row to read them from.
          {ledger
            ? ` The other six are workbook measurements, all of them in the paragraph above: the ${ledger.promotionsInWorkbook} promotions in the workbook, the ${ledger.plannedExcluded} excluded, the ${ledger.plannedWindow} weeks those excluded rows fall in, the ${ledger.lastHistoryWeek} end of history, and the two ends of the observed depth range, ${formatFractionPct(
                ledger.shallowestObservedDepth,
                0,
              )} and ${formatFractionPct(
                ledger.deepestObservedDepth,
                1,
              )}. The fit publishes its drop ledger to a log rather than to the database, so all six were measured by re-running its exclusion rule over the ${brandId} promotion workbook itself. ${PIPELINE_SOURCE} states the end of history, the window and the deepest observed discount, and the workbook agrees with it on all three; the shallowest observed discount is stated nowhere in ${PIPELINE_SOURCE} and is a direct reading of the workbook, so it is quoted here as that and not as a pipeline figure.`
            : ` This brand has no drop ledger on file, so the paragraph on what was kept out of the fit is absent rather than filled in from another brand's counts.`}
        </span>
        </Why>
      </CardBody>
    </Card>
  );
}
