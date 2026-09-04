import {
  AccuracyStatement,
  Card,
  CardBody,
  CardHeader,
  ModelStrip,
  Pill,
} from "@/components";
import type { AccuracyHeadline } from "@/lib/accuracy";

import { Finding, Provenance } from "./Layout";
import {
  DASH,
  formatFractionPct,
  formatPct,
  formatPoints,
  formatTimestamp,
  joinWords,
  plural,
} from "./format";
import type {
  BenchmarkRow,
  CategoryEvidence,
  CoverageRow,
  HorizonView,
} from "./types";

/**
 * FORECAST ACCURACY, BY BRAND, AGAINST FOUR BENCHMARKS.
 *
 * PART H IS THE WHOLE DESIGN OF THIS FILE
 * ---------------------------------------
 * No number in here is an accuracy the model scored. The headline reaches
 * the screen exactly twice per brand and both times through a component that
 * refuses to render it alone: <AccuracyStatement variant="bars"/>, which puts
 * the seasonal-naive margin on the line under it, and <ModelStrip
 * accuracy={AccuracyHeadline}/>, which takes the whole object and would be a
 * type error if handed a percentage. Everything this file draws itself is a
 * BENCHMARK's accuracy and the MARGIN over it -- which is to say, the part
 * that is evidence.
 *
 * The ladder exists because one benchmark is not enough to judge a model and
 * four is roughly the point at which the shape of the result becomes an
 * argument rather than an assertion. Seasonal naive is the one that counts:
 * nobody constructed it, it carries the seasonality the business actually
 * has, and the margin over it is small -- around five points. Drift and the
 * 13-week rolling mean sit between it and the manual baseline. The manual
 * baseline sits at the bottom, twenty-plus points down, and that position is
 * the finding: a plan easier to beat than "last year's same week" is a plan
 * that was authored to a target, so the flattering margin is a property of
 * the fixture. The bars are ordered by benchmark strength, computed from the
 * numbers, so the manual baseline is not placed last by editorial choice.
 *
 * WHY THERE IS NO PER-CATEGORY BREAKDOWN
 * --------------------------------------
 * Because there is nothing to build one from, and the panel at the bottom of
 * this file says so with the evidence in hand rather than in a comment. See
 * NoCategoryAccuracy.
 */

const VIOLET = "#5B4B8A";
const STONE = "#D8CCC2";
const RULE = "#F0EBE5";
const MUTE = "#8D857D";
const INK = "#231F1C";

// ------------------------------------------------------- the benchmark ladder

const LADDER_W = 460;
const LADDER_ROW = 40;
const LADDER_HEAD = 18;
const LABEL_W = 132;
const VALUE_W = 62;

/**
 * Margin over each benchmark, in points, on one scale.
 *
 * The bar length is the MARGIN, not the accuracy. Drawing four accuracy bars
 * between 58% and 84% produces four near-identical rectangles that hide the
 * only thing that separates them; drawing the gaps makes a five-point margin
 * look like a five-point margin next to a twenty-four-point one, which is
 * exactly the comparison a reader is here to make.
 */
