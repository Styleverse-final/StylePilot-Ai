// THE ONLY PLACE THE MARKDOWN SCREEN HOLDS A NUMBER THAT IS NOT A QUERY.
//
// Everything else on this screen -- every depth, every cover figure, every
// rupee, every R-squared -- is read from Supabase at request time through
// createServerAnonClient(), so RLS decides what the page contains. The
// values below are the exceptions, and they are exceptions for two
// different reasons, which is why they are split into two blocks and each
// one is labelled on screen rather than quietly consumed.
//
//   BLOCK 1 -- PIPELINE POLICY CONSTANTS. These are decision thresholds that
//   the batch scorer applies. They live in sv/markdown.py and
//   sv/elasticity.py as module constants and were never written to
//   policy_parameter, so there is no row to read them from. They are copied
//   here verbatim, with the file and the reasoning that set them, and the
//   screen says out loud that they come from the pipeline source rather than
//   from the governance table where the cover ceilings and the service level
//   live. If the pipeline changes one of them, this file is wrong until it
//   is changed too -- that is the cost of the constant, and it is stated
//   rather than hidden.
//
//   BLOCK 2 -- FIT LEDGER COUNTS. The elasticity fit publishes an audit
//   ledger (rows in, rows dropped and why, rows fitted) on the returned
//   frame's .attrs. Only the fitted side of it survives into the database:
//   elasticity.n_observations carries the per-category count, and the screen
//   SUMS THOSE FROM THE QUERY rather than repeating them here. The excluded
//   side -- how many promotions the workbook held, how many were dropped for
//   having no observed outcome yet, when they sat, and how deep the kept
//   ones actually ran -- was never shipped as a table, so ALL SIX fields of
//   the ledger below come from re-running the pipeline's own exclusion rule
//   over the source workbooks. They are measurements, but they are not
//   measurements this application can re-derive, and the panel names every
//   one of them as such rather than naming only the two counts.
//
// A number that is a premise of the case study rather than a measurement is
// marked CASE PREMISE in its own comment. There is exactly one.

/** Brands the pilot covers. Anything else has no ledger and prints nothing. */
export type LedgerBrandId = "SPD" | "ECO";

// ------------------------------------------- block 1: pipeline policy constants

/**
 * The in-season response lag being priced, in weeks.
 *
 * CASE PREMISE, not a measurement. The case describes a weekly report, then
 * a meeting, then an execution cycle; sv/markdown.py fixes that at four
 * weeks (DELAY_WEEKS) and every "cost of waiting" figure on this screen is
 * the cost of waiting exactly this long. No table measures it, and nothing
 * in the data would falsify a different choice.
 */
export const DELAY_WEEKS = 4;

/**
 * Act now when the wait costs more than this share of the leftover's value
 * at list price. sv/markdown.py NOW_MARGIN_TRIGGER_PCT.
 *
 * Where the cut clears the pile at both dates the two branches move the same
 * units, so the test reduces exactly to "waiting would cost more than five
 * points of depth" -- which is what the curve on this screen marks.
 */
export const NOW_MARGIN_TRIGGER_PCT = 0.05;

/**
 * Hard ceiling on a recommended cut. sv/markdown.py MAX_DEPTH, deliberately
 * the same 0.80 as sv/elasticity.py DEPTH_MAX so a depth quoted here is
 * never outside the range the curve was solved over. Reaching it does not
 * mean "cut 80%": it means the pile cannot be cleared at all.
 */
export const MAX_DEPTH = 0.8;

/**
 * A style enters the markdown window only once this share of its planned
 * life has elapsed. sv/markdown.py LIFE_ELAPSED_TRIGGER. Before that, cover
 * above the ceiling is a buy or allocation problem, which the Buy plan and
 * Allocation screens already own.
 */
export const LIFE_ELAPSED_TRIGGER = 0.4;

/**
 * A category keeps its own fitted coefficient only if the fit explains at
 * least this much of the variance. sv/elasticity.py MIN_R2.
 */
export const MIN_R2 = 0.3;

/**
 * ...and only if it has at least this many usable promotions.
 * sv/elasticity.py MIN_PROMOS_PER_CATEGORY.
 */
export const MIN_PROMOS_PER_CATEGORY = 30;

/** Where the two blocks above were copied from, named on screen. */
export const PIPELINE_SOURCE = "sv/markdown.py, sv/elasticity.py";

// ------------------------------------------------ block 2: the fit drop ledger

export type FitLedger = {
  /** Promotion rows in the brand's workbook before any exclusion. */
  promotionsInWorkbook: number;
  /**
   * Rows carrying status PLANNED. Every one of them sits after the end of
   * history yet still carries a populated observed_uplift_factor, so every
   * one of them was excluded: fitting on them would be the forward leakage
   * features.assert_no_leakage exists to stop.
   */
  plannedExcluded: number;
  /** Last week of observable history. Anything later cannot have an outcome. */
  lastHistoryWeek: string;
  /** ISO weeks the excluded PLANNED promotions fall in. */
  plannedWindow: string;
  /**
   * Deepest discount ever actually run, which is what makes 80% a hard stop.
   * sv/elasticity.py and sv/markdown.py both quote this figure back, so the
   * workbook reading and the pipeline source agree on it.
   */
  deepestObservedDepth: number;
  /**
   * Shallowest discount in the fitted support.
   *
   * NOT A PIPELINE FIGURE. Unlike the deepest, this appears nowhere in
   * styleverse/sv/ -- it is a min over planned_depth on the EXECUTED,
   * observable promotions in the brand's own workbook. The panel attributes
   * it to that reading rather than to PIPELINE_SOURCE.
   */
  shallowestObservedDepth: number;
};

/**
 * The exclusion ledger, per brand.
 *
 * Reproduced by applying sv/elasticity.py `_fittable` to the two pilot
 * workbooks: drop CANCELLED (neither brand has any), then drop every row
 * whose status is not EXECUTED or whose week falls after the last week of
 * history. For both brands the two tests select the same rows, so the
 * excluded set is exactly the PLANNED set and nothing else was dropped --
 * no null uplift, no unusable depth.
 *
 * NOTE ON A BRIEFED FIGURE. The build brief for this screen stated "134 of
 * 141 PLANNED promotions were excluded". The source does not say that. 134
 * and 141 are the PLANNED counts of two DIFFERENT brands, and in both cases
 * the exclusion is total: 134 of 134 for SpeedStyle, 141 of 141 for
 * EcoWeave. The screen renders what the source says.
 */
export const FIT_LEDGER: Record<LedgerBrandId, FitLedger> = {
  SPD: {
    promotionsInWorkbook: 506,
    plannedExcluded: 134,
    lastHistoryWeek: "2026-W35",
    plannedWindow: "2026-W40 to 2027-W04",
    deepestObservedDepth: 0.627,
    shallowestObservedDepth: 0.1,
  },
  ECO: {
    promotionsInWorkbook: 516,
    plannedExcluded: 141,
    lastHistoryWeek: "2026-W35",
    plannedWindow: "2026-W40 to 2027-W04",
    deepestObservedDepth: 0.469,
    shallowestObservedDepth: 0.07,
  },
};

export function fitLedgerFor(brandId: string): FitLedger | null {
  return brandId === "SPD" || brandId === "ECO" ? FIT_LEDGER[brandId] : null;
}
