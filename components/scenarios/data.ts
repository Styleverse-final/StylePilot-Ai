// Server-side reads for the scenario screen.
//
// Every function here takes the Supabase client as its first argument, the
// same shape lib/queries.ts uses, and the page passes
// createServerAnonClient() -- the anon key bound to the caller's session
// cookie. Row level security therefore decides what a scenario is run over.
// A planner scoped to three categories in one region gets a base plan built
// from their own book and a smaller unit total than their manager's, and
// that is the correct number rather than a truncated one. Nothing in this
// file reaches for the service role.
//
// WHAT IS NOT HERE
// ----------------
// There is no scoring call, no /predict, no Python. The forecast rows are
// already written; this module sums them. The only arithmetic it does is
// aggregation, and the only judgement it makes is which rows to ask for.

import type { StyleverseClient } from "@/lib/supabase";
import type { CategoryBase, ElasticityFit, PlanEconomics } from "./model";
import { parseScenarioNote, type ScenarioScope } from "./note";

/** PostgREST pages below any plausible max-rows setting. */
const PAGE_SIZE = 500;
/** 108 planning-grain series per brand x 12 horizon weeks = 1,296 at most. */
const MAX_FORECAST_ROWS = 4000;
/** Guard against an unterminated pagination loop. */
const MAX_PAGES = 40;

/** The parameter rows this screen multiplies by, by name. */
const SPREAD_FACTOR_PARAM = "safety_spread_factor";
const AGGREGATION_FACTOR_PARAM = "safety_aggregation_factor";
const COVERAGE_PARAM = "interval_coverage_calibrated";
const CEILING_PREFIX = "cover_ceiling_";

/**
 * The holding cost per unit-week, as it is written into policy_parameter.
 *
 * It is not a column. It is stated inside the override_reason on every
 * cover_ceiling row -- "Holding cost alone would justify carrying 159.5
 * weeks of cover at INR 3.53 per unit-week, but ..." -- which is the same
 * string the exceptions screen already renders verbatim under its threshold
 * banner. Reading the number out of that sentence keeps the two screens on
 * one source: if the pipeline ever re-prices storage, both move together
 * and neither has a constant of its own to forget.
 */
const HOLDING_COST_PATTERN = /INR\s+([0-9][0-9,]*(?:\.[0-9]+)?)\s+per\s+unit-week/i;

/**
 * The fold count behind the CALIBRATED coverage, as its own row states it.
 *
 * interval_coverage_calibrated.basis says, in words, "this is a mean over 3
 * folds, NOT four", because split-conformal calibration has no prior fold to
 * fit its offset on for fold 1. That count is read out of the sentence that
 * publishes the coverage rather than derived from the accuracy fold count by
 * subtraction -- a subtraction would be this page's own arithmetic wearing
 * the clothes of a stored figure.
 */
const COVERAGE_FOLDS_PATTERN = /\bmean\s+over\s+(\d+)\s+folds?\b/i;

// ------------------------------------------------------------------- scope

export type ScopeTriple = {
  category: string;
  channel: string;
  region: string;
};

export type LabelMap = Readonly<Record<string, string>>;

export type ScopeLabels = {
  category: LabelMap;
  channel: LabelMap;
  region: LabelMap;
};

/**
 * Every (category, channel, region) series this session can read.
 *
 * horizon_week 1 yields exactly one row per series, so the read is 108 rows
 * per brand at the ceiling. The selectors are built from this and from
 * nothing else, which is what makes an out-of-scope combination impossible
 * to choose: a pairing that would come back empty is never offered.
 */
