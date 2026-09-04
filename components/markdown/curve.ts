// The depth curve, ported line for line from the batch scorer.
//
// NOTHING HERE IS A MODEL CALL. The elasticity was fitted offline and its
// coefficient and intercept are rows in `elasticity`; the recommendations
// were scored offline and are rows in `markdown_recommendation`. This module
// only redraws, between the two dates the pipeline evaluated, the identity
// the pipeline already evaluated at those dates. Every input is a stored
// number.
//
// THE IDENTITY (sv/markdown.py, module docstring)
// -----------------------------------------------
// A style holding `cover` weeks of supply with `R` weeks of planned life
// left strands (cover - R) weeks' worth of units unless the sell rate is
// lifted. Clearing the pile needs the rate multiplied by
//
//     required_uplift(w) = (cover - w) / (R - w)
//
// after waiting w weeks -- w weeks of ordinary trading shave w weeks off
// both the pile and the runway, and because the runway is the smaller
// number the ratio gets worse. On any overstocked style (cover > R) that
// ratio rises with every week waited. That is the whole mechanism: waiting
// does not make the problem smaller, it makes the cut deeper.
//
// INVERTING THE FITTED CURVE (sv/elasticity.py)
// ---------------------------------------------
// The uplift model is log-log and was fitted, not assumed:
//
//     log(uplift) = intercept + coefficient * log(1 - depth)
//
// so depth_for_uplift(u) = 1 - exp((log u - intercept) / coefficient).
// Placing the style's own current price point on the curve first -- it is
// already selling at predicted_uplift(current_depth) times its baseline --
// and asking for `required_uplift` more collapses the intercept out
// entirely:
//
//     depth(w) = 1 - (1 - current_depth) * required_uplift(w) ** (1 / k)
//
// with k negative. The intercept cancelling is why a depth quoted here can
// never drift away from the depth the elasticity tool quotes.
//
// The pipeline clamps twice -- depth_for_uplift clamps to [0, MAX_DEPTH],
// then _clearing_depth takes min(max(depth, current_depth), MAX_DEPTH).
// Since current_depth is never negative, the composition is a single clamp
// to [current_depth, MAX_DEPTH], which is what `clearingDepth` below does.

import { DELAY_WEEKS, MAX_DEPTH, NOW_MARGIN_TRIGGER_PCT } from "./constants";

/** Below this the fit found no price response, so no depth answers the question. */
export function hasPriceResponse(coefficient: number | null): coefficient is number {
  return (
    typeof coefficient === "number" &&
    Number.isFinite(coefficient) &&
    coefficient < 0
  );
}

/**
 * Depth that multiplies the style's CURRENT sell rate by `requiredUplift`.
 *
 * Returns NaN where the fit has no price response, matching the pipeline,
 * which skips those rows rather than emitting a fabricated depth.
 */
export function clearingDepth(
  requiredUplift: number,
  currentDepth: number,
  coefficient: number,
): number {
  if (!hasPriceResponse(coefficient)) return Number.NaN;
  if (!Number.isFinite(requiredUplift) || requiredUplift <= 0) return Number.NaN;
  const raw = 1 - (1 - currentDepth) * Math.pow(requiredUplift, 1 / coefficient);
  if (!Number.isFinite(raw)) return Number.NaN;
  return Math.min(Math.max(raw, currentDepth), MAX_DEPTH);
}

/** required_uplift after waiting `weeks`, or NaN once no runway survives. */
export function requiredUplift(
  coverWeeks: number,
  remainingLifeWeeks: number,
  weeks: number,
): number {
  const runway = remainingLifeWeeks - weeks;
  const pile = coverWeeks - weeks;
  if (runway <= 0 || pile <= 0) return Number.NaN;
  return pile / runway;
}

/** depth(w): the cut that clears the pile if it is set `weeks` weeks from now. */
export function depthAfterWaiting(
  coverWeeks: number,
  remainingLifeWeeks: number,
  currentDepth: number,
  coefficient: number,
  weeks: number,
): number {
  return clearingDepth(
    requiredUplift(coverWeeks, remainingLifeWeeks, weeks),
    currentDepth,
    coefficient,
  );
}

// ------------------------------------------------ recovering today's price point

/**
 * The style's CURRENT markdown depth, recovered from its own stored row.
 *
 * markdown_recommendation does not carry the depth the style trades at
 * today -- the pipeline reads it from the weekly fact and consumes it -- so
 * it is inverted back out of the one depth that WAS stored. That is exact
 * algebra on stored numbers, not an estimate:
 *
 *     recommended_depth = 1 - (1 - d0) * ru ** (1 / k)
 *  => d0                = 1 - (1 - recommended_depth) / ru ** (1 / k)
 *
 * where ru is the required uplift at the week the depth was priced for --
 * week 0 for a NOW row, week DELAY_WEEKS for every other row, exactly as
 * the pipeline sets recommended_week.
 *
 * The inversion is only sound when neither clamp fired, so it returns null
 * unless all of these hold, and the screen then simply does not offer that
 * style as the charted one:
 *
 *   - the fit has a price response (k < 0);
 *   - the style is genuinely overstocked (cover > remaining life), so the
 *     required uplift exceeds 1 and the answer is above today's depth
 *     rather than pinned to it by the floor;
 *   - the stored depth is strictly inside (0, MAX_DEPTH), so it is neither
 *     pinned at the 80% ceiling nor sitting on the floor.
 *
 * Verified against the pipeline's own prose: SPD-ACTV-0324 inverts to 0.280
 * and its stored rationale reads "needs 62% off against 28% today".
 */