function MarginLadder({
  rows,
  caption,
}: {
  rows: readonly BenchmarkRow[];
  caption: string;
}) {
  const height = LADDER_HEAD + rows.length * LADDER_ROW + 6;
  const plotL = LABEL_W;
  const plotR = LADDER_W - VALUE_W - 8;
  const widest = rows.reduce(
    (most, row) => Math.max(most, Math.abs(row.marginPoints)),
    0,
  );

  return (
    <svg
      viewBox={`0 0 ${LADDER_W} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={caption}
    >
      <title>{caption}</title>

      <text x={0} y={10} fontSize={9.5} fontWeight={800} fill={MUTE}>
        BENCHMARK
      </text>
      <text x={plotL} y={10} fontSize={9.5} fontWeight={800} fill={MUTE}>
        MARGIN THE MODEL HOLDS, IN POINTS
      </text>
      <text
        x={LADDER_W}
        y={10}
        textAnchor="end"
        fontSize={9.5}
        fontWeight={800}
        fill={MUTE}
      >
        ITS OWN ACCURACY
      </text>

      {rows.map((row, index) => {
        const top = LADDER_HEAD + index * LADDER_ROW;
        const mid = top + LADDER_ROW / 2;
        const span = plotR - plotL;
        const width =
          widest > 0 ? (Math.abs(row.marginPoints) / widest) * span : 0;

        return (
          <g key={row.key}>
            <line
              x1={0}
              x2={LADDER_W}
              y1={top}
              y2={top}
              stroke={RULE}
              strokeWidth={1}
            />

            <text
              x={0}
              y={mid + 4}
              fontSize={11.5}
              fontWeight={row.authored ? 700 : 800}
              fill={row.authored ? MUTE : INK}
            >
              {row.label}
            </text>

            <rect
              x={plotL}
              y={mid - 8}
              width={Math.max(1.5, width)}
              height={16}
              rx={4}
              fill={row.authored ? STONE : VIOLET}
            />
            <text
              x={plotL + Math.max(1.5, width) + 7}
              y={mid + 4}
              fontSize={11}
              fontWeight={800}
              fill={INK}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatPoints(row.marginPoints)}
            </text>

            <text
              x={LADDER_W}
              y={mid + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight={700}
              fill={MUTE}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatPct(row.pct)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------- per-brand card

export type BrandAccuracy = {
  brandId: string;
  label: string;
  accuracy: AccuracyHeadline;
  benchmarks: BenchmarkRow[];
};

function hardest(rows: readonly BenchmarkRow[]): BenchmarkRow | null {
  return rows.find((row) => !row.authored) ?? null;
}

function BrandCard({ entry }: { entry: BrandAccuracy }) {
  const { accuracy, benchmarks } = entry;
  const toughest = hardest(benchmarks);
  const authored = benchmarks.find((row) => row.authored) ?? null;
  const unconstructed = benchmarks.filter((row) => !row.authored);

  return (
    <Card>
      <CardHeader
        title={entry.label}
        subtitle={
          accuracy.foldCount === null
            ? "Rolling-origin backtest; the registry row records no fold count"
            : `Mean of ${accuracy.foldCount} rolling-origin folds, scored on one row mask`
        }
        actions={
          <Pill variant="violet" tabular>
            MASE {accuracy.mase.toFixed(2)}
          </Pill>
        }
      />
      <CardBody>
        {/* PART H. The only route the headline takes to a screen. */}
        <AccuracyStatement accuracy={accuracy} variant="bars" />

        <div className="mt-[18px] border-t border-rule pt-[14px]">
          <div className="text-micro font-extrabold tracking-[0.06em] text-mute">
            ALL FOUR BENCHMARKS THE SCORER PUBLISHED
          </div>
          <div className="mt-[10px]">
            <MarginLadder
              rows={benchmarks}
              caption={`Margin the ${entry.label} model holds over each published benchmark: ${benchmarks
                .map(
                  (row) =>
                    `${row.label} ${formatPoints(row.marginPoints)} points, benchmark accuracy ${formatPct(row.pct)}`,
                )
                .join("; ")}.`}
            />
          </div>
        </div>

        <Finding label="How to read the ladder">
          {toughest ? (
            <>
              {toughest.label} is the bar that matters. It is the strongest of
              the {plural(unconstructed.length, "benchmark", "benchmarks")}{" "}
              nobody constructed {DASH} {formatPct(toughest.pct)} on the same
              rows {DASH} and the model clears it by{" "}
              {formatPoints(toughest.marginPoints)} points.{" "}
            </>
          ) : null}
          {authored ? (
            <>
              The {formatPoints(authored.marginPoints)} points over the manual
              baseline is the larger number and the weaker evidence: that
              baseline sits at {formatPct(authored.pct)}, below every
              unconstructed benchmark on this chart, which tells you it was
              authored rather than measured. A model that beat only that would
              have beaten nothing.{" "}
            </>
          ) : null}
          MASE {accuracy.mase.toFixed(3)} against the seasonal naive&apos;s{" "}
          {accuracy.maseSeasonalNaive.toFixed(3)} says the same thing on a
          scale-free measure, which is what lets {entry.label} be compared
          with the other brand at all: WAPE-based accuracy moves with series
          volume, MASE does not.
        </Finding>

        <ModelStrip
          className="mt-[16px]"
          modelVersion={accuracy.modelVersion}
          generatedAt={formatTimestamp(accuracy.generatedAt)}
          accuracy={accuracy}
          why={
            <>
              Every figure in this card was scored offline by the batch
              pipeline and written to model_registry; nothing here calls a
              model at request time. The four benchmarks were scored on the
              identical row mask as the model {DASH} the same weeks, the same
              series, the same exclusions for demand-censored weeks {DASH} so
              the gaps are comparable rather than four separately-framed
              experiments. The timestamp is the training run, not a
              recalculation: it moves when the pipeline reruns and at no other
              time.
            </>
          }
        />
      </CardBody>
    </Card>
  );
}

export type AccuracyByBrandProps = {
  entries: readonly BrandAccuracy[];
};

export function AccuracyByBrand({ entries }: AccuracyByBrandProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Forecast accuracy by brand"
          subtitle="model_registry, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No planning-grain registry row came back for your scope, so there
            is no backtest to show and none is estimated. What would appear
            here is one card per brand: the model against seasonal naive,
            drift, a 13-week rolling mean and the manual baseline, each scored
            on the same rows over the same rolling-origin folds, with the
            margin over each stated in points. The cold-start models are
            excluded from this panel by design {DASH} they answer a different
            question, at much lower accuracy, and averaging them in would
            flatter nothing and confuse everything.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div
      className={`grid gap-[16px] max-[1140px]:grid-cols-1 ${
        entries.length > 1 ? "grid-cols-2" : "grid-cols-1"
      }`}
    >
      {entries.map((entry) => (
        <BrandCard key={entry.brandId} entry={entry} />
      ))}
    </div>
  );
}

// --------------------------------------------------------- interval quality

export type IntervalQualityProps = {
  rows: readonly CoverageRow[];
  labels: Record<string, string>;
  /** Folds behind the ACCURACY figure, from AccuracyHeadline. Null if absent. */
  accuracyFolds: number | null;
};

/**
 * INTERVAL COVERAGE -- and the number on this screen most likely to be
 * quoted wrongly.
 *
 * model_registry.metrics.p10_p90_coverage is around 56%. It is real and it is
 * in the registry, which is exactly what makes it dangerous: it describes the
 * RAW quantile band before conformal calibration, a band that was never
 * shipped and that no planner has ever committed stock against. The band that
 * ships is in policy_parameter, measured at 83-84% against an 80% nominal.
 *
 * Both appear here, deliberately, because the raw figure is discoverable and
 * a reader who finds it later without this paragraph will assume the product
 * was hiding it. It appears at a quarter of the visual weight, labelled as
 * the thing not to quote.
 *
 * THE FOLD COUNTS DIFFER AND THE DIFFERENCE IS NOT AN ERROR. Accuracy is a
 * mean over every fold. Calibrated coverage skips the first: split-conformal
 * calibration fits its widening offset on a PRIOR fold, and fold 1 has no
 * prior fold, so it is excluded rather than calibrated against itself. That
 * makes the coverage a mean over one fewer fold than the accuracy beside it,
 * which is stated here and again, verbatim, in the stored derivation.
 */
export function IntervalQuality({
  rows,
  labels,
  accuracyFolds,
}: IntervalQualityProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="How good the band around the number is"
          subtitle="policy_parameter.interval_coverage_calibrated"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No calibrated coverage parameter came back for the brands in your
            scope, so no interval quality is shown. What would appear here is
            the share of actual demand that fell inside the p10-p90 band the
            planners actually see, measured against the nominal the band was
            built to. It is deliberately NOT taken from the registry&apos;s
            p10_p90_coverage, which describes the raw pre-calibration band
            that was never shipped, sits far below the calibrated one, and is
            not interval quality by any reading.
          </p>
        </CardBody>
      </Card>
    );
  }

  const coverageFolds = accuracyFolds === null ? null : accuracyFolds - 1;

  return (
    <Card>
      <CardHeader
        title="How good the band around the number is"
        subtitle="policy_parameter.interval_coverage_calibrated -- the band that actually shipped"
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-[18px] max-[1140px]:grid-cols-1">
          {rows.map((row) => (
            <div
              key={row.brandId}
              className="rounded-inner bg-shell px-[16px] py-[14px]"
            >
              <div className="text-label font-bold text-mute">
                {labels[row.brandId] ?? row.brandId}
              </div>
              <div className="mt-[4px] flex items-baseline gap-[8px]">
                <b className="text-kpi font-extrabold tabular text-ink">
                  {formatFractionPct(row.calibrated)}
                </b>
                <span className="text-small font-semibold text-mute">
                  of actuals fell inside the p10-p90 band
                </span>
              </div>
              <div className="mt-[7px] text-small font-semibold text-body">
                Built to a nominal {formatFractionPct(row.nominal, 0)}, so the
                band runs slightly wide rather than slightly narrow.
              </div>
              {/*
                THE RAW PRE-CALIBRATION COVERAGE IS DELIBERATELY NOT PRINTED
                HERE, only named.

                It used to render as a figure, carefully labelled "Not interval
                quality". The label was honest and the number was still wrong to
                put on this screen: this is the page a CMPO skims, the raw band
                was never shipped, and a stray percentage in the same card as
                the real coverage is exactly the confusion the labelling was
                trying to prevent. The before-and-after belongs on /model-ops,
                where calibration is the subject rather than an aside.
              */}
              <div className="mt-[9px] border-t border-rule2 pt-[8px] text-label font-semibold leading-[1.5] text-mute">
                The registry also carries a raw pre-calibration coverage. It
                describes the uncalibrated quantile band, which was never
                shipped, so it is not an interval quality and is not printed
                here. Model ops shows it beside this one, where the comparison
                is the point.
              </div>
            </div>
          ))}
        </div>

        <Finding label="Why this fold count is not the accuracy's fold count">
          {accuracyFolds === null || coverageFolds === null ? (
            <>
              The accuracy figures above and this coverage figure are measured
              over different numbers of folds, because split-conformal
              calibration fits its widening offset on a prior fold and the
              first fold has no prior fold to fit on. The registry row does
              not record its fold count, so neither number is quoted here.{" "}
            </>
          ) : (
            <>
              Accuracy above is a mean of {accuracyFolds} folds. This coverage
              is a mean of {coverageFolds}. That is by construction, not by
              accident: split-conformal calibration fits its widening offset on
              a PRIOR fold, so folds 2 to {accuracyFolds} are calibrated on
              folds 1 to {accuracyFolds - 1}, and fold 1 has nothing to
              calibrate against and drops out. Reading the two counts as a
              discrepancy is the natural mistake and it is the wrong one.{" "}
            </>
          )}
          The raw coverage in the registry is a mean over every fold, while the
          derivation stored beside the shipped parameter quotes the raw figure
          over the same folds the calibrated one uses {DASH} which is why two
          different &quot;raw&quot; numbers exist and why neither of them is
          the coverage of the band a planner sees.
        </Finding>

        <Provenance summary="The derivation stored beside the shipped parameter, verbatim">
          {rows.map((row) => (
            <div key={row.brandId} className="mb-[10px] last:mb-0">
              <div className="font-extrabold text-ink">
                {labels[row.brandId] ?? row.brandId}
              </div>
              <p className="mt-[3px]">{row.basis}</p>
              {row.overrideReason ? (
                <p className="mt-[5px] text-mute">{row.overrideReason}</p>
              ) : null}
            </div>
          ))}
        </Provenance>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------ the breakdown that is absent

export type NoCategoryAccuracyProps = {
  horizon: HorizonView;
  evidence: CategoryEvidence;
  brandLabels: readonly string[];
};

/**
 * The panel that says what is NOT on this screen, and why.
 *
 * An empty panel would be a bug. A panel that quietly substituted a
 * different measurement under the requested label would be worse, and it is
 * the easy mistake to make here: there is a forecast table, there is a
 * category column on it, and a per-category number could be produced in
 * twenty minutes. It would not be accuracy over a backtest. It would be
 * something else wearing the same word.
 *
 * Both halves of the evidence are read at request time, not asserted, so the
 * day the pipeline publishes either one the wording changes with it.
 */
export function NoCategoryAccuracy({
  horizon,
  evidence,
  brandLabels,
}: NoCategoryAccuracyProps) {
  const hasCategoryKeys = evidence.categoryKeys.length > 0;
  const overlap = horizon.overlapRows;

  return (
    <Card>
      <CardHeader
        title="Accuracy by category is not shown, and this is why"
        subtitle="The question was asked. The schema does not answer it."
      />
      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          The batch scorer published accuracy at BRAND level only. That is not
          a rendering choice on this page {DASH} it is what is in the tables,
          and both halves of the check run every time this screen loads.
        </p>

        <ul className="mt-[12px] flex flex-col gap-[10px]">
          <li className="rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.6] text-body">
            <b className="text-ink">Nothing in the registry is by category.</b>{" "}
            {evidence.registryRows === 0 ? (
              <>
                No planning-grain registry row is readable in your scope, so
                this check has nothing to inspect and no per-category figure
                can be sourced either way.
              </>
            ) : hasCategoryKeys ? (
              <>
                {plural(
                  evidence.registryRows,
                  "The planning-grain registry row",
                  "The planning-grain registry rows",
                )}{" "}
                now carr{evidence.registryRows === 1 ? "ies" : "y"}{" "}
                {joinWords(evidence.categoryKeys)}, which this panel did not
                expect. A per-category breakdown has become possible and this
                screen has not yet been built to show it.
              </>
            ) : (
              <>
                Every metrics key on{" "}
                {plural(
                  evidence.registryRows,
                  `the ${evidence.registryRows} planning-grain row`,
                  `all ${evidence.registryRows} planning-grain rows`,
                )}{" "}
                was inspected for a name mentioning a category and none was
                found. The breakdown that does exist is by_fold, which is by
                TIME: four rolling origins, not six categories.
              </>
            )}
          </li>

          <li className="rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.6] text-body">
            <b className="text-ink">
              There are no stored predictions to rescore.
            </b>{" "}
            The forecast table holds the forward window only {DASH}{" "}
            {horizon.forecastFirstWeek ?? DASH} to{" "}
            {horizon.forecastLastWeek ?? DASH} {DASH} while realised demand
            stops at {horizon.factLastWeek ?? DASH}.{" "}
            {overlap === null ? (
              <>
                The overlap between the two could not be counted on this
                request, so no per-category figure is derived from it.
              </>
            ) : overlap === 0 ? (
              <>
                Counted at request time, exactly {overlap} forecast rows fall
                on or before the last realised week. A backtest needs a
                prediction and an actual for the same week; there is not one
                such pair in the table.
              </>
            ) : (
              <>
                {overlap} forecast rows now fall inside the realised history,
                so a per-category backtest has become possible on{" "}
                {plural(overlap, "that row", "those rows")} and this screen has
                not yet been built to compute it.
              </>
            )}
          </li>
        </ul>

        <Finding label="What was not done instead">
          The available move was to compute something else {DASH} forecast
          against the manual baseline per category, say, or dispersion of the
          forward predictions {DASH} and print it under the heading
          &quot;accuracy by category&quot;. It would have filled the panel and
          it would have been a different measurement wearing the requested
          word, which a reader has no way to detect from the screen. So the
          brand-level figures above are what is shown{" "}
          {brandLabels.length > 0 ? (
            <>
              ({joinWords(brandLabels)}), and the category question stays
              open.{" "}
            </>
          ) : (
            <>and the category question stays open. </>
          )}
          Answering it needs a pipeline change: either a by_category block
          beside by_fold in the registry, or backtest predictions written into
          the forecast table so the join has something to land on. Both are
          pipeline work, and neither can be faked at the front end.
        </Finding>
      </CardBody>
    </Card>
  );
}

export default AccuracyByBrand;
