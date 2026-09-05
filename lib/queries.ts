import { cache } from "react";
// StyleVerse -- typed read layer over the pilot schema.
//
// Every function takes the Supabase client as its first argument. Nothing in
// here decides whether it is running on a server or in a browser, which is
// what lets a server component pass createServerAnonClient() (RLS applies,
// scoped to the signed-in planner) and a portfolio roll-up pass
// createServerClient() (service role) without a second copy of the query.
//
// Nothing in this file hardcodes a metric. Every number returned is read
// from the database at call time.

import type { Database, Json } from "@/lib/database.types";
import type { StyleverseClient } from "@/lib/supabase";
import type { PostgrestError } from "@supabase/supabase-js";

// ============================================================ jsonb typing
//
// Four columns are jsonb: forecast.drivers / recommendation.drivers,
// launch_forecast.analogues, recommendation.payload, model_registry.metrics.
// `Json` (from the generated types) is already a closed recursive union, so
// none of this needs `any` -- it needs narrowing, which is what follows.

/** A jsonb object, as it comes back from PostgREST. */
export type JsonObject = { [key: string]: Json | undefined };

/** Sign of a SHAP contribution, as written by the scoring pipeline. */
export type DriverDirection = "increases" | "decreases";

/**
 * One row of exact tree SHAP attribution, in units, as stored in
 * forecast.drivers and recommendation.drivers. Contributions are signed and
 * sum toward the prediction; `method` is "tree_shap_exact" for every row the
 * pipeline currently writes.
 */
export type ShapDriver = {
  feature: string;
  contribution_units: number;
  direction: DriverDirection;
  method: string;
};

/**
 * One comparable style behind a cold-start launch estimate, as stored in
 * launch_forecast.analogues. `similarity` is attribute cosine in [0, 1];
 * `actual_first_8wk` is the analogue's realised first-eight-week volume.
 */
export type LaunchAnalogue = {
  style_id: string;
  style_name: string | null;
  descriptor: string | null;
  similarity: number;
  actual_first_8wk: number | null;
};

/**
 * recommendation.payload -- the deterministic numbers behind a
 * recommendation (projected_wos, units_at_risk, buy deltas, shift
 * percentages). Its keys vary by rec_type and action, so it stays an open
 * json object rather than a lie about a fixed shape.
 */
export type RecommendationPayload = JsonObject;

/**
 * model_registry.metrics -> benchmark_comparison. Accuracy is 1 - WAPE,
 * volume weighted. `manual` is the constructed manual baseline; the
 * benchmarks nobody constructed (seasonal_naive, drift, rolling_13) are the
 * ones worth quoting.
 */
export type BenchmarkComparison = {
  model?: number | null;
  manual?: number | null;
  drift?: number | null;
  rolling_13?: number | null;
  seasonal_naive?: number | null;
  mase_model?: number | null;
  mase_snaive?: number | null;
  margin_over_snaive?: number | null;
};

/**
 * model_registry.metrics. The named keys are the ones the pipeline always
 * writes for a planning-grain model; cold-start models carry a different
 * subset (cold_start_accuracy, naive_category_median_accuracy, n_styles), so
 * the index signature stays open.
 */
export type ModelMetrics = {
  benchmark_comparison?: BenchmarkComparison | null;
  by_fold?: Json;
  quantiles?: Json;
  blend?: Json;
  ai_accuracy_vs_demand?: Json;
  ai_accuracy_vs_sales?: Json;
  manual_accuracy_vs_demand?: Json;
  manual_accuracy_vs_sales?: Json;
  p10_p90_coverage?: Json;
  p10_p90_coverage_by_fold?: Json;
  mean_interval_width_units?: Json;
  quantile_crossing_pct_backtest?: Json;
  latest_fold_accuracy_vs_demand?: Json;
  cold_start_accuracy?: Json;
  naive_category_median_accuracy?: Json;
  n_styles?: Json;
  n_test?: Json;
  note?: Json;
  [key: string]: Json | undefined;
};

