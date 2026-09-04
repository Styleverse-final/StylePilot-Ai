// Scenario arithmetic. Pure functions, no React, no database, no network.
//
// WHY THIS FILE IS DELIBERATELY BORING
// ------------------------------------
// The model is scored offline in batch and the answer is sitting in the
// `forecast` table. A scenario does not re-score anything: it takes the
// stored p50 / p90 / avg_selling_price_inr rows and applies a fitted
// elasticity to them. There is no /predict call here and there is nowhere
// one could be added, because nothing in this module can reach the network.
//
// The curve is the one Part D fitted and Part E's markdown timing inverts:
//
//     log(uplift) = intercept + coefficient * log(1 - depth)
//
// so uplift(f) = exp(intercept) * f ** coefficient, where f is the realised
// price as a fraction of list. Every lever on this screen moves a plan that
// is ALREADY trading at some price, so what is wanted is the RATIO between
// two points on that curve:
//
//     uplift(f1) / uplift(f0) = (f1 / f0) ** coefficient
//
// and the intercept cancels exactly -- the same cancellation sv/markdown.py
// relies on when it writes the clearing depth in one line. That is why the
// sliders are expressed as a CHANGE against the plan's own price point
// rather than as an absolute depth: an absolute depth would need the
// forecast's own current depth, which the forecast rows do not carry, and
// inventing one would put a number on screen that no table can defend.
//
// The intercept is still read and still shown, because a reader checking
// the arithmetic needs to see the whole fitted row rather than the half of
// it that survived the algebra.

// ---------------------------------------------------------------- constants
//
// Three numbers below are NOT measurements. They are named, commented and
// restated on screen wherever they can change a figure, because the rule on
// this project is that a constant nobody can trace is worse than a query
// nobody ran.

/**
 * CASE PREMISE, NOT A MEASUREMENT.
 *
 * The clamp `sv/elasticity.DEPTH_MAX` puts on any depth it solves: 0.80.
 * The curve was fitted over the promotions the pilot brands actually ran,
 * and 0.80 already sits outside that support, so it is a hard stop rather
 * than a working value. The promotion-depth slider ends here for the same
 * reason the pipeline clamps there, and the screen says so.
 */
export const CURVE_DEPTH_CEILING = 0.8;

/**
 * CASE PREMISE, NOT A MEASUREMENT.
 *
 * The marketing index has no fitted coefficient anywhere in this dataset.
 * `fact_demand_weekly` carries no marketing spend column, and the feature
 * list on both planning-grain registry rows contains price, promotion,
 * search, social, competitor and weather terms but no marketing term -- the
 * screen reads that list and says so rather than asserting it.
 *
 * So this lever is an ASSUMPTION the planner is testing, and the assumption
 * is one-for-one: an index of 1.10 is a 10% demand lift. Pass-through lives
 * here as a single named number so that the day a marketing response is
 * measured, exactly one line changes.
 */
export const MARKETING_PASS_THROUGH = 1;

/**
 * UI BOUNDS, NOT MEASURED LIMITS. The ends of the sliders. Nothing in the
 * data says a price cannot move 25%; these are the range a planner can
 * explore without leaving the screen, and the price lever warns separately
 * once it is read outside the discount range the curve was fitted on.
 */
export const LEVER_BOUNDS = {
  priceChange: { min: -0.2, max: 0.2, step: 0.005 },
  promoDepth: { min: 0, max: CURVE_DEPTH_CEILING, step: 0.01 },
  marketingIndex: { min: 0.8, max: 1.3, step: 0.01 },
  capacityShare: { min: 0.6, max: 1.2, step: 0.01 },
} as const;

// -------------------------------------------------------------------- types

/** One fitted row of `elasticity`, exactly as stored. */
export type ElasticityFit = {
  categoryId: string;
  coefficient: number;
  intercept: number;
  /** The category's OWN r-squared, kept even where the pooled fit shipped. */
  rSquared: number | null;
  nObservations: number | null;
  /** True where the category borrows the pooled coefficient. Never hidden. */
  isPooledFallback: boolean;
  fittedAt: string | null;
};