export async function readScopeTriples(
  sb: StyleverseClient,
  brandId: string,
): Promise<ScopeTriple[]> {
  const { data, error } = await sb
    .from("forecast")
    .select("category_id, channel_id, region_id")
    .eq("brand_id", brandId)
    .eq("horizon_week", 1)
    .order("category_id", { ascending: true })
    .order("channel_id", { ascending: true })
    .order("region_id", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(`StyleVerse: scenario scope read failed -- ${error.message}`);
  }

  const triples: ScopeTriple[] = [];
  for (const row of data) {
    // The generated types make every dimension nullable. A row missing one
    // is not a series anyone can select, so it is dropped rather than
    // coerced into a triple that would query for nulls.
    if (
      row.category_id === null ||
      row.channel_id === null ||
      row.region_id === null
    ) {
      continue;
    }
    triples.push({
      category: row.category_id,
      channel: row.channel_id,
      region: row.region_id,
    });
  }
  return triples;
}

/** Display names for the ids in the selectors. Names, not codes. */
export async function readLabels(sb: StyleverseClient): Promise<ScopeLabels> {
  const [categories, channels, regions] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  const category: Record<string, string> = {};
  for (const row of categories.data ?? []) {
    if (row.category_name) category[row.category_id] = row.category_name;
  }
  const channel: Record<string, string> = {};
  for (const row of channels.data ?? []) {
    if (row.channel_name) channel[row.channel_id] = row.channel_name;
  }
  const region: Record<string, string> = {};
  for (const row of regions.data ?? []) {
    if (row.region_name) region[row.region_id] = row.region_name;
  }
  return { category, channel, region };
}

// ---------------------------------------------------------------- forecast

type ForecastRow = {
  category_id: string | null;
  channel_id: string | null;
  region_id: string | null;
  forecast_units: number;
  p10: number | null;
  p90: number | null;
  avg_selling_price_inr: number | null;
  horizon_week: number;
  week_start: string;
  iso_week: string;
  model_version: string;
  generated_at: string;
};

export type ForecastBase = {
  /** One row per category present in the selection. */
  categories: CategoryBase[];
  rowCount: number;
  seriesCount: number;
  /** max(horizon_week) across the rows read. 12 on this pilot. */
  horizonWeeks: number;
  /** Distinct model_version stamps across the rows actually summed. */
  modelVersions: string[];
  /** Latest generated_at across those rows. */
  generatedAt: string | null;
  firstWeek: string | null;
  lastWeek: string | null;
  /** Rows whose p90 was null, so they contributed no spread. Never hidden. */
  rowsWithoutInterval: number;
  /** Rows whose avg_selling_price_inr was null, so they carry no money. */
  rowsWithoutPrice: number;
  /** True when the read hit its ceiling, so the sums are partial. */
  truncated: boolean;
};

/**
 * The stored forecast for the selection, summed per category.
 *
 * Paginated because a planning manager reads all 108 series x 12 weeks and
 * PostgREST caps a single response. Pages advance by what actually came
 * back rather than by the requested size, so a server-side max-rows setting
 * smaller than the page cannot silently truncate the plan.
 */
