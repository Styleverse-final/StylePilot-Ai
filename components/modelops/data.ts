// Server-side reads and shaping for /model-ops.
//
// Every function takes the Supabase client as its first argument, exactly
// like lib/queries, so the caller decides whose row level security applies.
// The screen passes createServerAnonClient(), which carries the signed-in
// planner's session cookie. That matters differently per table here:
//
//   model_registry   SELECT policy is `true` for authenticated -- every
//                    planner sees all four registered models, both brands.
//   policy_parameter SELECT policy is `true` for authenticated -- same.
//   autonomy_band    SELECT policy is `true` for authenticated -- same.
//   agent_run        SELECT is brand-scoped: `brand_id = current_brand()`
//                    unless the caller is group_cmpo or coe_admin. So the
//                    drift monitor shows ONE brand to a brand planner and
//                    both to a group role, and the screen says which it is
//                    rather than letting a single-brand panel read as the
//                    whole estate.
//
// Nothing here reaches for the service role to make a panel look fuller.

import {
  getAgentRuns,
  getAutonomyBands,
  getModelRegistry,
  getPolicyParameters,
  type AgentRun,
  type AutonomyBand,
  type ModelMetrics,
  type ModelRegistryEntry,
  type PolicyParameter,
} from "@/lib/queries";
import type { Json } from "@/lib/database.types";
import type { StyleverseClient } from "@/lib/supabase";

import { toNumber } from "./format";

// ------------------------------------------------------------------ jsonb

type JsonObject = { [key: string]: Json | undefined };