/**
 * One category's slice of the stored forecast, summed over the horizon and
 * over every series in the selection the session can read.
 *
 * Summing is exact rather than convenient: the demand multiplier is constant
 * within a category (elasticity is fitted per category), so a per-category
 * total and a per-row walk give the identical answer for every figure this
 * screen renders. The capacity cap is the one lever that is not linear, and
 * it is applied pro rata to the whole plan, which is also exact at this
 * grain.
 */
export type CategoryBase = {
  categoryId: string;
  categoryName: string;
  /** Sum of forecast_units (p50) over the horizon. */
  demandUnits: number;
  /** Sum of (p90 - p50). The calibrated upper tail, in units. */
  spreadUnits: number;
  /** Demand-weighted avg_selling_price_inr: sum(p50 * asp) / sum(p50). */
  aspInr: number;
  /** forecast rows behind these sums. */
  rowCount: number;
  /** Distinct (channel, region) series behind these sums. */
  seriesCount: number;
  /** The fitted row, or null where the category has no elasticity row. */
  fit: ElasticityFit | null;
};

/**
 * Every threshold and rate the scenario arithmetic multiplies by. Each one
 * is read from a table at request time; none is written in this file.
 */
export type PlanEconomics = {
  /** policy_parameter safety_spread_factor, applied_value. */
  spreadFactor: number;
  /** policy_parameter safety_aggregation_factor, applied_value. */
  aggregationFactor: number;
  /** dim_brand.gross_margin for the brand in scope. */
  grossMargin: number;
  /** INR given away per unit cleared. Derived; see readPlanEconomics. */
  clearanceCostPerUnitInr: number;
  /** INR per unit-week, parsed out of policy_parameter.override_reason. */
  holdingCostPerUnitWeekInr: number;
  /** max(horizon_week) across the forecast rows actually read. */
  horizonWeeks: number;
};

export type LeverState = {
  /** Change in realised price against the plan's own point, as a fraction. */
  priceChange: number;
  /** Incremental promotion depth on top of the plan, as a fraction. */
  promoDepth: number;
  /** Marketing index. 1.00 is the plan as forecast. */
  marketingIndex: number;
  /** Ceiling on plan units, as a share of the base plan. null = no cap. */
  capacityShare: number | null;
};

/** All four levers neutral: the plan exactly as the forecast rows state it. */
export const BASE_LEVERS: LeverState = {
  priceChange: 0,
  promoDepth: 0,
  marketingIndex: 1,
  capacityShare: null,
};

export type ScenarioRow = {
  categoryId: string;
  categoryName: string;
  /** Demand multiplier applied to this category's stored forecast. */
  multiplier: number;
  /** True where that multiplier used a borrowed, pooled coefficient. */
  pooledFallback: boolean;
  /** True where no elasticity row exists, so the price levers did nothing. */
  unfitted: boolean;
  demandUnits: number;
  planUnits: number;
  soldUnits: number;
  leftoverUnits: number;
  lostUnitsAtP90: number;
  revenueInr: number;
  markdownExposureInr: number;
  lostSalesInr: number;
  grossMarginInr: number;
};