export async function readForecastBase(
  sb: StyleverseClient,
  brandId: string,
  scope: ScenarioScope,
  elasticity: ReadonlyMap<string, ElasticityFit>,
  labels: LabelMap,
): Promise<ForecastBase> {
  const rows: ForecastRow[] = [];
  let from = 0;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = sb
      .from("forecast")
      .select(
        "category_id, channel_id, region_id, forecast_units, p10, p90, avg_selling_price_inr, horizon_week, week_start, iso_week, model_version, generated_at",
      )
      .eq("brand_id", brandId);

    if (scope.category !== null) query = query.eq("category_id", scope.category);
    if (scope.channel !== null) query = query.eq("channel_id", scope.channel);
    if (scope.region !== null) query = query.eq("region_id", scope.region);

    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `StyleVerse: scenario forecast read failed -- ${error.message}`,
      );
    }
    // Termination is on an EMPTY page, not on a short one. A short page is
    // ambiguous -- it means either "that was the last of them" or "the server
    // caps responses below the page size" -- and only one of those readings
    // is safe to act on. The cost is one extra round trip; the alternative is
    // a plan that is quietly missing rows, which is the failure this whole
    // codebase is written against.
    if (data.length === 0) break;

    rows.push(...data);
    from += data.length;

    if (rows.length >= MAX_FORECAST_ROWS) {
      truncated = true;
      break;
    }
  }

  type Accumulator = {
    demandUnits: number;
    spreadUnits: number;
    demandRevenue: number;
    rowCount: number;
    series: Set<string>;
  };
  const byCategory = new Map<string, Accumulator>();
  const allSeries = new Set<string>();
  const versions = new Set<string>();

  let horizonWeeks = 0;
  let generatedAt: string | null = null;
  let firstWeek: string | null = null;
  let lastWeek: string | null = null;
  let rowsWithoutInterval = 0;
  let rowsWithoutPrice = 0;

  for (const row of rows) {
    const categoryId = row.category_id;
    if (categoryId === null) continue;

    let bucket = byCategory.get(categoryId);
    if (bucket === undefined) {
      bucket = {
        demandUnits: 0,
        spreadUnits: 0,
        demandRevenue: 0,
        rowCount: 0,
        series: new Set<string>(),
      };
      byCategory.set(categoryId, bucket);
    }

    const p50 = row.forecast_units;
    // A null p90 is not a zero spread; it is a row with no published upper
    // quantile. It still contributes demand, and it is counted so the
    // screen can say how much of the plan carries no interval.
    const spread =
      row.p90 === null ? null : Math.max(row.p90 - p50, 0);
    if (spread === null) rowsWithoutInterval += 1;
    if (row.avg_selling_price_inr === null) rowsWithoutPrice += 1;

    bucket.demandUnits += p50;
    bucket.spreadUnits += spread ?? 0;
    bucket.demandRevenue += p50 * (row.avg_selling_price_inr ?? 0);
    bucket.rowCount += 1;

    const seriesKey = `${categoryId}|${row.channel_id ?? ""}|${row.region_id ?? ""}`;
    bucket.series.add(seriesKey);
    allSeries.add(seriesKey);

    versions.add(row.model_version);
    if (row.horizon_week > horizonWeeks) horizonWeeks = row.horizon_week;
    if (generatedAt === null || row.generated_at > generatedAt) {
      generatedAt = row.generated_at;
    }
    if (firstWeek === null || row.week_start < firstWeek) firstWeek = row.week_start;
    if (lastWeek === null || row.week_start > lastWeek) lastWeek = row.week_start;
  }

  const categories: CategoryBase[] = [...byCategory.entries()]
    .map(([categoryId, bucket]) => ({
      categoryId,
      categoryName: labels[categoryId] ?? categoryId,
      demandUnits: bucket.demandUnits,
      spreadUnits: bucket.spreadUnits,
      aspInr:
        bucket.demandUnits > 0 ? bucket.demandRevenue / bucket.demandUnits : 0,
      rowCount: bucket.rowCount,
      seriesCount: bucket.series.size,
      fit: elasticity.get(categoryId) ?? null,
    }))
    .sort((a, b) => b.demandUnits - a.demandUnits);

  return {
    categories,
    rowCount: rows.length,
    seriesCount: allSeries.size,
    horizonWeeks,
    modelVersions: [...versions].sort(),
    generatedAt,
    firstWeek,
    lastWeek,
    rowsWithoutInterval,
    rowsWithoutPrice,
    truncated,
  };
}

// -------------------------------------------------------------- elasticity

/**
 * The fitted curve, one row per category, keyed for the aggregation above.
 *
 * is_pooled_fallback and the category's own r_squared both travel with the
 * coefficient. A category that borrows the pooled fit is not silently
 * identical to one that earned its own, and this screen refuses to render
 * it as though it were.
 */
