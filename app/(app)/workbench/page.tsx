import type { Metadata } from "next";
import Link from "next/link";

import {
  AccuracyStatement,
  Card,
  CardBody,
  CardHeader,
  ModelStrip,
  PageHeader,
  Why,
  type KpiItem,
} from "@/components";
import { DriverPanel } from "@/components/workbench/DriverPanel";
import {
  ForecastChart,
  type ChartForwardWeek,
  type ChartHistoryWeek,
} from "@/components/workbench/ForecastChart";
import {
  CensoringNote,
  CoverageNote,
} from "@/components/workbench/ForecastNotes";
import { ModelFacts } from "@/components/workbench/ModelFacts";
import {
  ScopeSelectors,
  type ScopeTriple,
} from "@/components/workbench/ScopeSelectors";
import {
  accuracySentence,
  getAccuracyHeadline,
  type AccuracyHeadline,
  type BrandId,
} from "@/lib/accuracy";
import {
  getForecastSeries,
  getModelRegistry,
  getPolicyParameters,
  type ForecastSeries,
} from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";
import type { StyleverseClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Workbench",
};

/**
 * The demand planning workbench.
 *
 * ONE ARGUMENT, DRAWN ONCE
 * ------------------------
 * The chart in the middle column is the whole screen. 104 weeks of realised
 * demand run into a 12-week horizon carrying a calibrated P10-P90 band, and
 * two lines cross that horizon: the model's P50 in solid orange and the
 * manual baseline dashed in grey. The distance between them is the entire
 * commercial case, so those two are the last things drawn and the only two
 * carrying stroke weight above 1.6. Everything else on the page exists to
 * stop that picture being over-read:
 *
 *   - the driver panel says which features moved this specific forecast, in
 *     units, signed, by exact tree SHAP;
 *   - the benchmark toggle overlays seasonal naive, which is a far harder
 *     line to beat than the authored manual baseline and is derived from the
 *     history already on the axis rather than invented;
 *   - the coverage note says the band is calibrated and rests on one fold
 *     fewer than the accuracy figure;
 *   - the censored-week toggle greys the weeks where the shelf was empty and
 *     says why the model's target is recovered demand rather than sales.
 *
 * SCOPE IS NOT DECORATION
 * -----------------------
 * The selectors are populated from the (category, channel, region) triples
 * this planner can actually read: the enumeration below runs through
 * createServerAnonClient(), so RLS answers it with the caller's own scope. A
 * planner who owns two categories in one region sees a short list and a small
 * series count, and that is the correct number rather than a bug. Nothing on
 * this page reaches for the service role to make a figure look larger.
 *
 * PART H
 * ------
 * The headline accuracy never appears on its own. It is rendered through
 * <AccuracyStatement/> in the header (inline form: headline with the margin
 * over seasonal naive attached) and again in the right column (bars form:
 * model, seasonal naive, manual, with the reason the manual margin proves
 * less than its size). <ModelStrip/> deliberately does NOT receive its
 * optional accuracyPct prop, because that prop would print the headline alone.
 */

// ------------------------------------------------------------------ tuning

/**
 * Below this availability a week is demand-censored. It is the same threshold
 * the pipeline uses to set excluded_from_accuracy_scoring; the chart applies
 * it to availability_ratio directly so the greyed weeks and the sentence
 * under the chart are computed from one rule the reader can check.
 */
const AVAILABILITY_FLOOR = 0.95;

/** The policy_parameter row that carries the calibrated interval coverage. */
const COVERAGE_PARAM = "interval_coverage_calibrated";

/** 216 planning-grain series exist in total; this is a guard, not a filter. */
const SCOPE_ROW_CAP = 1000;

/** Fixed zone so the server render and the hydrated client agree. */
const TIME_ZONE = "Asia/Kolkata";

// ------------------------------------------------------------------- scope

type ScopeRow = {
  brand_id: string;
  category_id: string;
  channel_id: string;
  region_id: string;
};

/**
 * Every (brand, category, channel, region) series this planner may read.
 *
 * This is an option list, not a metric, which is why it is not in
 * lib/queries.ts: it exists so the selectors cannot offer a combination that
 * would come back empty. horizon_week 1 yields exactly one row per series, so
 * the read is 216 rows at the absolute ceiling and far fewer under a
 * category manager's scope.
 */