export type ScenarioResult = {
  levers: LeverState;
  rows: ScenarioRow[];
  demandUnits: number;
  /** The units the plan commits to buying. THE column this screen exists for. */
  planUnits: number;
  soldUnits: number;
  leftoverUnits: number;
  lostUnitsAtP90: number;
  revenueInr: number;
  markdownExposureInr: number;
  lostSalesInr: number;
  grossMarginInr: number;
  /**
   * Realised price as a fraction of the plan's own price point, AS PRICED.
   * Demand, revenue, markdown and lost sales all use this one number.
   */
  priceFraction: number;
  /** What the levers asked for, before the fitted-curve floor was applied. */
  requestedPriceFraction: number;
  /** True when the floor bit, so the run was priced above what was asked. */
  priceFractionClamped: boolean;
  /** Cap in units, or null when the capacity lever is off. */
  capacityUnits: number | null;
  /** True when the cap actually cut the plan rather than sitting above it. */
  capacityBinds: boolean;
  /** Share of the uncapped plan that survived the cap. 1 when unbound. */
  capacityFactor: number;
  /** Categories in this run that shipped the pooled coefficient. */
  pooledCategories: string[];
  /**
   * True only where that borrowed coefficient CHANGED a number in this run.
   * At the plan's own price point the ratio is 1 ** coefficient = 1, so the
   * pooled fit is present but inert, and marking the row would claim an
   * influence the arithmetic did not have.
   */
  pooledCoefficientApplied: boolean;
  /** Categories with no fitted row at all, where the price levers are inert. */
  unfittedCategories: string[];
  /** Share of plan units sitting in pooled-coefficient categories. */
  pooledUnitShare: number;
};

/** Base plan and scenario, with the consequence the case actually constrains. */
export type ScenarioComparison = {
  unitChange: number;
  unitChangePct: number | null;
  /** unitChange x INR per unit-week x horizon weeks. Signed. */
  holdingCostChangeInr: number;
  marginChangeInr: number;
  marginChangePct: number | null;
  lostSalesChangeInr: number;
  markdownChangeInr: number;
};

// --------------------------------------------------------------- arithmetic

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return value < low ? low : value > high ? high : value;
}

/**
 * Realised price as a fraction of the plan's own price point.
 *
 * A price change and a promotion depth are the same lever seen twice: both
 * move what the customer pays. They compose multiplicatively because the
 * promotion is quoted off the (possibly changed) list price.
 */
export function priceFraction(levers: LeverState): number {
  return (1 + levers.priceChange) * (1 - levers.promoDepth);
}

/** The floor the curve stops being solved at: 1 - CURVE_DEPTH_CEILING. */
export const PRICE_FRACTION_FLOOR = 1 - CURVE_DEPTH_CEILING;
/** The top of the price slider's own range. */
export const PRICE_FRACTION_CEILING = 1 + LEVER_BOUNDS.priceChange.max;

/**
 * THE realised price fraction. The one number the whole scenario is priced at.
 *
 * priceFraction() is what the levers ASK for; this is what the arithmetic may
 * actually use. `sv/elasticity.DEPTH_MAX` stops solving the curve at a depth
 * of CURVE_DEPTH_CEILING, so below f = 1 - CURVE_DEPTH_CEILING there is no
 * fitted curve left to read and the pipeline's own clamp applies.
 *
 * THE CLAMP LIVES HERE AND NOWHERE ELSE, and every consumer -- the demand
 * multiplier, revenue, markdown exposure, lost sales and the ledger sentence
 * -- reads this one value. It used to be applied inside demandMultiplier()
 * only, so past an 80% combined cut a scenario moved its units on one price
 * and billed them at another. Two copies of the arithmetic is how that
 * happened, so there is now exactly one.
 *
 * A run that lands on the clamp is NOT silently repriced: runScenario reports
 * `priceFractionClamped` and the screen says which price it actually used.
 */
export function realisedPriceFraction(levers: LeverState): number {
  return clamp(
    priceFraction(levers),
    PRICE_FRACTION_FLOOR,
    PRICE_FRACTION_CEILING,
  );
}

/** True when the clamp above moved the fraction the levers asked for. */
export function isPriceFractionClamped(levers: LeverState): boolean {
  return (
    Math.abs(realisedPriceFraction(levers) - priceFraction(levers)) > 1e-9
  );
}

/**
 * True when the levers put the realised price above the plan's own point.
 *
 * The curve was fitted on DISCOUNTS. Reading it above f = 1 is asking what a
 * promotion of negative depth would do, which is outside the fit's support,
 * and the screen says so instead of quietly returning a number. It reads the
 * realised fraction rather than the price lever's sign, because a price rise
 * under a promotion is not an extrapolation and a promotion of zero under a
 * price rise is.
 */