function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** Narrow a jsonb driver array. Unparseable entries are dropped, not faked. */
export function parseDrivers(raw: Json | null | undefined): ShapDriver[] {
  if (!Array.isArray(raw)) return [];
  const out: ShapDriver[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const feature = asString(entry.feature);
    const contribution = asNumber(entry.contribution_units);
    if (feature === null || contribution === null) continue;
    const stated = asString(entry.direction);
    out.push({
      feature,
      contribution_units: contribution,
      direction:
        stated === "increases" || stated === "decreases"
          ? stated
          : contribution >= 0
            ? "increases"
            : "decreases",
      method: asString(entry.method) ?? "unknown",
    });
  }
  return out;
}

/** Narrow a jsonb analogue array from launch_forecast.analogues. */
export function parseAnalogues(raw: Json | null | undefined): LaunchAnalogue[] {
  if (!Array.isArray(raw)) return [];
  const out: LaunchAnalogue[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const styleId = asString(entry.style_id);
    if (styleId === null) continue;
    out.push({
      style_id: styleId,
      style_name: asString(entry.style_name),
      descriptor: asString(entry.descriptor),
      similarity: asNumber(entry.similarity) ?? 0,
      actual_first_8wk: asNumber(entry.actual_first_8wk),
    });
  }
  return out;
}

/** Narrow recommendation.payload to a json object; never null. */
export function parsePayload(raw: Json | null | undefined): RecommendationPayload {
  return isJsonObject(raw) ? raw : {};
}

/** Narrow model_registry.metrics, including benchmark_comparison. */
export function parseModelMetrics(raw: Json | null | undefined): ModelMetrics {
  if (!isJsonObject(raw)) return {};
  const metrics: ModelMetrics = { ...raw };
  const bench = raw.benchmark_comparison;
  if (isJsonObject(bench)) {
    metrics.benchmark_comparison = {
      model: asNumber(bench.model),
      manual: asNumber(bench.manual),
      drift: asNumber(bench.drift),
      rolling_13: asNumber(bench.rolling_13),
      seasonal_naive: asNumber(bench.seasonal_naive),
      mase_model: asNumber(bench.mase_model),
      mase_snaive: asNumber(bench.mase_snaive),
      margin_over_snaive: asNumber(bench.margin_over_snaive),
    };
  } else {
    metrics.benchmark_comparison = null;
  }
  return metrics;
}

// ================================================================= plumbing

type Tbl = Database["public"]["Tables"];
type Vw = Database["public"]["Views"];

export type RecType = Database["public"]["Enums"]["rec_type"];
export type RecAction = Database["public"]["Enums"]["rec_action"];
export type DecisionStatus = Database["public"]["Enums"]["decision_status"];

/**
 * The statuses that represent a COMMITMENT.
 *
 * decision_status also carries SCENARIO, which exists so scenario work lands
 * in the same append-only ledger as real decisions. v_recommendation_state
 * filters those out, so anything reading committed decision state can never
 * receive one -- and a screen that mapped a label for it would be asserting
 * a state it will never render. Narrow here rather than adding dead entries.
 */
export type CommittedDecisionStatus = Exclude<DecisionStatus, "SCENARIO">;

/**
 * Narrow a raw decision_status to a committed one.
 *
 * v_recommendation_state already filters SCENARIO out, so this should never
 * see one. It is a guard rather than a cast because if a scenario ever did
 * reach here, "no committed decision" is the truthful reading of it -- an
 * exploration is not a decision, and silently relabelling it as one is the
 * failure this whole separation exists to prevent.
 */
export function committedStatus(
  status: DecisionStatus | null,
): CommittedDecisionStatus | null {
  return status === null || status === "SCENARIO" ? null : status;
}

/** Values seeded into downstream_handoff.function by the pipeline. */
export type DownstreamFunction =
  | "DESIGN"
  | "MANUFACTURING"
  | "MARKETING"
  | "RETAIL_OPS";

function fail(what: string, error: PostgrestError): never {
  const hint = error.hint ? ` (${error.hint})` : "";
  throw new Error(`StyleVerse: ${what} failed -- ${error.message}${hint}`);
}

// ============================================================ forecast series