async function readScope(sb: StyleverseClient): Promise<ScopeRow[]> {
  const { data, error } = await sb
    .from("forecast")
    .select("brand_id, category_id, channel_id, region_id")
    .eq("horizon_week", 1)
    .order("brand_id", { ascending: true })
    .order("category_id", { ascending: true })
    .order("channel_id", { ascending: true })
    .order("region_id", { ascending: true })
    .limit(SCOPE_ROW_CAP);

  if (error) {
    throw new Error(`StyleVerse: workbench scope read failed -- ${error.message}`);
  }

  // The generated types make every dimension key nullable. A row missing one
  // is not a series anybody can select, so it is dropped rather than coerced
  // into a triple that would query for nulls.
  const rows: ScopeRow[] = [];
  for (const row of data) {
    if (
      row.brand_id === null ||
      row.category_id === null ||
      row.channel_id === null ||
      row.region_id === null
    ) {
      continue;
    }
    rows.push({
      brand_id: row.brand_id,
      category_id: row.category_id,
      channel_id: row.channel_id,
      region_id: row.region_id,
    });
  }
  return rows;
}

type LabelMap = Readonly<Record<string, string>>;

/** Display names for the ids in the selectors. Names, not numbers. */
async function readLabels(sb: StyleverseClient): Promise<{
  category: LabelMap;
  channel: LabelMap;
  region: LabelMap;
}> {
  const [cats, chans, regs] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  const category: Record<string, string> = {};
  for (const row of cats.data ?? []) {
    if (row.category_name) category[row.category_id] = row.category_name;
  }
  const channel: Record<string, string> = {};
  for (const row of chans.data ?? []) {
    if (row.channel_name) channel[row.channel_id] = row.channel_name;
  }
  const region: Record<string, string> = {};
  for (const row of regs.data ?? []) {
    if (row.region_name) region[row.region_id] = row.region_name;
  }
  return { category, channel, region };
}

/** First query-string value, or "" -- never a default that names a series. */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Resolve a requested series against what the planner can see.
 *
 * Cascades in the same order the selectors do: an unreadable category falls
 * back to the first readable one, which narrows the channels, which narrows
 * the regions. A hand-typed out-of-scope URL therefore lands on a series that
 * exists rather than on an empty chart.
 */
function resolveSelection(
  triples: readonly ScopeTriple[],
  want: { category: string; channel: string; region: string },
): ScopeTriple | null {
  const first = triples[0];
  if (first === undefined) return null;

  const inCategory = triples.filter((t) => t.category === want.category);
  const category = inCategory.length > 0 ? want.category : first.category;

  const categoryPool = triples.filter((t) => t.category === category);
  const poolHead = categoryPool[0] ?? first;

  const inChannel = categoryPool.filter((t) => t.channel === want.channel);
  const channel = inChannel.length > 0 ? want.channel : poolHead.channel;

  const channelPool = categoryPool.filter((t) => t.channel === channel);
  const channelHead = channelPool[0] ?? poolHead;

  const inRegion = channelPool.filter((t) => t.region === want.region);
  const region = inRegion.length > 0 ? want.region : channelHead.region;

  return { category, channel, region };
}

// --------------------------------------------------------------- transforms

/**
 * Seasonal naive, derived rather than invented.
 *
 * The benchmark for a forward week is the value observed 52 weeks earlier.
 * Forward week k sits at absolute index history.length + k, so its t-52 value
 * is history[history.length + k - 52]. With 104 weeks of history behind a
 * 12-week horizon every forward week has one. A shorter history yields null
 * for the weeks that fall off the front, and the chart disables the toggle
 * rather than drawing a line it had to make up.
 */
function seasonalNaiveAt(
  history: ForecastSeries["history"],
  forwardIndex: number,
): number | null {
  const index = history.length + forwardIndex - 52;
  if (index < 0 || index >= history.length) return null;
  return history[index]?.demand_units_unconstrained ?? null;
}

function toChartHistory(
  history: ForecastSeries["history"],
): ChartHistoryWeek[] {
  return history.map((week) => ({
    isoWeek: week.iso_week,
    actual: week.demand_units_unconstrained,
    censored:
      week.availability_ratio !== null &&
      week.availability_ratio < AVAILABILITY_FLOOR,
  }));
}

function toChartForward(series: ForecastSeries): ChartForwardWeek[] {
  return series.forward.map((row, index) => ({
    isoWeek: row.iso_week,
    horizonWeek: row.horizon_week,
    p10: row.p10,
    p50: row.forecast_units,
    p90: row.p90,
    manual: row.manual_baseline_forecast_units,
    seasonalNaive: seasonalNaiveAt(series.history, index),
  }));
}