export function isExtrapolatingUpward(levers: LeverState): boolean {
  return realisedPriceFraction(levers) > 1;
}

/**
 * The demand multiplier for one category.
 *
 * (f1 / f0) ** coefficient with f0 = 1, because the sliders are already
 * expressed against the plan's own price point. The intercept cancels; the
 * coefficient is the whole of the price response. Marketing multiplies on
 * top and is an assumption, not a fit -- see MARKETING_PASS_THROUGH.
 */
export function demandMultiplier(
  fit: ElasticityFit | null,
  levers: LeverState,
): number {
  const marketing = 1 + (levers.marketingIndex - 1) * MARKETING_PASS_THROUGH;
  if (fit === null || !Number.isFinite(fit.coefficient)) return marketing;

  // The SAME fraction revenue and markdown are priced at. The clamp is
  // applied once, in realisedPriceFraction, and read here rather than
  // repeated.
  const fraction = realisedPriceFraction(levers);
  if (fraction <= 0) return 0;
  return Math.pow(fraction, fit.coefficient) * marketing;
}

/**
 * Units the plan commits to for one category, before any capacity cap.
 *
 *     plan = demand + spreadFactor x aggregationFactor x (p90 - p50)
 *
 * This is not a new rule invented for the scenario screen. It is the buy
 * plan's own arithmetic: recommendation.payload carries
 * recommended_buy_units = ai_demand_units + safety_units, and safety_units
 * reproduces to the unit as sum(p90 - p50) x safety_spread_factor x
 * safety_aggregation_factor, both read from policy_parameter. Running the
 * base plan through this function therefore returns the quantity the buy
 * screen is already committing, which is what makes the comparison mean
 * anything.
 */
function planUnitsFor(
  base: CategoryBase,
  economics: PlanEconomics,
  multiplier: number,
): number {
  const safety =
    base.spreadUnits * economics.spreadFactor * economics.aggregationFactor;
  return multiplier * (base.demandUnits + safety);
}

/**
 * One scenario, priced.
 *
 * `capacityBaselineUnits` is the base plan's own unit total, because the
 * capacity slider is expressed as a share of the plan a planner already
 * knows rather than as an absolute number they would have to look up.
 */