export type ForecastHistoryPoint = {
  iso_week: string;
  week_start: string;
  sales_units: number | null;
  demand_units_unconstrained: number | null;
  availability_ratio: number | null;
  manual_baseline_forecast_units: number | null;
  net_revenue_inr: number | null;
  markdown_units: number | null;
  markdown_loss_inr: number | null;
  closing_inventory_units: number | null;
  /** Below 0.95 availability the week is demand-censored and unscoreable. */
  excluded_from_accuracy_scoring: boolean;
};

export type ForecastPoint = {
  iso_week: string;
  week_start: string;
  horizon_week: number;
  /** Lower quantile of the predictive interval. */
  p10: number | null;
  /** The point forecast. This is p50. */
  forecast_units: number;
  /** Upper quantile of the predictive interval. */
  p90: number | null;
  manual_baseline_forecast_units: number | null;
  avg_selling_price_inr: number | null;
  model_version: string;
  generated_at: string;
  drivers: ShapDriver[];
};

export type ForecastSeries = {
  brand_id: string;
  category_id: string;
  channel_id: string;
  region_id: string;
  /** Actuals, oldest first. */
  history: ForecastHistoryPoint[];
  /** Horizon weeks 1..12, oldest first. p10 / forecast_units (p50) / p90. */
  forward: ForecastPoint[];
};

/**
 * One planning-grain series: realised history joined to the forward forecast
 * that follows it, so a chart can draw actuals and the p10-p90 fan on a
 * single time axis without a second round trip.
 */
export async function getForecastSeries(
  sb: StyleverseClient,
  brandId: string,
  category: string,
  channel: string,
  region: string,
): Promise<ForecastSeries> {
  const [historyRes, forwardRes] = await Promise.all([
    sb
      .from("fact_demand_weekly")
      .select(
        "iso_week, week_start, sales_units, demand_units_unconstrained, availability_ratio, manual_baseline_forecast_units, net_revenue_inr, markdown_units, markdown_loss_inr, closing_inventory_units, excluded_from_accuracy_scoring",
      )
      .eq("brand_id", brandId)
      .eq("category_id", category)
      .eq("channel_id", channel)
      .eq("region_id", region)
      .order("week_start", { ascending: true }),
    sb
      .from("forecast")
      .select(
        "iso_week, week_start, horizon_week, p10, forecast_units, p90, manual_baseline_forecast_units, avg_selling_price_inr, model_version, generated_at, drivers",
      )
      .eq("brand_id", brandId)
      .eq("category_id", category)
      .eq("channel_id", channel)
      .eq("region_id", region)
      .order("horizon_week", { ascending: true }),
  ]);

  if (historyRes.error) fail("getForecastSeries(history)", historyRes.error);
  if (forwardRes.error) fail("getForecastSeries(forecast)", forwardRes.error);

  return {
    brand_id: brandId,
    category_id: category,
    channel_id: channel,
    region_id: region,
    history: historyRes.data.map((row) => ({
      iso_week: row.iso_week,
      week_start: row.week_start,
      sales_units: row.sales_units,
      demand_units_unconstrained: row.demand_units_unconstrained,
      availability_ratio: row.availability_ratio,
      manual_baseline_forecast_units: row.manual_baseline_forecast_units,
      net_revenue_inr: row.net_revenue_inr,
      markdown_units: row.markdown_units,
      markdown_loss_inr: row.markdown_loss_inr,
      closing_inventory_units: row.closing_inventory_units,
      excluded_from_accuracy_scoring: row.excluded_from_accuracy_scoring ?? false,
    })),
    forward: forwardRes.data.map((row) => ({
      iso_week: row.iso_week,
      week_start: row.week_start,
      horizon_week: row.horizon_week,
      p10: row.p10,
      forecast_units: row.forecast_units,
      p90: row.p90,
      manual_baseline_forecast_units: row.manual_baseline_forecast_units,
      avg_selling_price_inr: row.avg_selling_price_inr,
      model_version: row.model_version,
      generated_at: row.generated_at,
      drivers: parseDrivers(row.drivers),
    })),
  };
}

// ============================================================ recommendations

type RecStateRow = Vw["v_recommendation_state"]["Row"];

/**
 * A recommendation plus its most recent planner decision. `status` is null
 * while a recommendation is still open.
 */
export interface RecommendationState
  extends Omit<RecStateRow, "payload" | "drivers"> {
  payload: RecommendationPayload;
  drivers: ShapDriver[];
}

