// THE ONE FIGURE ON THIS SCREEN THAT HAS NO TABLE BEHIND IT.
//
// Everything else the governance screen renders -- every count, threshold,
// name, timestamp, model version and derivation -- is read from Postgres at
// request time. This file is the single exception, it is named as an
// exception on the screen where it appears, and it exists because the
// alternative was worse.
//
// WHAT IS MISSING FROM THE DATABASE
// ---------------------------------
// autonomy_band.escalates_when for forecast_agent says a series is referred
// to its accountable planner "when it falls more than 5 accuracy points
// below its baseline in each of two consecutive weeks". The five points are
// in that text and so is the two. What is NOT in that text, and not in any
// column of any table this app can read, is the arithmetic that decided how
// many consecutive weeks the rule should require -- and that arithmetic is
// the whole governance artefact. A threshold with its derivation attached is
// a policy; the same threshold without one is a preference.
//
// The derivation lives in the pipeline source, in the comment above
// CONSECUTIVE_WEEKS in sv/agents/forecast_agent.py. It was measured against
// this dataset and never written to a row.
//
// AND THE TWO NUMBERS DISAGREE
// ----------------------------
// The band text stored in the database says two consecutive weeks. The
// shipped agent sets CONSECUTIVE_WEEKS = 3, because two was measured against
// this data and found to fire on noise. Both figures are shown on screen,
// each labelled with where it comes from, and the screen does not pick a
// winner: no table records which one the last run actually enforced, and
// inventing that answer would be exactly the failure this file is trying to
// avoid. It is written down here instead, so a reader can see the gap and
// close it in the pipeline rather than in the interface.
//
// HOW TO REMOVE THIS FILE
// -----------------------
// Have run_agents.py write the agent's own CONSECUTIVE_WEEKS and its
// derivation into autonomy_band.escalates_when (or into a policy_parameter
// row, where computed_value / basis / override_reason already exist for
// precisely this shape of fact). Then delete this constant and read it.

/**
 * The forecast agent's escalation arithmetic, quoted from the pipeline
 * source because no table carries it.
 *
 * The stored fields are the PRIMITIVES only -- the measured per-week breach
 * rate, the two candidate values of k, the series count. The false-alarm
 * percentages are computed on screen from those primitives rather than
 * stored, so the reader watches the arithmetic happen instead of being
 * handed its answer.
 */
export const UNTABLED_FORECAST_ESCALATION = {
  /** Where this came from. Printed on screen, verbatim. */
  source: "styleverse/sv/agents/forecast_agent.py",
  /** The symbol in that file whose comment carries the derivation. */
  symbol: "CONSECUTIVE_WEEKS",

  /** Consecutive breaching weeks the shipped agent requires. */
  shippedK: 3,
  /** What FINAL_SPEC Part 3 asked for, and what the band text still says. */
  specK: 2,

  /**
   * Drift threshold in accuracy points. This one IS in the database, in
   * autonomy_band.escalates_when; it is repeated here only so the sentence
   * on screen can do its own arithmetic without re-parsing that prose.
   */
  driftPoints: 5,

  /** Standard deviation of a single week's 1-WAPE, in accuracy points. */
  weeklySdPointsLow: 12,
  weeklySdPointsHigh: 14,

  /**
   * Share of individual weeks that fall more than driftPoints below
   * baseline by chance alone, measured on this dataset: 26-28%. The single
   * rate below is the one the source comment carries the arithmetic for.
   */
  chanceBreachRateLow: 0.26,
  chanceBreachRateHigh: 0.28,
  chanceBreachRate: 0.27,

  /**
   * Series the agent scores per brand. Unlike everything else here this
   * figure IS checkable against a table -- agent_run.items_examined for
   * forecast_agent -- and the panel prints both side by side so the reader
   * can see the source comment agreeing with the runs.
   */
  seriesScored: 108,
} as const;

