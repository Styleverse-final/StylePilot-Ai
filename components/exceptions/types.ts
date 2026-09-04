import type { CommittedDecisionStatus, RecAction } from "@/lib/queries";

/**
 * The shapes the exception screen passes from the server page into the
 * client queue.
 *
 * Everything here is already resolved: the page reads the recommendation,
 * its payload, the policy threshold that applies to it and the decision
 * recorded against it, and hands down flat values. The client components
 * therefore decide nothing -- they lay out numbers that were computed on the
 * server from the database. No component below this file ever looks up a
 * threshold, converts a rate, or invents a figure.
 *
 * The types are erased at build time (`import type` only), so importing them
 * into a "use client" module pulls no server code into the browser bundle.
 */

export type SeverityLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * The threshold the exception was raised against: a ceiling for an
 * overstock, a floor for a stockout. `basis` is the derivation string stored
 * beside the number in policy_parameter -- it is carried down so the row can
 * show where the threshold came from without the reader leaving the screen.
 */
export type ThresholdView = {
  /** e.g. "CATEGORY CEILING" or "STOCKOUT FLOOR". */
  label: string;
  weeks: number | null;
  basis: string | null;
};

/** One row of the exception queue. */
export type ExceptionView = {
  /**
   * recommendation.id. Null only if the view ever yields a row without an
   * identity, in which case no decision can be attached to it and the row
   * says so rather than offering buttons that cannot work.
   */
  id: number | null;
  action: RecAction;
  /** "Stockout risk" / "Overstock risk", spelled for display. */
  actionLabel: string;
  isStockout: boolean;
  severity: SeverityLevel | null;
  /** Display names, resolved from the dim tables; falls back to the id. */
  category: string;
  channel: string;
  region: string;
  valueAtStakeInr: number | null;
  /** payload.projected_wos, as recommend.py wrote it. */
  projectedWos: number | null;
  /** payload.units_at_risk, as recommend.py wrote it. */
  unitsAtRisk: number | null;
  threshold: ThresholdView | null;
  /** recommendation.rationale, verbatim. Never rewritten in the UI. */
  rationale: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
  confidence: string | null;

  /** Current state, from v_recommendation_state. Null while still open. */
  // v_recommendation_state excludes SCENARIO, so a row here is
  // either undecided or committed -- never an exploration.
  status: CommittedDecisionStatus | null;
  decidedAt: string | null;
  accountablePlanner: string | null;
  acceptedValue: number | null;
  overrideReason: string | null;
};

/**
 * One category's cover ceiling, with the derivation and the alternative that
 * was considered and discarded. Both strings are read from policy_parameter
 * and rendered verbatim.
 */
export type CeilingView = {
  categoryId: string;
  categoryName: string;
  ceilingWeeks: number | null;
  floorWeeks: number | null;
  /** policy_parameter.basis -- how the ceiling was derived. */
  basis: string;
  /** policy_parameter.override_reason -- the holding-cost route, discarded. */
  discardedAlternative: string | null;
};