function toRecommendationState(row: RecStateRow): RecommendationState {
  return {
    ...row,
    payload: parsePayload(row.payload),
    drivers: parseDrivers(row.drivers),
  };
}

/**
 * Recommendations in their current state, newest first. Filter by rec_type
 * and/or by decision status; omit both to get everything for the brand.
 */
export async function getRecommendations(
  sb: StyleverseClient,
  brandId: string,
  recType?: RecType,
  status?: DecisionStatus,
): Promise<RecommendationState[]> {
  let query = sb
    .from("v_recommendation_state")
    .select("*")
    .eq("brand_id", brandId);

  if (recType) query = query.eq("rec_type", recType);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) fail("getRecommendations", error);
  return data.map(toRecommendationState);
}

/**
 * Exceptions only, ranked by money on the table. This ordering is the point
 * of the screen: a planner works the list top-down and stops when the
 * remaining value stops justifying the attention.
 */
export async function getExceptions(
  sb: StyleverseClient,
  brandId: string,
): Promise<RecommendationState[]> {
  const { data, error } = await sb
    .from("v_recommendation_state")
    .select("*")
    .eq("brand_id", brandId)
    .eq("rec_type", "EXCEPTION")
    .order("value_at_stake_inr", { ascending: false, nullsFirst: false });

  if (error) fail("getExceptions", error);
  return data.map(toRecommendationState);
}

// ================================================================== markdown

export type MarkdownRecommendation = Tbl["markdown_recommendation"]["Row"];

/**
 * Markdown timing and depth, ranked by margin saved. margin_if_now versus
 * margin_if_delayed is the whole argument for acting this week.
 */
export async function getMarkdownRecs(
  sb: StyleverseClient,
  brandId: string,
): Promise<MarkdownRecommendation[]> {
  const { data, error } = await sb
    .from("markdown_recommendation")
    .select("*")
    .eq("brand_id", brandId)
    .order("margin_saved", { ascending: false, nullsFirst: false });

  if (error) fail("getMarkdownRecs", error);
  return data;
}

// ==================================================================== launch

type LaunchRow = Tbl["launch_forecast"]["Row"];

/**
 * A cold-start launch estimate. Confidence is assigned from newness_class,
 * never from model output -- measured cold-start accuracy is around 50% and
 * pretending otherwise would be the dishonest move.
 */
export interface LaunchForecast extends Omit<LaunchRow, "analogues"> {
  analogues: LaunchAnalogue[];
}

/** Launch forecasts for styles with no sales history, soonest launch first. */
export async function getLaunchForecasts(
  sb: StyleverseClient,
  brandId: string,
): Promise<LaunchForecast[]> {
  const { data, error } = await sb
    .from("launch_forecast")
    .select("*")
    .eq("brand_id", brandId)
    .order("launch_week", { ascending: true, nullsFirst: false });

  if (error) fail("getLaunchForecasts", error);
  return data.map((row) => ({ ...row, analogues: parseAnalogues(row.analogues) }));
}

// =================================================================== signals

export type SignalIntelligence = Tbl["signal_intelligence"]["Row"];

/**
 * External signal series. measured_lead_weeks and lead_correlation are
 * measured on this dataset, not asserted -- trend_confidence_band records how
 * much weight the measurement carries.
 */
export async function getSignalIntelligence(
  sb: StyleverseClient,
  brandId: string,
  categoryId?: string,
): Promise<SignalIntelligence[]> {
  let query = sb
    .from("signal_intelligence")
    .select("*")
    .eq("brand_id", brandId);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query.order("week_start", { ascending: true });
  if (error) fail("getSignalIntelligence", error);
  return data;
}

// ================================================================== adoption

export type PlannerAdoption = Tbl["planner_adoption"]["Row"];

/**
 * Per-planner adoption index. A transparent composite, NOT a classifier:
 * dim_planner carries no adoption outcome, so there is no label to train on.
 * The weights are published in `rationale`, which makes every score
 * re-derivable by hand.
 */
