// EVERY FIGURE ON /adoption THAT HAS NO TABLE BEHIND IT. THERE ARE TWO.
//
// The rest of the screen is read from Postgres at request time under the
// signed-in planner's row level security: the four readiness segments and
// their scores from planner_adoption, the before-state of the week from
// v_time_reallocation, the realised automation rate from v_touchless_rate,
// the trust curve from learning_completion joined to dim_planner, the
// override counts from planner_decision, the model identity and accuracy
// from model_registry. None of that is in this file, and nothing in this
// file is read from anywhere.
//
// These two are different. They are premises of the case study. They are
// declared here, once, with their source named, and every place they reach
// the screen carries a "case premise" mark so a reader can tell in one look
// which numbers they could go and check and which they cannot.
//
// If a table ever carries either of them, delete the constant and read the
// row. That is the whole reason they are boxed up here rather than typed
// into a component.

// -------------------------------------------------------------- premise 1
//
// AUTOMATABLE SHARE PER ACTIVITY.
//
// The share of each activity that an agent could execute without a human.
// FINAL_SPEC.md publishes the reallocation formula --
//
//     time_after = time_before x (1 - automatable_share x realised_automation)
//
// -- and says automatable_share "comes from the Round 1 task audit". That
// audit is a workshop output. It is not in this schema: there is no task
// table, no activity dimension, and policy_parameter carries thresholds for
// the recommendation system only, nothing about how a week is spent. So the
// shares below are the case's, not a measurement, and the screen prints
// every one of them in the reallocation table beside the arithmetic they
// drive rather than hiding them inside it.
//
// The ordering is defensible and worth stating: reporting is the most
// automatable activity in a planning team because assembling a number is
// mechanical once the number exists; forecast preparation is next because
// the statistical work is exactly what was batch-scored; allocation is
// bounded by the autonomy band, which sends anything over the derived
// threshold to a human; assortment, meetings and commercial strategy are
// judgement, and the small shares there are administration around the
// judgement rather than the judgement itself.
//
// The key is the v_time_reallocation column the share applies to, so a
// share cannot drift away from the activity it belongs to.
export const AUTOMATABLE_SHARE = {
  pct_reporting: 0.8,
  pct_demand_forecasting: 0.65,
  pct_allocation: 0.55,
  pct_assortment: 0.3,
  pct_commercial_strategy: 0.1,
  pct_meetings: 0.05,
} as const;

export type ActivityKey = keyof typeof AUTOMATABLE_SHARE;

/** Rendered wherever a share appears, so it is never mistaken for a reading. */
export const AUTOMATABLE_SHARE_SOURCE =
  "case premise -- Round 1 task audit, no table in this schema";

// -------------------------------------------------------------- premise 2
//
// THE REDEPLOYMENT LEDGER.
//
// FINAL_SPEC.md commits to "Redeployment ledger, 146 FTE, zero cuts" and
// lists "146 FTE-equivalent of spreadsheet work" under its MEASURED
// heading. It is not measured here. No table in this schema yields it:
// there is no redeployment table, no FTE column, and nothing that records a
// destination for freed capacity. The four from-to pairs and their splits
// come from the visual specification (styleverse/production.html), which is
// a design artefact, not a data source.
//
// It is on the screen because the zero-layoff commitment is the point of
// the whole programme and a commitment with no named destination is a
// slogan. It is labelled a premise because the alternative -- printing 146
// in the same weight as a figure a reader could go and verify -- is how a
// governance argument gets lost.
//
// The screen puts a DERIVED FTE figure next to it, computed from
// v_time_reallocation headcount, the shares above and the measured
// touchless rate, so the premise has something auditable to sit against and
// the gap between them is visible rather than smoothed over.
export type RedeploymentRow = {
  /** The work that shrinks. */
  from: string;
  /** Full-time equivalents of it, per the case. */
  fte: number;
  /** Where the case commits that capacity. A person, not a saving. */
  to: string;
  /** Why that destination and not another. */
  because: string;
};

export const REDEPLOYMENT_LEDGER: readonly RedeploymentRow[] = [
  {
    from: "Forecast preparation",
    fte: 44,
    to: "Demand interpretation and exceptions",
    because:
      "The statistical work is the part that was batch-scored. What is left is reading what the forecast implies and arguing with it where it is wrong, which is the same people doing the harder half of their old job.",
  },
  {
    from: "Reporting analysis",
    fte: 38,
    to: "Commercial analysis and scenario work",
    because:
      "Assembling a number and interpreting it were the same role only because assembling it took the week. Separating them moves the whole headcount to the second half.",
  },
  {
    from: "Report assembly",
    fte: 35,
    to: "Planning with Design and Marketing",
    because:
      "The downstream handoffs exist and nobody currently has the hours to work them. This is the capacity that makes them more than a table.",
  },
  {
    from: "Allocation spreadsheets",
    fte: 29,
    to: "Regional trading and store partnership",
    because:
      "Shifts inside the autonomy band execute without a human. Shifts outside it need somebody who knows the region, and that is a relationship rather than a spreadsheet.",
  },
];

/** The case's total. Kept as a sum of the rows so the two cannot disagree. */
export const REDEPLOYMENT_TOTAL_FTE = REDEPLOYMENT_LEDGER.reduce(
  (total, row) => total + row.fte,
  0,
);

/** Rendered wherever the ledger appears. */
export const REDEPLOYMENT_SOURCE =
  "case premise -- FINAL_SPEC.md and the visual specification, no table in this schema";

/**
 * The number of roles the ledger removes.
 *
 * Not a premise and not a reading: it is the commitment itself, and it is a
 * constant because zero is the whole claim. Every row above moves capacity
 * from one column to another; none of them ends anywhere.
 */
export const ROLES_REMOVED = 0;