/** Smallest lag in weeks across the stored feature names; null if none. */
function minimumLagWeeks(features: unknown): number | null {
  if (!Array.isArray(features)) return null;
  let min: number | null = null;
  for (const entry of features) {
    if (typeof entry !== "string") continue;
    const direct = /^lag_(\d+)$/.exec(entry);
    const suffixed = /_lag(\d+)$/.exec(entry);
    const raw = direct?.[1] ?? suffixed?.[1];
    if (raw === undefined) continue;
    const weeks = Number.parseInt(raw, 10);
    if (!Number.isFinite(weeks)) continue;
    if (min === null || weeks < min) min = weeks;
  }
  return min;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(date);
}

function isBrandId(value: string): value is BrandId {
  return value === "SPD" || value === "ECO";
}

// -------------------------------------------------------------------- empty

function EmptyScope() {
  return (
    <>
      <PageHeader eyebrow="Demand planning" title="Workbench" />
      <Card>
        <CardHeader
          title="No forecast series in your scope"
          subtitle="This is a scope result, not an error"
        />
        <CardBody>
          <p className="text-[12.5px] leading-[1.6] text-body max-w-[80ch]">
            Row-level security answered this page with your own session, and it
            returned no planning-grain forecast rows. A planner scoped to a
            single region and a short category list can legitimately see none
            here while the brand carries hundreds. Nothing is being hidden and
            nothing is broken; the workbench has no series to draw for you.
            Your planning manager can widen the scope on your{" "}
            <span className="font-mono text-[11px]">dim_planner</span> row.
          </p>
        </CardBody>
      </Card>
    </>
  );
}

// --------------------------------------------------------------------- page