export async function readElasticity(
  sb: StyleverseClient,
  brandId: string,
): Promise<Map<string, ElasticityFit>> {
  const { data, error } = await sb
    .from("elasticity")
    .select(
      "category_id, coefficient, intercept, r_squared, n_observations, is_pooled_fallback, fitted_at",
    )
    .eq("brand_id", brandId)
    .order("category_id", { ascending: true });

  if (error) {
    throw new Error(`StyleVerse: elasticity read failed -- ${error.message}`);
  }

  const fits = new Map<string, ElasticityFit>();
  for (const row of data) {
    // A fit with no category, no slope or no intercept is not a curve this
    // screen can apply. Dropping it is the honest move: the category then
    // shows as unfitted and the levers visibly leave it alone, rather than
    // silently receiving a coefficient of zero.
    const categoryId = row.category_id;
    if (categoryId === null || row.coefficient === null || row.intercept === null) {
      continue;
    }
    fits.set(categoryId, {
      categoryId,
      coefficient: row.coefficient,
      intercept: row.intercept,
      rSquared: row.r_squared,
      nObservations: row.n_observations,
      isPooledFallback: row.is_pooled_fallback ?? false,
      fittedAt: row.fitted_at,
    });
  }
  return fits;
}

// ------------------------------------------------------- marketing evidence

/**
 * Terms that would indicate the model learned a marketing response.
 *
 * Deliberately wide. The marketing lever on this screen is labelled an
 * assumption, and a label like that is only worth having if the screen
 * actually checked -- so the check is generous, and if it ever matches, the
 * lever's caption changes to say the model does carry a marketing term.
 */
const MARKETING_FEATURE_PATTERN = /market|spend|advert|campaign|media|promo_budget/i;

export type MarketingEvidence = {
  /** The registry row the features were read from. */
  modelVersion: string | null;
  featureCount: number;
  /** Feature names that look like a marketing term. Empty on this pilot. */
  marketingFeatures: string[];
  /** False when no registry row was readable, so no claim is made. */
  checked: boolean;
};

/**
 * Whether the model behind these forecasts has any marketing feature at all.
 *
 * The scenario screen tells a planner that the marketing index is a stated
 * assumption rather than a measured response. That sentence is a claim about
 * the model, so it is checked against the model's own registry row rather
 * than asserted from memory, and the feature count is shown alongside it.
 */
export async function readMarketingEvidence(
  sb: StyleverseClient,
  modelVersion: string | null,
): Promise<MarketingEvidence> {
  if (modelVersion === null) {
    return { modelVersion: null, featureCount: 0, marketingFeatures: [], checked: false };
  }

  const { data, error } = await sb
    .from("model_registry")
    .select("model_version, features")
    .eq("model_version", modelVersion)
    .maybeSingle();

  if (error || !data) {
    return { modelVersion, featureCount: 0, marketingFeatures: [], checked: false };
  }

  const features = Array.isArray(data.features)
    ? data.features.filter((value): value is string => typeof value === "string")
    : [];

  return {
    modelVersion: data.model_version,
    featureCount: features.length,
    marketingFeatures: features.filter((name) =>
      MARKETING_FEATURE_PATTERN.test(name),
    ),
    checked: features.length > 0,
  };
}

// ---------------------------------------------------------------- economics

export type EconomicsSources = {
  /** The policy_parameter row the holding cost sentence was read from. */
  holdingCostParam: string | null;
  /** That sentence, verbatim, so the screen can show its own source. */
  holdingCostSentence: string | null;
  /** cover_ceiling computed_value: weeks of cover holding cost alone allows. */
  breakevenWeeks: number | null;
  /** The service_level row's basis string, which states Cu and Co in rupees. */
  serviceLevelBasis: string | null;
  /** interval_coverage_calibrated: measured coverage and nominal band. */
  coverageMeasured: number | null;
  coverageNominal: number | null;
  /**
   * Folds behind that calibrated coverage, READ from the row's own basis.
   * Null when the row is unreadable or does not state a count, in which case
   * the screen says nothing about folds rather than inferring one.
   */
  coverageFolds: number | null;
  /** safety_spread_factor, both values, because they differ on purpose. */
  spreadFactorComputed: number | null;
  spreadFactorApplied: number | null;
  spreadFactorOverride: string | null;
  aggregationFactorBasis: string | null;
  brandName: string | null;
};

