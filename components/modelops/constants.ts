// The ONLY figures on /model-ops that no query produces.
//
// Everything else on the screen -- every accuracy, every benchmark, every
// coverage figure, every threshold, every escalation count -- is read from
// Postgres at request time under the signed-in planner's row level security.
// The handful that are not are declared in UNTABLED at the foot of this file,
// so the list on the screen is generated from here rather than written by
// hand and the count in the sentence is the length of the array. If a
// sentence claims to be exhaustive it has to be enforced by something, and
// UNTABLED below is that something: the provenance panel maps over it and
// counts it, so an addition here appears on screen and a removal disappears
// from it. A false claim about provenance is worse than missing provenance,
// because it stops the reader checking.
//
// If a table ever carries one of these, delete the entry and read the row.

/**
 * The drift escalation rule the forecast agent actually ran.
 *
 * These are code constants in styleverse/sv/agents/forecast_agent.py, not
 * rows. The COUNTS the drift monitor renders (series examined, series
 * escalated) come from agent_run; only the rule's own numbers live here.
 *
 * k=3 was DERIVED, not chosen. FINAL_SPEC Part 3 asks for "two weeks
 * running". Measured against this data a single week's 1-WAPE has a
 * standard deviation of 12-14 accuracy points, so roughly 27% of individual
 * weeks fall more than 5 points below baseline by chance alone. At that
 * rate, k=2 breaches land consecutively by variance alone in 0.27^2 of
 * series and k=3 in 0.27^3 -- the smallest k at which an alert is more
 * likely to be real degradation than noise. The screen computes those two
 * probabilities from `perWeekBreachRate` rather than restating them.
 */
export const DRIFT_RULE = {
  /** Length of the scoring window, in weeks. Fits inside the 12-week horizon. */
  rollingWeeks: 8,
  /** Weeks of history required before a baseline is credible. */
  baselineMinWeeks: 4,
  /** Drift threshold, in accuracy points (1-WAPE x 100). */
  dropPoints: 5,
  /** Consecutive breaching weeks required before the agent escalates. */
  consecutiveWeeks: 3,
  /**
   * What FINAL_SPEC Part 3 asked for, and what the stored autonomy_band
   * clause still says. Carried here rather than typed into the prose so the
   * provenance list below can claim to be exhaustive and be right: the
   * screen compares this with `consecutiveWeeks`, so both halves of that
   * comparison are declared.
   */
  specConsecutiveWeeks: 2,
  /** Measured SD of a single week's 1-WAPE, in accuracy points. */
  weeklySdPointsLow: 12,
  weeklySdPointsHigh: 14,
  /** Share of individual weeks that breach by chance alone. */
  perWeekBreachRate: 0.27,
  source: "styleverse/sv/agents/forecast_agent.py",
} as const;

/**
 * Quantile crossing BEFORE the interval models were blended the same way as
 * the point forecast.
 *
 * A level-only interval drawn around a blended p50 is two estimators
 * pretending to be one, and the p50 lands outside its own band constantly.
 * That rate was measured at 23% and recorded in a comment in
 * styleverse/sv/pipeline.py; nothing wrote it to a table. The figure AFTER
 * the change is in the registry as metrics.quantile_crossing_pct_backtest
 * and is read from there.
 */
export const CROSSING_BEFORE_BLEND_PCT = 23;
export const CROSSING_BEFORE_SOURCE = "styleverse/sv/pipeline.py";

/** One phase of the six-month build, as written in the design specification. */
export type RoadmapPhase = {
  period: string;
  title: string;
  detail: string;
};

/**
 * The six-month build, transcribed from the design specification.
 *
 * PROVENANCE NOTE, and it is a correction to the brief: this roadmap is NOT
 * in styleverse/FINAL_SPEC.md. That document runs from "Why this is an AI
 * system" to "What to say under questioning" and contains no delivery plan
 * and no programme budget. The plan below, and the two rupee figures beside
 * it, are in styleverse/production.html -- the visual specification -- and
 * they are rendered here exactly as that file states them.
 *
 * The whole panel is a PLAN. No table in the pilot schema holds a delivery
 * date, a wave size or a programme budget, so nothing in it is measured and
 * the screen says so above it.
 */