function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** metrics.features is jsonb; a non-array is no feature list, not an empty one. */
export function featureList(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

// ------------------------------------------------------------------- folds

/**
 * One rolling-origin fold, narrowed from metrics.by_fold.
 *
 * A field the pipeline did not write stays null rather than defaulting to
 * zero: a fold drawn from a zero would read as a measurement of zero.
 */
export type Fold = {
  fold: number;
  weeks: string | null;
  rows: number | null;
  modelPct: number | null;
  seasonalNaivePct: number | null;
  manualPct: number | null;
  driftPct: number | null;
  rolling13Pct: number | null;
  rawCoverage: number | null;
  crossingPct: number | null;
  intervalWidthUnits: number | null;
  maseModel: number | null;
  maseSnaive: number | null;
};

export function parseFolds(metrics: ModelMetrics | null | undefined): Fold[] {
  const raw = metrics?.by_fold;
  if (!Array.isArray(raw)) return [];

  const out: Fold[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    out.push({
      fold: num(entry.fold) ?? out.length + 1,
      weeks: str(entry.weeks),
      rows: num(entry.n_rows),
      modelPct: num(entry.ai_accuracy_vs_demand),
      seasonalNaivePct: num(entry.seasonal_naive_accuracy),
      manualPct: num(entry.manual_accuracy_vs_demand),
      driftPct: num(entry.drift_accuracy),
      rolling13Pct: num(entry.rolling_13_accuracy),
      rawCoverage: num(entry.p10_p90_coverage),
      crossingPct: num(entry.quantile_crossing_pct),
      intervalWidthUnits: num(entry.mean_interval_width),
      maseModel: num(entry.mase_model),
      maseSnaive: num(entry.mase_snaive),
    });
  }
  return out.sort((a, b) => a.fold - b.fold);
}

/** "2025-W40..2025-W51" -> "W40-51". Anything else falls back to the index. */
export function foldLabel(fold: Fold): string {
  if (fold.weeks) {
    const match = fold.weeks.match(/W(\d+).*?W(\d+)/);
    if (match) return `W${match[1]}-${match[2]}`;
  }
  return `Fold ${fold.fold}`;
}

// -------------------------------------------------------------- benchmarks

/**
 * One benchmark the model was scored against, on the identical row mask.
 *
 * `constructed` is the whole point of carrying this flag: the manual
 * baseline was authored by the dataset designer and calibrated by bisection
 * to hit a target, so beating it proves something about the fixture. The
 * other three are mechanical rules nobody tuned. The screen orders and
 * annotates by this flag rather than by margin size, so the flattering
 * comparison can never end up leading.
 */
export type Benchmark = {
  key: string;
  label: string;
  rule: string;
  pct: number | null;
  marginPoints: number | null;
  constructed: boolean;
};

export function benchmarksFor(entry: ModelRegistryEntry): Benchmark[] {
  const bm = entry.metrics.benchmark_comparison ?? null;
  const model = toNumber(bm?.model) ?? toNumber(entry.metrics.ai_accuracy_vs_demand);

  const margin = (value: number | null): number | null =>
    value === null || model === null
      ? null
      : Math.round((model - value) * 1000) / 10;

  const snaive = toNumber(bm?.seasonal_naive);
  const drift = toNumber(bm?.drift);
  const rolling = toNumber(bm?.rolling_13);
  const manual =
    toNumber(bm?.manual) ?? toNumber(entry.metrics.manual_accuracy_vs_demand);

  // The stored margin and the two accuracies must agree, so the seasonal
  // margin is computed from the pair rather than read from the row -- and
  // where the row does carry one, it is the same number.
  const storedSnaiveMargin = toNumber(bm?.margin_over_snaive);

  return [
    {
      key: "seasonal_naive",
      label: "Seasonal naive",
      rule: "last year's same week, repeated",
      pct: snaive,
      marginPoints:
        storedSnaiveMargin !== null
          ? Math.round(storedSnaiveMargin * 1000) / 10
          : margin(snaive),
      constructed: false,
    },
    {
      key: "drift",
      label: "Drift",
      rule: "last observed level, carried forward with its trend",
      pct: drift,
      marginPoints: margin(drift),
      constructed: false,
    },
    {
      key: "rolling_13",
      label: "13-week rolling mean",
      rule: "mean of the trailing thirteen weeks",
      pct: rolling,
      marginPoints: margin(rolling),
      constructed: false,
    },
    {
      key: "manual",
      label: "Manual baseline",
      rule: "the planner workbook, authored and calibrated to a target",
      pct: manual,
      marginPoints: margin(manual),
      constructed: true,
    },
  ];
}

// ---------------------------------------------------------------- registry

export type RegistryRow = {
  brandId: string;
  entry: ModelRegistryEntry;
  featureCount: number;
  features: string[];
  folds: Fold[];
};

export type ColdStartRow = {
  brandId: string;
  entry: ModelRegistryEntry;
  featureCount: number;
  features: string[];
  /** The cold-start model's own accuracy. NEVER averaged with planning grain. */
  accuracy: number | null;
  /** The only benchmark it has: the category median it must separate from. */
  categoryMedian: number | null;
  marginPoints: number | null;
  styles: number | null;
  test: number | null;
  note: string | null;
};

/** "SPD_planning_grain" -> "SPD". */
export function brandOf(modelId: string): string {
  const cut = modelId.indexOf("_");
  return cut === -1 ? modelId : modelId.slice(0, cut);
}

function toRegistryRow(entry: ModelRegistryEntry): RegistryRow {
  const features = featureList(entry.features);
  return {
    brandId: brandOf(entry.model_id),
    entry,
    featureCount: features.length,
    features,
    folds: parseFolds(entry.metrics),
  };
}

function toColdStartRow(entry: ModelRegistryEntry): ColdStartRow {
  const features = featureList(entry.features);
  const accuracy = toNumber(entry.metrics.cold_start_accuracy);
  const median = toNumber(entry.metrics.naive_category_median_accuracy);
  return {
    brandId: brandOf(entry.model_id),
    entry,
    featureCount: features.length,
    features,
    accuracy,
    categoryMedian: median,
    marginPoints:
      accuracy === null || median === null
        ? null
        : Math.round((accuracy - median) * 1000) / 10,
    styles: toNumber(entry.metrics.n_styles),
    test: toNumber(entry.metrics.n_test),
    note: typeof entry.metrics.note === "string" ? entry.metrics.note : null,
  };
}

export type Registry = {
  planning: RegistryRow[];
  coldStart: ColdStartRow[];
  brandIds: string[];
};

/**
 * Split the registry by grain.
 *
 * The split is on model_id, the same test lib/accuracy.ts applies, because
 * the two grains are not comparable and must never be pooled: the planning
 * models are scored at brand>category>channel>region>week over four
 * rolling-origin folds, the cold-start models on first-eight-week volume for
 * styles with no history at all. One mean across both would be a number
 * describing nothing.
 */
export function splitRegistry(entries: readonly ModelRegistryEntry[]): Registry {
  const planning: RegistryRow[] = [];
  const coldStart: ColdStartRow[] = [];

  for (const entry of entries) {
    if (entry.model_id.endsWith("_planning_grain")) planning.push(toRegistryRow(entry));
    else if (entry.model_id.endsWith("_cold_start")) coldStart.push(toColdStartRow(entry));
  }

  planning.sort((a, b) => a.brandId.localeCompare(b.brandId));
  coldStart.sort((a, b) => a.brandId.localeCompare(b.brandId));

  const brandIds = [
    ...new Set([...planning, ...coldStart].map((row) => row.brandId)),
  ].sort();

  return { planning, coldStart, brandIds };
}

// ------------------------------------------------------------- calibration

/**
 * The before-and-after of the prediction interval, per brand.
 *
 * THE ONE THING THIS TYPE EXISTS TO PREVENT: `rawCoverageAllFolds` is
 * model_registry.metrics.p10_p90_coverage. It describes the band as the three
 * quantile models emitted it, BEFORE split-conformal calibration -- a band
 * that was never shipped, never charted and never sized a safety stock. It is
 * present on this screen only because this screen is about calibration and
 * the before/after is the point. It is never interval quality.
 *
 * `calibrated` is policy_parameter.interval_coverage_calibrated, which is the
 * real coverage of the band the product actually uses.
 *
 * The two are measured over DIFFERENT FOLD COUNTS, and that is why
 * `rawCoverageCalibratedFolds` exists as well: split-conformal fits its
 * widening offset on a PRIOR fold, so fold 1 has nothing to calibrate against
 * and is excluded. Accuracy is a four-fold mean; coverage is a three-fold
 * mean. Comparing the four-fold raw figure with the three-fold calibrated one
 * would be comparing different windows, so the raw mean restricted to the
 * same three folds is computed here and shown beside it.
 */
export type Calibration = {
  brandId: string;
  modelVersion: string;
  /** Raw p10-p90 coverage, mean of every fold. Pre-calibration. Never shipped. */
  rawCoverageAllFolds: number | null;
  rawFoldCount: number;
  /** The same raw figure over the folds calibration could be measured on. */
  rawCoverageCalibratedFolds: number | null;
  calibratedFoldCount: number;
  /** How many folds the accuracy headline is a mean of. */
  accuracyFoldCount: number;
  /** policy_parameter.interval_coverage_calibrated -- the shipped band. */
  calibrated: PolicyParameter | null;
  /** policy_parameter.conformal_widening_units_brand -- the offset, in units. */
  widening: PolicyParameter | null;
  /**
   * How many quantiles the model fits, counted from metrics.quantiles.
   * Null when the row does not record them -- the screen then says nothing
   * about how many independent estimators produced the band rather than
   * asserting the usual three.
   */
  quantileCount: number | null;
  /** metrics.quantile_crossing_pct_backtest, in percent of rows. */
  crossingPct: number | null;
  crossingByFold: { fold: number; label: string; pct: number }[];
  meanIntervalWidthUnits: number | null;
  folds: Fold[];
};

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildCalibration(
  row: RegistryRow,
  parameters: readonly PolicyParameter[],
): Calibration {
  const metrics = row.entry.metrics;

  // Prefer the fold array over the scalar so the fold COUNT behind the raw
  // figure is counted rather than assumed.
  const byFold = Array.isArray(metrics.p10_p90_coverage_by_fold)
    ? metrics.p10_p90_coverage_by_fold.filter((v): v is number => typeof v === "number")
    : row.folds
        .map((fold) => fold.rawCoverage)
        .filter((v): v is number => v !== null);

  const scalarRaw = toNumber(metrics.p10_p90_coverage);

  return {
    brandId: row.brandId,
    modelVersion: row.entry.model_version,
    rawCoverageAllFolds: scalarRaw ?? mean(byFold),
    rawFoldCount: byFold.length,
    // Fold 1 drops out: it has no prior fold to fit an offset on.
    rawCoverageCalibratedFolds: byFold.length > 1 ? mean(byFold.slice(1)) : null,
    calibratedFoldCount: Math.max(byFold.length - 1, 0),
    accuracyFoldCount: row.folds.length,
    calibrated: findParameter(parameters, row.brandId, "interval_coverage_calibrated"),
    widening: findParameter(parameters, row.brandId, "conformal_widening_units_brand"),
    quantileCount: Array.isArray(metrics.quantiles) ? metrics.quantiles.length : null,
    crossingPct: toNumber(metrics.quantile_crossing_pct_backtest),
    crossingByFold: row.folds
      .filter((fold): fold is Fold & { crossingPct: number } => fold.crossingPct !== null)
      .map((fold) => ({ fold: fold.fold, label: foldLabel(fold), pct: fold.crossingPct })),
    meanIntervalWidthUnits: toNumber(metrics.mean_interval_width_units),
    folds: row.folds,
  };
}

// -------------------------------------------------------------- parameters

export type BrandParameters = {
  brandId: string;
  parameters: PolicyParameter[];
};

export function findParameter(
  parameters: readonly PolicyParameter[],
  brandId: string,
  name: string,
): PolicyParameter | null {
  return (
    parameters.find(
      (parameter) => parameter.brand_id === brandId && parameter.param_name === name,
    ) ?? null
  );
}

/**
 * Every threshold, for every brand the registry names.
 *
 * policy_parameter's read policy is `true` for authenticated, so this is not
 * a privileged read -- it is the same rows any signed-in planner can select.
 * The lib query is brand-scoped, so it is called once per brand and the
 * results concatenated rather than reaching past it with a raw .from().
 */
export async function getPolicyAudit(
  sb: StyleverseClient,
  brandIds: readonly string[],
): Promise<PolicyParameter[]> {
  const perBrand = await Promise.all(
    brandIds.map((brandId) => getPolicyParameters(sb, brandId)),
  );
  return perBrand.flat();
}

/** Rows where the value in force is not the value the derivation produced. */
export function overriddenOnly(
  parameters: readonly PolicyParameter[],
): PolicyParameter[] {
  return parameters.filter((parameter) => parameter.is_overridden);
}

// ------------------------------------------------------------------ drift

export type DriftBrand = {
  brandId: string;
  /** Most recent run of the forecast agent for this brand. */
  latest: AgentRun | null;
  /** Every run of it this session can read, most recent first. */
  runs: AgentRun[];
  /** The written autonomy band, including the escalation clause as stored. */
  band: AutonomyBand | null;
};

export const DRIFT_AGENT = "forecast_agent";

/** A run with no brand cannot be attributed, so it is not counted under one. */
type BrandedRun = AgentRun & { brand_id: string };

function isBranded(run: AgentRun): run is BrandedRun {
  return typeof run.brand_id === "string" && run.brand_id.length > 0;
}

export function buildDrift(
  runs: readonly AgentRun[],
  bands: readonly AutonomyBand[],
): DriftBrand[] {
  const forecastRuns = runs
    .filter((run) => run.agent_name === DRIFT_AGENT)
    .filter(isBranded)
    .slice()
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

  const brandIds = [...new Set(forecastRuns.map((run) => run.brand_id))].sort();

  return brandIds.map((brandId) => {
    const own = forecastRuns.filter((run) => run.brand_id === brandId);
    return {
      brandId,
      latest: own[0] ?? null,
      runs: own,
      band:
        bands.find(
          (band) => band.agent_name === DRIFT_AGENT && band.brand_id === brandId,
        ) ?? null,
    };
  });
}

/**
 * Autonomy bands for every brand the registry names.
 *
 * autonomy_band's read policy is `true` for authenticated, so unlike
 * agent_run this returns both brands to a brand planner. That asymmetry is
 * stated on screen: the written rule is public, the runs it produced are not.
 */
export async function getBands(
  sb: StyleverseClient,
  brandIds: readonly string[],
): Promise<AutonomyBand[]> {
  const perBrand = await Promise.all(
    brandIds.map((brandId) => getAutonomyBands(sb, brandId)),
  );
  return perBrand.flat();
}

// ------------------------------------------------------------------ labels

/**
 * Display names for the brands the registry names.
 *
 * dim_brand is BRAND-SCOPED, unlike model_registry and policy_parameter: its
 * select policy is `brand_id = current_brand()` unless the caller holds
 * group_cmpo or coe_admin. So a brand planner gets one name back and the
 * other brand's cards fall through to its id -- "ECO" rather than
 * "EcoThread". That is row level security working, and degrading to the id
 * is the honest outcome: the id is what the registry row itself carries, so
 * nothing on screen is invented to cover the gap. A failed read returns no
 * names at all rather than a partial guess.
 */
export async function getBrandNames(
  sb: StyleverseClient,
): Promise<Record<string, string>> {
  const { data, error } = await sb.from("dim_brand").select("brand_id, brand_name");
  if (error || !data) return {};
  const labels: Record<string, string> = {};
  for (const row of data) {
    if (row.brand_id && row.brand_name) labels[row.brand_id] = row.brand_name;
  }
  return labels;
}

// -------------------------------------------------------------- everything

export type ModelOpsData = {
  registry: Registry;
  parameters: PolicyParameter[];
  bands: AutonomyBand[];
  runs: AgentRun[];
  brandNames: Record<string, string>;
};

/**
 * One read pass for the whole screen.
 *
 * The registry is read first because it is what names the brands: the model
 * ids are the only place on this screen where the estate declares itself, and
 * deriving the brand list from them means an added brand appears everywhere
 * at once rather than in the panels somebody remembered to update.
 */
export async function getModelOpsData(sb: StyleverseClient): Promise<ModelOpsData> {
  const entries = await getModelRegistry(sb);
  const registry = splitRegistry(entries);

  const [parameters, bands, runs, brandNames] = await Promise.all([
    getPolicyAudit(sb, registry.brandIds),
    getBands(sb, registry.brandIds),
    // Four agents x two brands x the pipeline re-runs in this fixture. 200 is
    // comfortably above that and still a bounded read.
    getAgentRuns(sb, 200),
    getBrandNames(sb),
  ]);

  return { registry, parameters, bands, runs, brandNames };
}

export type { AgentRun, AutonomyBand, ModelRegistryEntry, PolicyParameter };