export async function getPlannerAdoption(
  sb: StyleverseClient,
  brandId: string,
): Promise<PlannerAdoption[]> {
  const { data, error } = await sb
    .from("planner_adoption")
    .select("*")
    .eq("brand_id", brandId)
    .order("adoption_index", { ascending: false, nullsFirst: false });

  if (error) fail("getPlannerAdoption", error);
  return data;
}

// ================================================================ model ops

type ModelRow = Tbl["model_registry"]["Row"];

export interface ModelRegistryEntry extends Omit<ModelRow, "metrics"> {
  /** Full rolling-origin backtest, fold by fold, plus benchmark_comparison. */
  metrics: ModelMetrics;
}

/**
 * The model registry. Pass a model_version to pin one entry; omit it for all
 * four (two planning-grain, two cold-start), newest training run first.
 */
export const getModelRegistry = cache(async function getModelRegistry(
  sb: StyleverseClient,
  modelVersion?: string,
): Promise<ModelRegistryEntry[]> {
  let query = sb.from("model_registry").select("*");
  if (modelVersion) query = query.eq("model_version", modelVersion);

  const { data, error } = await query.order("trained_at", { ascending: false });
  if (error) fail("getModelRegistry", error);
  return data.map((row) => ({ ...row, metrics: parseModelMetrics(row.metrics) }));
});

// ============================================================== governance

type PolicyRow = Tbl["policy_parameter"]["Row"];

/**
 * A threshold, with the derivation that produced it and the value actually
 * running. When they differ, override_reason must say why -- that gap is the
 * governance story, so it is surfaced as a flag rather than left to the eye.
 */
export interface PolicyParameter extends PolicyRow {
  /** True when applied_value departs from computed_value. */
  is_overridden: boolean;
}

/** Every threshold the recommendation system resolves through. */
export async function getPolicyParameters(
  sb: StyleverseClient,
  brandId: string,
): Promise<PolicyParameter[]> {
  const { data, error } = await sb
    .from("policy_parameter")
    .select("*")
    .eq("brand_id", brandId)
    .order("param_name", { ascending: true });

  if (error) fail("getPolicyParameters", error);
  return data.map((row) => ({
    ...row,
    is_overridden:
      row.computed_value !== null &&
      row.applied_value !== null &&
      row.computed_value !== row.applied_value,
  }));
}

export type Elasticity = Tbl["elasticity"]["Row"];

/**
 * Fitted price elasticity per category. `is_pooled_fallback` is true where
 * the category had too few observations to fit on its own and borrows the
 * pooled coefficient -- read r_squared and n_observations alongside it.
 */
export async function getElasticity(
  sb: StyleverseClient,
  brandId: string,
): Promise<Elasticity[]> {
  const { data, error } = await sb
    .from("elasticity")
    .select("*")
    .eq("brand_id", brandId)
    .order("category_id", { ascending: true });

  if (error) fail("getElasticity", error);
  return data;
}

// ================================================================ downstream

export type DownstreamHandoff = Tbl["downstream_handoff"]["Row"];

/**
 * Insights handed to functions outside planning. Every row is derived from a
 * query and carries its source_table; DESIGN rows in particular stay
 * descriptive, because the measured attribute spread supports no causal claim.
 */
export async function getDownstreamHandoffs(
  sb: StyleverseClient,
  brandId: string,
  fn?: DownstreamFunction,
): Promise<DownstreamHandoff[]> {
  let query = sb
    .from("downstream_handoff")
    .select("*")
    .eq("brand_id", brandId);

  if (fn) query = query.eq("function", fn);

  const { data, error } = await query.order("generated_at", { ascending: false });
  if (error) fail("getDownstreamHandoffs", error);
  return data;
}

// ==================================================================== agents

export type AgentRun = Tbl["agent_run"]["Row"];

/** Agent execution log, most recent run first. */
export async function getAgentRuns(
  sb: StyleverseClient,
  limit = 50,
): Promise<AgentRun[]> {
  const { data, error } = await sb
    .from("agent_run")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) fail("getAgentRuns", error);
  return data;
}

export type AutonomyBand = Tbl["autonomy_band"]["Row"];

/**
 * What each agent may do without asking, and who carries the outcome when it
 * does. owner_employee_id is a person, not a team, on purpose.
 */