export type EconomicsResult = {
  /** null when any input is missing; `missing` then says which. */
  economics: PlanEconomics | null;
  missing: string[];
  sources: EconomicsSources;
};

function parseHoldingCost(sentence: string): number | null {
  const match = HOLDING_COST_PATTERN.exec(sentence);
  if (match === null) return null;
  const value = Number.parseFloat((match[1] ?? "").replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The coverage fold count, out of the coverage row's own basis sentence. */
function parseCoverageFolds(basis: string | null): number | null {
  if (basis === null) return null;
  const match = COVERAGE_FOLDS_PATTERN.exec(basis);
  if (match === null) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Every rate the scenario arithmetic multiplies by, and where each came from.
 *
 * THE HOLDING COST. INR 3.53 per unit-week is the figure sv/value.py charges
 * the business case with and sv/policy.py prices the discarded cover ceiling
 * against. It is quoted inside policy_parameter.override_reason rather than
 * held in a column, so it is read out of that sentence and the sentence is
 * shown beside the number on screen.
 *
 * THE CLEARANCE COST. What a stranded unit gives away is not invented here
 * either. cover_ceiling.computed_value is the breakeven the pipeline
 * publishes -- ASP x markdown depth divided by the holding cost -- so
 * multiplying it back by the holding cost returns ASP x markdown depth, which
 * is exactly the newsvendor's Co: the cost of being long one unit. The
 * service_level row states the same quantity in words, and the screen prints
 * that sentence so the two can be checked against each other by eye.
 */
export async function readPlanEconomics(
  sb: StyleverseClient,
  brandId: string,
  horizonWeeks: number,
): Promise<EconomicsResult> {
  const [policyResult, brandResult] = await Promise.all([
    sb
      .from("policy_parameter")
      .select("param_name, computed_value, applied_value, basis, override_reason")
      .eq("brand_id", brandId)
      // PostgREST does not promise an order, and this screen quotes ONE
      // cover_ceiling row by name as the source of the holding cost. Without
      // an order the row quoted would change between requests for no reason
      // a reader could see.
      .order("param_name", { ascending: true }),
    sb
      .from("dim_brand")
      .select("brand_id, brand_name, gross_margin")
      .eq("brand_id", brandId)
      .maybeSingle(),
  ]);

  const policies = policyResult.data ?? [];
  const byName = new Map(policies.map((row) => [row.param_name, row]));

  const spread = byName.get(SPREAD_FACTOR_PARAM);
  const aggregation = byName.get(AGGREGATION_FACTOR_PARAM);
  const coverage = byName.get(COVERAGE_PARAM);
  const serviceLevel = byName.get("service_level");
  // Every cover_ceiling row for a brand quotes the SAME holding cost and the
  // same breakeven; they differ only in the category whose life caps them. So
  // any of them would give the right rate, but only one of them gets its name
  // printed on screen as the source -- and that has to be the same one on
  // every request. The query is ordered by param_name above and the first
  // qualifying row is taken here, so the row quoted is the alphabetically
  // first cover_ceiling row this session can read, deliberately rather than
  // by whatever order the server happened to return.
  const ceilings = policies.filter(
    (row) =>
      row.param_name.startsWith(CEILING_PREFIX) &&
      typeof row.override_reason === "string" &&
      HOLDING_COST_PATTERN.test(row.override_reason),
  );
  const ceiling = [...ceilings].sort((a, b) =>
    a.param_name.localeCompare(b.param_name),
  )[0];

  const holdingSentence = ceiling?.override_reason ?? null;
  const holdingCost =
    holdingSentence === null ? null : parseHoldingCost(holdingSentence);
  const breakevenWeeks = ceiling?.computed_value ?? null;

  const sources: EconomicsSources = {
    holdingCostParam: ceiling?.param_name ?? null,
    holdingCostSentence: holdingSentence,
    breakevenWeeks,
    serviceLevelBasis: serviceLevel?.basis ?? null,
    coverageMeasured: coverage?.computed_value ?? null,
    coverageNominal: coverage?.applied_value ?? null,
    coverageFolds: parseCoverageFolds(coverage?.basis ?? null),
    spreadFactorComputed: spread?.computed_value ?? null,
    spreadFactorApplied: spread?.applied_value ?? null,
    spreadFactorOverride: spread?.override_reason ?? null,
    aggregationFactorBasis: aggregation?.basis ?? null,
    brandName: brandResult.data?.brand_name ?? null,
  };

  const missing: string[] = [];
  if (spread?.applied_value == null) missing.push(SPREAD_FACTOR_PARAM);
  if (aggregation?.applied_value == null) missing.push(AGGREGATION_FACTOR_PARAM);
  if (brandResult.data?.gross_margin == null) missing.push("dim_brand.gross_margin");
  if (holdingCost === null) {
    missing.push("holding cost per unit-week (policy_parameter override_reason)");
  }
  if (breakevenWeeks === null) missing.push("cover_ceiling computed_value");
  if (horizonWeeks <= 0) missing.push("forecast horizon");

  if (
    missing.length > 0 ||
    spread?.applied_value == null ||
    aggregation?.applied_value == null ||
    brandResult.data?.gross_margin == null ||
    holdingCost === null ||
    breakevenWeeks === null
  ) {
    return { economics: null, missing, sources };
  }

  return {
    economics: {
      spreadFactor: spread.applied_value,
      aggregationFactor: aggregation.applied_value,
      grossMargin: brandResult.data.gross_margin,
      clearanceCostPerUnitInr: breakevenWeeks * holdingCost,
      holdingCostPerUnitWeekInr: holdingCost,
      horizonWeeks,
    },
    missing,
    sources,
  };
}

// ----------------------------------------------------------------- anchors

export type ScenarioAnchor = {
  recommendationId: number;
  categoryId: string | null;
  channelId: string | null;
  regionId: string | null;
  valueAtStakeInr: number | null;
  modelVersion: string;
  /** How closely the anchor matches the current selection. */
  match: "selection" | "owned-category" | "brand";
};

/** The categories the signed-in planner owns, from their dim_planner row. */
export async function readOwnedCategories(
  sb: StyleverseClient,
  employeeId: string | null,
): Promise<string[]> {
  if (!employeeId) return [];
  const { data } = await sb
    .from("dim_planner")
    .select("categories_owned")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const raw = data?.categories_owned;
  if (typeof raw !== "string" || raw.length === 0) return [];
  return raw
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * The recommendation a saved scenario will be filed against.
 *
 * planner_decision.recommendation_id is NOT NULL with a foreign key, and
 * that is not an obstacle to work around -- it is the mechanism. The insert
 * policy resolves category ownership THROUGH the recommendation, so an
 * anchor is what makes "a planner scenarios their own categories only" a
 * database rule rather than a UI convention.
 *
 * The SMALLEST buy recommendation in the selection is chosen on purpose. A
 * scenario commits no quantity, so the anchor's own value is irrelevant to
 * what is being explored, and picking the smallest keeps the row clear of
 * the value ceiling that governs real commitments -- a planner may not
 * decide above INR 50 lakh, and a scenario should never be the thing that
 * runs into that wall.
 */
export async function readAnchor(
  sb: StyleverseClient,
  brandId: string,
  scope: ScenarioScope,
  ownedCategories: readonly string[],
  restrictToOwned: boolean,
): Promise<ScenarioAnchor | null> {
  const attempts: Array<{ scope: ScenarioScope; match: ScenarioAnchor["match"] }> = [
    { scope, match: "selection" },
    {
      scope: { category: scope.category, channel: null, region: null },
      match: "owned-category",
    },
    { scope: { category: null, channel: null, region: null }, match: "brand" },
  ];

  for (const attempt of attempts) {
    // READING a category and being able to WRITE against it are different
    // rights. A planner scoped to a region can read every category in it but
    // owns only some, so an anchor in a category they do not own would be
    // offered here and then refused by the insert policy. Skipping those
    // attempts means the anchor named on screen is always one the database
    // would actually accept.
    if (
      restrictToOwned &&
      ownedCategories.length > 0 &&
      attempt.scope.category !== null &&
      !ownedCategories.includes(attempt.scope.category)
    ) {
      continue;
    }

    let query = sb
      .from("recommendation")
      .select("id, category_id, channel_id, region_id, value_at_stake_inr, model_version")
      .eq("brand_id", brandId)
      .eq("rec_type", "BUY_QUANTITY");

    if (attempt.scope.category !== null) {
      query = query.eq("category_id", attempt.scope.category);
    } else if (restrictToOwned && ownedCategories.length > 0) {
      query = query.in("category_id", [...ownedCategories]);
    }
    if (attempt.scope.channel !== null) {
      query = query.eq("channel_id", attempt.scope.channel);
    }
    if (attempt.scope.region !== null) {
      query = query.eq("region_id", attempt.scope.region);
    }

    const { data, error } = await query
      .order("value_at_stake_inr", { ascending: true, nullsFirst: false })
      .limit(1);

    if (error) break;
    const row = data[0];
    if (row === undefined) continue;

    return {
      recommendationId: row.id,
      categoryId: row.category_id,
      channelId: row.channel_id,
      regionId: row.region_id,
      valueAtStakeInr: row.value_at_stake_inr,
      modelVersion: row.model_version,
      match: attempt.match,
    };
  }
  return null;
}

// ---------------------------------------------------------- saved scenarios

export type SavedScenario = {
  decisionId: number;
  recommendationId: number;
  name: string;
  levers: import("./model").LeverState;
  scope: ScenarioScope;
  accountablePlanner: string;
  decidedAt: string | null;
  modelVersion: string;
  /** The whole sentence, so a reader can check the parsed levers against it. */
  note: string;
};

/**
 * Scenarios already in the ledger for THIS brand, newest first.
 *
 * RLS answers this with the caller's own session: a scenario is visible
 * exactly when the recommendation it is anchored to is visible, which is
 * the same rule that governs every other decision row. Rows whose note this
 * screen cannot parse are dropped rather than rendered with invented
 * levers -- planner_decision is open to other writers, and a SCENARIO row
 * written by something else is not a scenario this screen can re-run.
 *
 * VISIBLE IS NOT THE SAME AS RELEVANT. A group CMPO can read both pilot
 * brands, so an unfiltered status = SCENARIO read puts the other brand's
 * scenarios in this brand's comparison table, where they are re-run against
 * THIS brand's forecast and its levers are silently repriced on a book they
 * were never filed against. The brand is taken from the anchor
 * recommendation rather than from the note's own text: the note is a string
 * this screen wrote, planner_decision is open to other writers, and the
 * foreign key is the half of the row the database vouches for.
 */
export async function readSavedScenarios(
  sb: StyleverseClient,
  brandId: string,
  limit: number,
): Promise<SavedScenario[]> {
  const { data, error } = await sb
    .from("planner_decision")
    .select(
      "id, recommendation_id, override_reason, accountable_planner, decided_at, model_version, recommendation!inner(brand_id)",
    )
    .eq("status", "SCENARIO")
    .eq("recommendation.brand_id", brandId)
    .order("decided_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(Math.max(limit * 4, 12));

  if (error) return [];

  const saved: SavedScenario[] = [];
  for (const row of data) {
    const parsed = parseScenarioNote(row.override_reason);
    if (parsed === null) continue;
    saved.push({
      decisionId: row.id,
      recommendationId: row.recommendation_id,
      name: parsed.name,
      levers: parsed.levers,
      scope: parsed.scope,
      accountablePlanner: row.accountable_planner,
      decidedAt: row.decided_at,
      modelVersion: row.model_version,
      note: row.override_reason ?? "",
    });
    if (saved.length >= limit) break;
  }
  return saved;
}