export default async function WorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sb = await createServerAnonClient();
  const params = await searchParams;

  const [scopeRows, labels] = await Promise.all([readScope(sb), readLabels(sb)]);

  if (scopeRows.length === 0) return <EmptyScope />;

  // A planner belongs to one brand; a group role can read both. The workbench
  // draws one series at a time, so brand is resolved rather than offered as a
  // fourth cascading selector: the query string first, then the planner's own
  // brand from the session, then whichever brand the readable rows start with.
  // A brand named in the URL that this session cannot read is discarded, so a
  // hand-edited parameter cannot reach past RLS.
  const brandsInScope = Array.from(new Set(scopeRows.map((r) => r.brand_id)));
  const planner = await getSessionPlanner();
  const wantedBrand = one(params.brand);
  const brandId =
    brandsInScope.find((b) => b === wantedBrand) ??
    brandsInScope.find((b) => b === planner?.brandId) ??
    brandsInScope[0] ??
    "";

  const brandRows = scopeRows.filter((row) => row.brand_id === brandId);
  const triples: ScopeTriple[] = brandRows.map((row) => ({
    category: row.category_id,
    channel: row.channel_id,
    region: row.region_id,
  }));

  const selected = resolveSelection(triples, {
    category: one(params.category),
    channel: one(params.channel),
    region: one(params.region),
  });

  if (selected === null) return <EmptyScope />;

  const series = await getForecastSeries(
    sb,
    brandId,
    selected.category,
    selected.channel,
    selected.region,
  );

  // Provenance comes from the rows that were actually displayed, so a series
  // scored by an older run cannot be stamped with the newest version.
  const displayedVersions = Array.from(
    new Set(series.forward.map((row) => row.model_version)),
  );
  const modelVersion = displayedVersions[0] ?? null;
  const generatedAt = series.forward.reduce<string | null>(
    (latest, row) =>
      latest === null || row.generated_at > latest ? row.generated_at : latest,
    null,
  );

  const [policies, accuracies, registry] = await Promise.all([
    getPolicyParameters(sb, brandId),
    getAccuracyHeadline(sb, isBrandId(brandId) ? brandId : undefined),
    modelVersion === null
      ? Promise.resolve([])
      : getModelRegistry(sb, modelVersion),
  ]);

  const accuracy: AccuracyHeadline | undefined =
    accuracies.find((a) => a.brandId === brandId) ?? accuracies[0];

  const coverageRow = policies.find((p) => p.param_name === COVERAGE_PARAM);
  // computed_value is the MEASURED calibrated coverage. applied_value is the
  // nominal band the quantile heads target. The raw, pre-calibration coverage
  // in model_registry.metrics is not the interval's quality and is not read.
  const coveragePct =
    coverageRow?.computed_value === null || coverageRow === undefined
      ? null
      : coverageRow.computed_value * 100;
  const nominalPct =
    coverageRow?.applied_value === null || coverageRow === undefined
      ? null
      : coverageRow.applied_value * 100;

  const registryEntry = registry[0];

  const chartHistory = toChartHistory(series.history);
  const chartForward = toChartForward(series);

  const censoredWeeks = chartHistory.filter((w) => w.censored).length;
  const availabilities = series.history
    .map((w) => w.availability_ratio)
    .filter((v): v is number => v !== null);
  const meanAvailabilityPct =
    availabilities.length > 0
      ? (availabilities.reduce((sum, v) => sum + v, 0) / availabilities.length) *
        100
      : null;

  const firstForward = series.forward[0];

  const categoryLabel = labels.category[selected.category] ?? selected.category;
  const channelLabel = labels.channel[selected.channel] ?? selected.channel;
  const regionLabel = labels.region[selected.region] ?? selected.region;

  // The coverage figure and the accuracy figure rest on different fold
  // counts. The difference is structural, not editorial: split conformal
  // calibrates each fold against the one before it, so the first fold is
  // excluded. Derived here rather than typed in.
  const accuracyFolds = accuracy?.foldCount ?? 0;
  const calibrationFolds = accuracyFolds > 0 ? accuracyFolds - 1 : 0;

  const kpis: KpiItem[] = [
    {
      label: "Series in your scope",
      value: String(triples.length),
      pill: "RLS-scoped",
      tone: "grey",
    },
    {
      label: "Horizon",
      value: `${series.forward.length} wks`,
    },
    {
      label: "History",
      value: `${series.history.length} wks`,
      pill: `${censoredWeeks} censored`,
      tone: censoredWeeks > 0 ? "amber" : "grey",
    },
  ];

  if (coveragePct !== null && calibrationFolds > 0) {
    kpis.push({
      label: "Interval",
      value: "P10-P90",
      // The fold count travels with the number so the caveat cannot be
      // separated from the figure by a screenshot.
      pill: `${coveragePct.toFixed(1)}% over ${calibrationFolds} folds`,
      tone: "up",
    });
  }

  return (
    <>
      <PageHeader eyebrow="Demand planning" title="Workbench" kpis={kpis}>
        {accuracy === undefined ? null : (
          // Part H: the headline never travels without the seasonal-naive
          // margin. AccuracyStatement is the only component that renders it.
          <AccuracyStatement accuracy={accuracy} variant="inline" />
        )}
      </PageHeader>

      {modelVersion === null || generatedAt === null ? null : (
        <ModelStrip
          className="mb-[16px]"
          modelVersion={modelVersion}
          generatedAt={formatTimestamp(generatedAt)}
          // No `confidence` either. The forecast rows carry no published
          // confidence band, and inventing one here would be the exact move
          // this strip exists to make impossible.
          //
          // accuracyPct is deliberately NOT passed: it would print the
          // headline on its own, which Part H forbids. The accuracy lives in
          // <AccuracyStatement/>, above and to the right, with its benchmark.
          why={
            <>
              <p>
                Every number on this screen came from the{" "}
                {series.forward.length} forecast rows stamped{" "}
                <span className="font-mono text-[11px]">{modelVersion}</span>{" "}
                for {categoryLabel} / {channelLabel} / {regionLabel}, and the{" "}
                {series.history.length} weeks of realised demand behind them.
                {displayedVersions.length > 1 ? (
                  <>
                    {" "}
                    {displayedVersions.length} model versions appear across
                    these rows ({displayedVersions.join(", ")}); the strip names
                    the first.
                  </>
                ) : null}
              </p>
              {accuracy === undefined ? null : (
                <p className="mt-[8px]">{accuracySentence(accuracy)}</p>
              )}
              <p className="mt-[8px]">
                Forward actuals are under embargo, so none of that accuracy is
                measured against the weeks drawn to the right of &quot;now&quot;.
                It is a historical rolling-origin backtest and nothing else.
              </p>
            </>
          }
        />
      )}

      <div className="grid grid-cols-[222px_1fr_264px] items-start gap-[16px] max-[1140px]:grid-cols-1">
        {/* ------------------------------------------------------ filters */}
        <div className="flex flex-col gap-[16px]">
          <Card>
            <CardHeader title="Filters" subtitle="Your readable scope only" />
            <CardBody>
              {brandsInScope.length > 1 ? (
                <div className="mb-[11px]">
                  <div className="mb-[4px] text-[11.5px] font-semibold text-mute">
                    Brand
                  </div>
                  <div className="flex flex-wrap gap-[7px]">
                    {brandsInScope.map((b) => (
                      <Link
                        key={b}
                        href={`/workbench?brand=${encodeURIComponent(b)}`}
                        aria-current={b === brandId ? "true" : undefined}
                        className={`rounded-full px-[14px] py-[7px] text-[12px] font-bold ${
                          b === brandId
                            ? "bg-ink text-white"
                            : "bg-cream text-body hover:bg-hover"
                        }`}
                      >
                        {b}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <ScopeSelectors
                triples={triples}
                labels={labels}
                selected={selected}
                brand={brandsInScope.length > 1 ? brandId : undefined}
              />
              <div className="mt-[15px] border-t border-rule pt-[13px]">
                <Why
                  lead={
                    <b className="text-ink">
                      {triples.length} series readable
                      {brandsInScope.length > 1 ? ` in ${brandId}` : ""}
                    </b>
                  }
                  label="why only these"
                  className="block"
                >
                  These options are the combinations your session can actually
                  read. An out-of-scope pairing is never offered, because an
                  empty chart teaches you the system is broken rather than that
                  you are out of scope.
                </Why>
              </div>
              {meanAvailabilityPct === null ? null : (
                <div className="mt-[13px] border-t border-rule pt-[13px]">
                  <Why
                    lead={
                      <b className="text-ink tabular-nums">
                        Availability {meanAvailabilityPct.toFixed(0)}%
                      </b>
                    }
                    label="what is censored"
                    className="block"
                  >
                    <span className="tabular-nums">{censoredWeeks}</span> of{" "}
                    <span className="tabular-nums">
                      {series.history.length}
                    </span>{" "}
                    weeks on this series ran below{" "}
                    {(AVAILABILITY_FLOOR * 100).toFixed(0)}% and are
                    demand-censored. Toggle them on the chart to see where.
                  </Why>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* -------------------------------------------------------- chart */}
        <div className="flex flex-col gap-[16px]">
          <ForecastChart
            title={`${categoryLabel} - ${channelLabel} - ${regionLabel}`}
            subtitle="Weekly demand, units"
            history={chartHistory}
            forward={chartForward}
          >
            <div className="mt-[14px] flex flex-col gap-[10px] border-t border-rule pt-[14px]">
              {coveragePct === null || calibrationFolds === 0 ? (
                <p className="text-[12.5px] leading-[1.6] text-body max-w-[88ch]">
                  No calibrated coverage figure is stored for {brandId}, so the
                  band is drawn without one rather than described by a number
                  this page invented.
                </p>
              ) : (
                <CoverageNote
                  coveragePct={coveragePct}
                  nominalPct={nominalPct}
                  calibrationFolds={calibrationFolds}
                  accuracyFolds={accuracyFolds}
                />
              )}

              <CensoringNote
                censoredWeeks={censoredWeeks}
                totalWeeks={series.history.length}
                thresholdPct={AVAILABILITY_FLOOR * 100}
                meanAvailabilityPct={meanAvailabilityPct}
                targetColumn={registryEntry?.target_column ?? null}
              />
            </div>
          </ForecastChart>
        </div>

        {/* --------------------------------------------------- right rail */}
        <div className="flex flex-col gap-[16px]">
          <Card>
            <CardHeader
              title="Why this forecast"
              subtitle={
                firstForward === undefined
                  ? "No forward row"
                  : `Units, week ${firstForward.horizon_week} (${firstForward.iso_week})`
              }
            />
            <DriverPanel drivers={firstForward?.drivers ?? []} limit={4} />
          </Card>

          {accuracy === undefined ? null : (
            <Card>
              <CardHeader
                title="Against the benchmarks"
                subtitle={
                  accuracy.foldCount === null
                    ? "Rolling origin backtest"
                    : `${accuracy.foldCount} folds, rolling origin`
                }
              />
              <CardBody>
                <AccuracyStatement accuracy={accuracy} variant="bars" notesBehindWhy />
              </CardBody>
            </Card>
          )}

          {registryEntry === undefined ||
          modelVersion === null ||
          generatedAt === null ? null : (
            <Card>
              <CardHeader title="Model" subtitle="From the registry row" />
              <CardBody>
                <ModelFacts
                  modelVersion={modelVersion}
                  engine={registryEntry.engine}
                  targetColumn={registryEntry.target_column}
                  horizonWeeks={registryEntry.horizon_weeks}
                  accuracyMetric={registryEntry.accuracy_metric}
                  featureCount={
                    Array.isArray(registryEntry.features)
                      ? registryEntry.features.length
                      : null
                  }
                  trainRows={registryEntry.n_train_rows}
                  minLagWeeks={minimumLagWeeks(registryEntry.features)}
                  generatedAt={generatedAt}
                  generatedAtLabel={formatTimestamp(generatedAt)}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