export async function getAutonomyBands(
  sb: StyleverseClient,
  brandId: string,
): Promise<AutonomyBand[]> {
  const { data, error } = await sb
    .from("autonomy_band")
    .select("*")
    .eq("brand_id", brandId)
    .order("agent_name", { ascending: true });

  if (error) fail("getAutonomyBands", error);
  return data;
}

// ======================================================== adoption and value

export type AdoptionKpi = Vw["v_adoption_kpi"]["Row"];

/** Approval / modify / reject counts and value actioned, per rec_type. */
export async function getAdoptionKpi(
  sb: StyleverseClient,
  brandId: string,
): Promise<AdoptionKpi[]> {
  const { data, error } = await sb
    .from("v_adoption_kpi")
    .select("*")
    .eq("brand_id", brandId)
    .order("rec_type", { ascending: true });

  if (error) fail("getAdoptionKpi", error);
  return data;
}

export type ValueSummary = Tbl["value_summary"]["Row"];

/**
 * Value delivered, per brand and for the portfolio. Read `basis` before
 * quoting any of it: markdown_avoided_margin_inr is a MARGIN figure and
 * lost_sales_recovered_margin_inr is revenue already converted to margin at
 * the brand gross_margin. The conversion is what makes total_margin_inr a
 * legitimate sum -- do not re-derive it by adding raw revenue to margin.
 */
export async function getValueSummary(
  sb: StyleverseClient,
): Promise<ValueSummary[]> {
  const { data, error } = await sb
    .from("value_summary")
    .select("*")
    .order("scope", { ascending: true })
    .order("brand_id", { ascending: true, nullsFirst: true });

  if (error) fail("getValueSummary", error);
  return data;
}

export type TimeReallocation = Vw["v_time_reallocation"]["Row"];

/** Where planner time goes, by role. Percentages, one row per role. */
export async function getTimeReallocation(
  sb: StyleverseClient,
  brandId: string,
): Promise<TimeReallocation[]> {
  const { data, error } = await sb
    .from("v_time_reallocation")
    .select("*")
    .eq("brand_id", brandId)
    .order("role", { ascending: true });

  if (error) fail("getTimeReallocation", error);
  return data;
}

export type TouchlessRate = Vw["v_touchless_rate"]["Row"];

/**
 * The touchless rate: recommendations the agents closed without a human, as
 * a share of all recommendations and of those the agents examined.
 *
 * A9 -- READ THIS BEFORE TYPING A NUMBER INTO A COMPONENT.
 * v_touchless_rate is a VIEW and it moves every time the agents run. Never
 * hardcode it. The static mock in production.html says "221 of 584"; that
 * figure is stale and was never live. The real current figure is 95 of 605,
 * which is 15.7% of all recommendations (47.3% of the 201 examined), and it
 * will be different again after the next agent run. Render
 * `agent_acted` of `recommendations_total` from this row and nothing else.
 *
 * The view yields exactly ONE row, hence a single object rather than a list.
 * Null means the view is empty -- the agents have not run yet.
 */
export async function getTouchlessRate(
  sb: StyleverseClient,
): Promise<TouchlessRate | null> {
  const { data, error } = await sb
    .from("v_touchless_rate")
    .select("*")
    .maybeSingle();

  if (error) fail("getTouchlessRate", error);
  return data;
}

// ================================================================= embargo

export type EmbargoStatus = {
  brand_id: string;
  weeks_total: number;
  weeks_revealed: number;
  first_reveal_on: string | null;
  next_reveal_on: string | null;
  latest_revealed_week: string | null;
};

/**
 * Forward weeks are sealed and reveal on a schedule; this is why every
 * accuracy figure in the product comes from a historical backtest rather
 * than from forward actuals. `weeks_revealed` is computed against
 * current_date in the view, so the moment a week unlocks the pill says so
 * without anyone editing a constant.
 */
export async function getEmbargoStatus(
  sb: StyleverseClient,
  brandId?: string,
): Promise<EmbargoStatus[]> {
  let q = sb.from("v_embargo_status").select("*");
  if (brandId) q = q.eq("brand_id", brandId);
  const { data, error } = await q;
  if (error) fail("getEmbargoStatus", error);
  return (data ?? []) as EmbargoStatus[];
}