export function recoverCurrentDepth(input: {
  coverWeeks: number;
  remainingLifeWeeks: number;
  recommendedDepth: number;
  recommendedWeek: number;
  coefficient: number;
}): number | null {
  const { coverWeeks, remainingLifeWeeks, recommendedDepth, coefficient } = input;
  if (!hasPriceResponse(coefficient)) return null;
  if (coverWeeks <= remainingLifeWeeks) return null;
  const epsilon = 1e-6;
  if (recommendedDepth <= epsilon) return null;
  if (recommendedDepth >= MAX_DEPTH - epsilon) return null;

  const anchor = input.recommendedWeek > 0 ? input.recommendedWeek : 0;
  const ru = requiredUplift(coverWeeks, remainingLifeWeeks, anchor);
  if (!Number.isFinite(ru) || ru <= 1) return null;

  const factor = Math.pow(ru, 1 / coefficient);
  if (!Number.isFinite(factor) || factor <= 0) return null;

  const d0 = 1 - (1 - recommendedDepth) / factor;
  if (!Number.isFinite(d0)) return null;
  // A tiny negative is float noise on a style trading at full price.
  return Math.min(Math.max(d0, 0), recommendedDepth);
}

// --------------------------------------------------------------- the drawn curve

export type CurvePoint = {
  /** Weeks waited from today. */
  weeksWaited: number;
  /** Week of the style's own life, i.e. weeks_since_launch + weeksWaited. */
  weekOfLife: number;
  /** Weeks of planned life still left at that point. */
  remainingLife: number;
  /** Cut required to clear the projected leftover if set in that week. */
  depth: number;
  /** True once the required cut has hit the 80% policy ceiling. */
  atCeiling: boolean;
};

export type DepthCurve = {
  points: CurvePoint[];
  /** The style's depth today, recovered from its own row. */
  currentDepth: number;
  /** depth(0): the cut if it is set this week. */
  depthNow: number;
  /** depth(DELAY_WEEKS): the cut if it waits for the next review. */
  depthAtReview: number | null;
  /**
   * The first week of life at which a DELAY_WEEKS wait costs more than
   * NOW_MARGIN_TRIGGER_PCT of the leftover's list value -- which, where the
   * cut clears the pile at both dates, is exactly a gap of more than five
   * points of depth. Null when no week in the remaining window reaches it.
   */
  actHereWeekOfLife: number | null;
  /** Depth gap across the review window at week 0, in fractions. */
  gapNowToReview: number | null;
};

/**
 * Build the curve for one style, from its stored row and its category's
 * stored fit. Returns null when the style's current price point cannot be
 * recovered, because a curve drawn from a guessed anchor would be a drawing
 * rather than a derivation.
 */
export function buildDepthCurve(input: {
  coverWeeks: number;
  remainingLifeWeeks: number;
  weeksSinceLaunch: number;
  recommendedDepth: number;
  recommendedWeek: number;
  coefficient: number;
}): DepthCurve | null {
  const {
    coverWeeks,
    remainingLifeWeeks,
    weeksSinceLaunch,
    coefficient,
  } = input;

  const currentDepth = recoverCurrentDepth(input);
  if (currentDepth === null) return null;
  if (remainingLifeWeeks < 2) return null;

  const points: CurvePoint[] = [];
  for (let w = 0; w <= remainingLifeWeeks - 1; w += 1) {
    const depth = depthAfterWaiting(
      coverWeeks,
      remainingLifeWeeks,
      currentDepth,
      coefficient,
      w,
    );
    if (!Number.isFinite(depth)) continue;
    points.push({
      weeksWaited: w,
      weekOfLife: weeksSinceLaunch + w,
      remainingLife: remainingLifeWeeks - w,
      depth,
      atCeiling: depth >= MAX_DEPTH - 1e-9,
    });
  }
  if (points.length < 2) return null;

  const at = (w: number): number | null => {
    const found = points.find((p) => p.weeksWaited === w);
    return found ? found.depth : null;
  };

  const depthNow = points[0].depth;
  const depthAtReview = at(DELAY_WEEKS);

  let actHereWeekOfLife: number | null = null;
  for (const point of points) {
    const later = at(point.weeksWaited + DELAY_WEEKS);
    if (later === null) continue;
    if (later - point.depth > NOW_MARGIN_TRIGGER_PCT) {
      actHereWeekOfLife = point.weekOfLife;
      break;
    }
  }

  return {
    points,
    currentDepth,
    depthNow,
    depthAtReview,
    actHereWeekOfLife,
    gapNowToReview: depthAtReview === null ? null : depthAtReview - depthNow,
  };
}