export function runScenario(
  bases: readonly CategoryBase[],
  economics: PlanEconomics,
  levers: LeverState,
  capacityBaselineUnits: number,
): ScenarioResult {
  // ONE realised price fraction, clamped once, used by demand, revenue,
  // markdown and lost sales alike. demandMultiplier() reads the same
  // function, so the two halves of the arithmetic cannot disagree.
  const fraction = realisedPriceFraction(levers);
  const requested = priceFraction(levers);

  const multipliers = bases.map((base) => demandMultiplier(base.fit, levers));
  const uncapped = bases.map((base, index) =>
    planUnitsFor(base, economics, multipliers[index] ?? 1),
  );
  const uncappedTotal = uncapped.reduce((sum, value) => sum + value, 0);

  const capacityUnits =
    levers.capacityShare === null
      ? null
      : levers.capacityShare * capacityBaselineUnits;

  // Pro rata across the whole plan. A cap is a constraint on what can be
  // made, not a preference about which category loses, so nothing here
  // decides an allocation -- that is the allocation screen's job.
  const capacityFactor =
    capacityUnits === null || uncappedTotal <= 0
      ? 1
      : Math.min(1, capacityUnits / uncappedTotal);

  const rows: ScenarioRow[] = bases.map((base, index) => {
    const multiplier = multipliers[index] ?? 1;
    const demandUnits = multiplier * base.demandUnits;
    const planUnits = (uncapped[index] ?? 0) * capacityFactor;
    const soldUnits = Math.min(demandUnits, planUnits);
    const leftoverUnits = Math.max(planUnits - demandUnits, 0);

    // The plan does not buy to p90; it buys to the applied service level.
    // What it cannot serve if demand lands at the top of the calibrated
    // interval is a real exposure, and it is the number the safety factors
    // are trading against.
    const upsideUnits = multiplier * (base.demandUnits + base.spreadUnits);
    const lostUnitsAtP90 = Math.max(upsideUnits - planUnits, 0);

    const price = base.aspInr * fraction;
    const revenueInr = soldUnits * price;
    // A stranded unit gives away a share of the price it was going to
    // fetch, so cutting the price cuts the give-away with it.
    const markdownExposureInr =
      leftoverUnits * economics.clearanceCostPerUnitInr * fraction;
    const lostSalesInr = lostUnitsAtP90 * price;

    return {
      categoryId: base.categoryId,
      categoryName: base.categoryName,
      multiplier,
      pooledFallback: base.fit?.isPooledFallback ?? false,
      unfitted: base.fit === null,
      demandUnits,
      planUnits,
      soldUnits,
      leftoverUnits,
      lostUnitsAtP90,
      revenueInr,
      markdownExposureInr,
      lostSalesInr,
      grossMarginInr: revenueInr * economics.grossMargin - markdownExposureInr,
    };
  });

  const total = <K extends keyof ScenarioRow>(key: K): number =>
    rows.reduce((sum, row) => sum + (row[key] as number), 0);

  const planUnits = total("planUnits");
  const pooledUnits = rows
    .filter((row) => row.pooledFallback)
    .reduce((sum, row) => sum + row.planUnits, 0);

  return {
    levers,
    rows,
    demandUnits: total("demandUnits"),
    planUnits,
    soldUnits: total("soldUnits"),
    leftoverUnits: total("leftoverUnits"),
    lostUnitsAtP90: total("lostUnitsAtP90"),
    revenueInr: total("revenueInr"),
    markdownExposureInr: total("markdownExposureInr"),
    lostSalesInr: total("lostSalesInr"),
    grossMarginInr: total("grossMarginInr"),
    priceFraction: fraction,
    requestedPriceFraction: requested,
    priceFractionClamped: Math.abs(fraction - requested) > 1e-9,
    capacityUnits,
    capacityBinds: capacityFactor < 1 - 1e-9,
    capacityFactor,
    pooledCategories: rows.filter((r) => r.pooledFallback).map((r) => r.categoryId),
    pooledCoefficientApplied:
      Math.abs(fraction - 1) > 1e-12 && rows.some((r) => r.pooledFallback),
    unfittedCategories: rows.filter((r) => r.unfitted).map((r) => r.categoryId),
    pooledUnitShare: planUnits > 0 ? pooledUnits / planUnits : 0,
  };
}

/**
 * Base against scenario, with the unit consequence attached to the margin.
 *
 * holdingCostChangeInr is signed and is computed exactly the way
 * sv/value.py computes it for the business case: unit delta x INR per
 * unit-week x the horizon the plan covers. A scenario that buys fewer units
 * returns a negative number, which is a saving.
 */
export function compare(
  base: ScenarioResult,
  scenario: ScenarioResult,
  economics: PlanEconomics,
): ScenarioComparison {
  const unitChange = scenario.planUnits - base.planUnits;
  return {
    unitChange,
    unitChangePct: base.planUnits > 0 ? unitChange / base.planUnits : null,
    holdingCostChangeInr:
      unitChange * economics.holdingCostPerUnitWeekInr * economics.horizonWeeks,
    marginChangeInr: scenario.grossMarginInr - base.grossMarginInr,
    marginChangePct:
      base.grossMarginInr !== 0
        ? (scenario.grossMarginInr - base.grossMarginInr) /
          Math.abs(base.grossMarginInr)
        : null,
    lostSalesChangeInr: scenario.lostSalesInr - base.lostSalesInr,
    markdownChangeInr: scenario.markdownExposureInr - base.markdownExposureInr,
  };
}

/** True when the levers are all at their neutral setting. */
export function isBaseLevers(levers: LeverState): boolean {
  return (
    levers.priceChange === 0 &&
    levers.promoDepth === 0 &&
    levers.marketingIndex === 1 &&
    levers.capacityShare === null
  );
}