export const ROADMAP: readonly RoadmapPhase[] = [
  {
    period: "Month 1",
    title: "Foundation",
    detail:
      "Feature store, censored-demand recovery, data quality gates. Ensemble forecast and quantiles into production for two pilot brands.",
  },
  {
    period: "Month 2",
    title: "Pilot live",
    detail:
      "Workbench, exceptions, buy plan and governance with 60 planners in wave 1. Recommend-only -- no agent autonomy yet.",
  },
  {
    period: "Month 3",
    title: "Decision layer",
    detail:
      "Allocation optimiser with store clustering, markdown timing, scenario engine. Wave 2 onboarded, 190 planners.",
  },
  {
    period: "Month 4",
    title: "Cold start",
    detail:
      "Attribute and image-embedding analogue model, test-and-repeat workflow, size curve optimisation.",
  },
  {
    period: "Month 5",
    title: "Agents",
    detail:
      "Forecast, exception and allocation agents enabled inside narrow bands. Learning loop and override classifier live.",
  },
  {
    period: "Month 6",
    title: "Scale",
    detail:
      "Hierarchical reconciliation across all five brands, demand sensing at store grain, autonomy bands widened on measured override rates.",
  },
];

/**
 * The programme framing that sits on the roadmap card, verbatim.
 *
 * The rupee sign is built from its code point rather than typed, matching
 * components/dashboard/format.ts, so the string survives any toolchain that
 * is careless about source encoding.
 */
const RUPEE = String.fromCharCode(0x20b9);
export const PROGRAMME_TAG = `${RUPEE}34 Cr of the ${RUPEE}200 Cr programme`;
export const ROADMAP_SOURCE = "styleverse/production.html";

/** One figure on this screen that no query produces. */
export type UntabledFigure = {
  id: string;
  /** What it is, in a planner's words. */
  label: string;
  /** The figure itself, or a description of the group of figures. */
  value: string;
  /** The file it actually lives in. */
  source: string;
  /** Why there is no row, and what IS read from a row instead. */
  why: string;
};

/**
 * The exhaustive list. The provenance panel counts this array, so the
 * sentence "these N are all of them" cannot go stale.
 */
export const UNTABLED: readonly UntabledFigure[] = [
  {
    id: "roadmap",
    label: "The six-month build panel, in full",
    value: `Every phase description, both wave sizes, and ${PROGRAMME_TAG}`,
    source: ROADMAP_SOURCE,
    why:
      "It is a plan, not a measurement. The pilot schema has no table for a delivery date, a wave size or a programme budget, so there is nothing to read. It is transcribed from the visual specification rather than paraphrased, and it is the last card on the screen so no measured figure sits downstream of it. It is not in FINAL_SPEC.md; that document carries no roadmap at all.",
  },
  {
    id: "drift-rule",
    label: "The drift escalation rule's own numbers",
    value: `${DRIFT_RULE.dropPoints} accuracy points, a ${DRIFT_RULE.rollingWeeks}-week rolling window, a ${DRIFT_RULE.baselineMinWeeks}-week minimum baseline, k=${DRIFT_RULE.consecutiveWeeks}, the ${DRIFT_RULE.weeklySdPointsLow}-${DRIFT_RULE.weeklySdPointsHigh} point weekly standard deviation and the ${Math.round(
      DRIFT_RULE.perWeekBreachRate * 100,
    )}% per-week noise rate k was derived from, and the k=${DRIFT_RULE.specConsecutiveWeeks} the specification originally asked for`,
    source: DRIFT_RULE.source,
    why:
      "The rule is code the agent runs, not a policy_parameter row. What the rule PRODUCED -- series examined, series escalated, which brand, when -- is read from agent_run and is not affected by this. The stored autonomy_band clause still quotes the specification's k and is rendered from the row, so the disagreement between the written band and the running code is visible rather than reconciled here.",
  },
  {
    id: "crossing-before",
    label: "Quantile crossing before the interval models were blended",
    value: `${CROSSING_BEFORE_BLEND_PCT}% of rows`,
    source: CROSSING_BEFORE_SOURCE,
    why:
      "Measured once during development and recorded in a comment; no run wrote it to a table. The rate AFTER the change is in model_registry.metrics.quantile_crossing_pct_backtest and is read from there, so only the before half of that comparison is untabled.",
  },
];