// ------------------------------------------------------------------------
// The authored values themselves. They live here, in one file, so the
// sentence at the top of the screen that claims to list them exhaustively
// can be built from the same constants the panels use rather than from
// prose somebody has to remember to update.
//
// This module imports nothing on purpose: it is reached from a client
// component, a server action and four server components, and a constant
// that drags a dependency graph behind it stops being a constant.
// ------------------------------------------------------------------------

/**
 * Entries per page in the decision trail. A display choice, not a cap:
 * every entry stays reachable through the pager, and the panel prints which
 * slice of the total is on screen.
 */
export const TRAIL_PAGE_SIZE = 25;

/**
 * How far a band width quoted in an agent's reason text may sit from the
 * band in force before the row counts as quoting a superseded one.
 *
 * The agent writes the band to one decimal place, so a 1.25pp band appears
 * in the newest rows as "1.2pp" and 1.12pp as "1.1pp". Those are the same
 * band written shorter, not a different band, and a strict comparison would
 * file them with the genuinely superseded 2.0pp rows and overstate the
 * correction. Half a decimal place plus a hair is the widest gap that
 * rounding alone can produce.
 */
export const BAND_ROUNDING_TOLERANCE_PP = 0.06;

/**
 * Longest reason accepted when the kill switch moves. Long enough for a
 * sentence and a ticket reference, short of an essay. Enforced in the
 * server action and shown as the textarea's limit so the two cannot drift.
 */
export const KILL_SWITCH_REASON_MAX = 400;

/**
 * Everything on this screen that is AUTHORED rather than read.
 *
 * The rule about provenance is not "avoid constants", it is "never let a
 * constant pass as a measurement". These four are judgements this screen
 * makes, each of them printed beside its own output where it is used. The
 * list is exhaustive on purpose: the page states it as exhaustive, and a
 * false claim about provenance is worse than a missing one, because it stops
 * the reader checking.
 */
export const AUTHORED_ON_THIS_SCREEN: readonly {
  /** Phrased to drop straight into the banner's sentence, lower case. */
  what: string;
  where: string;
  why: string;
}[] = [
  {
    what: "the keyword rule that sorts overrides into model gap and judgement",
    where: "components/governance/classify.ts, printed in full in the learning loop",
    why:
      "Nothing in the schema classifies an override. override_reason is free " +
      "text and the learning agent has examined none of them, so the split is " +
      "computed on read and the rule is shown beside its own counts.",
  },
  {
    what: `the ${BAND_ROUNDING_TOLERANCE_PP.toFixed(2)}pp tolerance that tells a superseded band from the current one written shorter`,
    where: "quotesSupersededBand() in data.ts, printed in the band correction panel",
    why:
      "The agent writes the band to one decimal place, so 1.25pp appears in " +
      "the newest rows as 1.2pp. Half a decimal place plus a hair is the " +
      "widest gap rounding alone can produce.",
  },
  {
    what: `the ${TRAIL_PAGE_SIZE}-entry page size of the decision trail`,
    where: "components/governance/DecisionTrail.tsx, stated in the panel",
    why:
      "A display choice, not a cap: every entry stays reachable through the " +
      "pager and the panel says which slice of the total is on screen.",
  },
  {
    what: "the two roles the kill switch is enabled for",
    where: "components/governance/KillSwitch.tsx, named on the control",
    why:
      "They mirror agent_kill_switch's own UPDATE policy, which is the thing " +
      "that actually enforces them. The screen disables a control it knows " +
      "the database would refuse; it does not grant one.",
  },
  {
    what: `the ${KILL_SWITCH_REASON_MAX}-character cap on the reason a kill-switch change asks for`,
    where: "components/governance/actions.ts, stated under the reason box",
    why:
      "Long enough for a sentence and a ticket reference, short of an essay. " +
      "It constrains this form and nothing in the business, but it is a number " +
      "this screen chose, so it is listed with the rest.",
  },
];
