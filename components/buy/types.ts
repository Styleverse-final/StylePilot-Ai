// The shapes the buy screen passes from the server component into the
// client table.
//
// These are deliberately plain: numbers, strings and nulls only, no
// PostgrestResponse and no Supabase client. Everything crossing the
// server/client boundary in an App Router tree has to serialise, and
// keeping the boundary types flat also means the client half of this
// screen cannot reach back into the database on its own. It renders what
// the server read under RLS, and nothing else.

import type { Driver } from "@/components/DriverBars";

/** The three decisions a planner can record. Mirrors decision_status. */
export type BuyDecisionStatus = "APPROVED" | "MODIFIED" | "REJECTED";

/**
 * One row of planner_decision, with the acting planner's job title resolved
 * from dim_planner.
 *
 * planner_decision is append-only: the table has no UPDATE path and a
 * trigger enforces it. A planner who changes their mind writes a NEW row
 * and the earlier one stays exactly where it was, which is why this is a
 * list on every recommendation rather than a single current value.
 */
export type BuyDecision = {
  id: number;
  status: BuyDecisionStatus;
  /** What the model proposed, copied at decision time. */
  recommendedValue: number | null;
  /** What the planner committed to. Only a MODIFIED row carries one. */
  acceptedValue: number | null;
  reason: string | null;
  /** accountable_planner, taken from the session at write time. */
  plannerName: string;
  /** dim_planner.role, e.g. "Allocation Analyst". Null if not on record. */
  plannerRole: string | null;
  /** "human" for a planner, otherwise the agent that acted. */
  actorType: string;
  decidedAt: string | null;
  modelVersion: string;
};

/**
 * One BUY_QUANTITY recommendation, flattened out of the jsonb payload.
 *
 * Every numeric field here is a payload key written by the recommendation
 * pipeline. Nothing is recomputed in the browser: `deltaUnits` and
 * `deltaPct` are the pipeline's own arithmetic, so the number a planner
 * argues with is the number the system acted on.
 */
export type BuyRow = {
  id: number;
  categoryId: string | null;
  channelId: string | null;
  regionId: string | null;
  /** Display names from the dim tables, already resolved. */
  categoryLabel: string;
  channelLabel: string;
  /** The region CODE, which is what a planner says out loud: "IN-N". */
  regionLabel: string;
  /** The region's full name, for the expanded row where there is space. */
  regionName: string;

  /** rec_action: INCREASE_BUY, REDUCE_BUY or HOLD for this rec_type. */
  action: string | null;
  confidence: string | null;
  valueAtStakeInr: number | null;
  rationale: string;
  drivers: Driver[];
  /** Attribution method recorded on the drivers, e.g. "tree_shap_exact". */
  driverMethod: string | null;
  modelVersion: string;
  generatedAt: string | null;

  /** payload.ai_demand_units -- the P50 forecast over the horizon. */
  p50Units: number | null;
  /** payload.safety_units -- derived from the calibrated p10-p90 interval. */
  safetyUnits: number | null;
  /** payload.recommended_buy_units -- P50 plus safety stock. */
  recommendedUnits: number | null;
  /** payload.manual_units -- the plan the buy is being compared against. */
  manualUnits: number | null;
  deltaUnits: number | null;
  /** A fraction, not a percentage. 0.3212 is 32.1% above the manual plan. */
  deltaPct: number | null;
  /** payload.weeks -- the horizon the buy covers. */
  horizonWeeks: number | null;
  serviceTier: string | null;

  /** Every decision ever recorded against this row, oldest first. */
  decisions: BuyDecision[];
};

/** Series identity as one line: category, channel, region. */
export function seriesParts(row: BuyRow): readonly string[] {
  return [row.categoryLabel, row.channelLabel, row.regionLabel];
}

/** The most recent decision, or null while the recommendation is open. */
export function latestDecision(row: BuyRow): BuyDecision | null {
  return row.decisions.length === 0
    ? null
    : row.decisions[row.decisions.length - 1];
}

/** A hold that nobody has decided yet: the bulk-approve candidates. */
export function isOpenHold(row: BuyRow): boolean {
  return row.action === "HOLD" && row.decisions.length === 0;
}
