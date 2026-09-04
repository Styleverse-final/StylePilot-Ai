// ============================================================================
// THE ONLY FIGURES ON /signals THAT HAVE NO TABLE BEHIND THEM.
// ============================================================================
//
// Everything else on this screen -- every measured lead, every correlation,
// every index value, every confidence band, the admission threshold itself,
// and the model accuracy -- is read from Postgres at request time under the
// signed-in planner's row level security. The figures below are the
// exception, they are collected here so there is one place to check, and the
// screen prints the same list under "What has no table behind it" so a
// reader is never left to discover it.
//
// UNTABLED is what the screen renders. Every constant in this file appears in
// it, and every entry interpolates the constant rather than restating it, so
// the on-screen claim cannot drift from the value the code uses. Adding a
// constant here without adding it to UNTABLED is the one mistake this file
// exists to make hard: put it in both, or put it in a table.
//
// The admission threshold is deliberately NOT here. min_actionable_corr is
// written into downstream_handoff.supporting_metric by the pipeline run that
// measured the leads, so it is read (see data.ts, getGateRules) rather than
// typed. If that row is unreadable the screen marks no pair either way and
// says why -- it does not fall back to a number in this file.

/**
 * How often the lead-lag measurement is re-run.
 *
 * NO TABLE. Nothing in the schema records a measurement schedule: the
 * signal_intelligence rows carry one lead per brand-category with no
 * measured_at and no next_due, and policy_parameter has no cadence column.
 * A quarter is the interval at which a fashion assortment turns over enough
 * for a lead measured on the previous one to stop describing the current
 * one; it is a governance proposal, not something the pilot has done twice.
 */
export const REMEASUREMENT_MONTHS = 3;

/**
 * The lag window the lead-lag search covered, in weeks.
 *
 * NO TABLE. It is MAX_LEAD_WEEKS in the pipeline module that wrote these
 * rows (styleverse/sv/intel.py) and it reaches the database only as the
 * chosen lag, never as the range searched. It matters on screen because
 * without it a measured lead of zero is ambiguous: a reader cannot tell
 * whether the search looked ahead and found nothing, or never looked.
 */
export const LEAD_SEARCH_MAX_LAG_WEEKS = 6;

/**
 * Minimum overlapping deseasonalised weeks before a lag is scored at all.
 *
 * NO TABLE. Also from styleverse/sv/intel.py. A lag with fewer than this
 * many paired observations is skipped rather than scored on a handful of
 * points, which is why a correlation can be absent instead of small.
 */
export const LEAD_SEARCH_MIN_OVERLAP_WEEKS = 20;

/**
 * The governor: what each confidence band does to a published opportunity
 * grade.
 *
 * NO TABLE, and there is not even a column to hang one on -- no relation in
 * this schema carries an opportunity grade. The rule is stated here and
 * printed on screen so a planner can predict the system's answer before it
 * gives one, which is the whole point of publishing a rule rather than
 * discovering it from behaviour.
 */
export type GradeCapRow = {
  band: "High" | "Medium" | "Low";
  /** The ceiling this band imposes, or null when it imposes none. */
  cap: "Medium" | null;
  effect: string;
};

export const GRADE_CAP_RULE: readonly GradeCapRow[] = [
  {
    band: "High",
    cap: null,
    effect:
      "No ceiling. The grade the raw signal earns is the grade that gets published.",
  },
  {
    band: "Medium",
    cap: null,
    effect:
      // Deliberately no claim about how many weeks are Medium. The share is
      // rendered from the reader's own rows in the column beside this one,
      // and a sentence asserting it here would be wrong for any scope whose
      // distribution differs -- a category planner reads two series, not all
      // twelve, and the shape of their distribution is theirs.
      "No ceiling. Medium is where a series sits when the trend is neither holding its direction nor breaking down, so it is the middle of the distribution rather than a warning; capping it would cap most of the screen and the rule would stop discriminating between anything.",
  },
  {
    band: "Low",
    cap: "Medium",
    effect:
      "Capped at Medium. A raw High is published as Medium regardless of how strong the signal looks, because a Low band says the trend behind it is not holding its direction.",
  },
];

/** One row of the production data contract. Described, not built. */
export type ContractRow = {
  /** The signal_intelligence column the pilot fills from the fixture. */
  column: string;
  label: string;
  source: string;
  cadence: string;
  /** What has to be controlled before the number can be trusted week to week. */
  accuracyControl: string;
};

/**
 * WHAT A REAL FEED WOULD HAVE TO PROVIDE.
 *
 * NO TABLE, and no code either -- none of this is built. The pilot reads all
 * four series out of the case dataset's own signals sheet, which is the
 * decision that makes the causal question askable at all: because the signal
 * and the demand come from the same fixture, a measured correlation between
 * them is a property of the data a reader can check, rather than a claim
 * about an integration nobody can see. Swapping in live feeds is the step
 * after the pilot, and every row below is a requirement written for that
 * step, not a description of something running.
 */
export const PRODUCTION_CONTRACT: readonly ContractRow[] = [
  {
    column: "search_interest_index",
    label: "Search interest",
    source:
      "Search trends API, one query set per category, mapped to the planning grain's category ids and held under version control.",
    cadence:
      "Weekly, pulled on the ISO week boundary the planning grain already uses, so a signal week and a demand week are the same week.",
    accuracyControl:
      "The API re-bases its index to the window requested, so the same historical week returns a different number on a later pull. Pin the window and the query set, store the pull date beside every value, and re-measure the lead on the stored series rather than on a fresh pull -- otherwise the lead moves when nothing about demand has.",
  },
  {
    column: "social_trend_index",
    label: "Social trend",
    source:
      "Social listening feed: hashtag and mention volume for the category's term list, one platform per column rather than a blended score.",
    cadence: "Weekly, aggregated from daily counts, same ISO week boundary.",
    accuracyControl:
      "Volume tracks platform reach as much as it tracks interest, so a platform's own growth reads as demand. Normalise each week against a same-platform baseline basket, and hold any week that moves beyond the historical 99th percentile for review before it reaches a forecast.",
  },
  {
    column: "competitor_activity_index",
    label: "Competitor activity",
    source:
      "Assortment and promotion monitoring across a named competitor panel, crawled rather than licensed.",
    cadence: "Weekly crawl, with the panel fixed for a season.",
    accuracyControl:
      "A crawl cannot distinguish a competitor who did nothing from a site it failed to reach. Publish per-week coverage -- sites reached over sites in the panel -- beside the value, and suppress the week rather than impute it when coverage falls below a stated floor.",
  },
  {
    column: "competitor_price_index",
    label: "Competitor price",
    source:
      "The same crawl, priced: a basket of comparable styles per category, indexed against the brand's own average selling price.",
    cadence: "Weekly, basket fixed for a season.",
    accuracyControl:
      "An index computed over a changing basket is not comparable week to week, and a basket quietly drifts as styles sell out. Version the basket, restate the whole series when it changes, and record which version produced each week.",
  },
];

/**
 * One figure on this screen that no table produces, and why not.
 *
 * The screen renders this array in full. That is the mechanism behind the
 * exhaustiveness claim it prints: the sentence is not written by hand
 * alongside the list, it is the list.
 */
export type UntabledFigure = {
  id: string;
  what: string;
  value: string;
  whyNoTable: string;
  where: string;
};

export const UNTABLED: readonly UntabledFigure[] = [
  {
    id: "cadence",
    what: "Re-measurement cadence",
    value: `every ${REMEASUREMENT_MONTHS} months`,
    whyNoTable:
      "signal_intelligence records one lead per brand-category with no measured_at and no next-due date, and policy_parameter carries no cadence column, so nothing in the schema says when the measurement was taken or when it is owed again.",
    where: "The admission gate rule, stated with the threshold it re-tests.",
  },
  {
    id: "lag-window",
    what: "Lag window the search covered",
    value: `0 to ${LEAD_SEARCH_MAX_LAG_WEEKS} weeks`,
    whyNoTable:
      "MAX_LEAD_WEEKS in the pipeline module that wrote these rows. Only the winning lag reaches the database; the range it won against does not.",
    where:
      "Beside every measured lead, so a lead of zero reads as a search that found nothing ahead rather than a search that never looked.",
  },
  {
    id: "min-overlap",
    what: "Minimum paired weeks before a lag is scored",
    value: `${LEAD_SEARCH_MIN_OVERLAP_WEEKS} weeks`,
    whyNoTable:
      "Also a pipeline constant. It explains why a correlation can be missing rather than small, and no column records it.",
    where: "The note under the measured-lead table.",
  },
  {
    id: "grade-cap",
    what: "What a Low confidence band caps",
    value: "an opportunity grade at Medium",
    whyNoTable:
      "No relation in this schema carries an opportunity grade at all, so there is no column the rule could be stored against. It is published here instead of being left to be inferred from behaviour.",
    where: "The confidence-band governor, as a three-row rule table.",
  },
  {
    id: "contract",
    what: "The production data contract",
    value: `${PRODUCTION_CONTRACT.length} signals, with source, cadence and accuracy control each`,
    whyNoTable:
      "None of it is built. It is a requirement written for the step after the pilot, and the pilot deliberately reads the dataset's own signals instead -- which is what makes the correlation on this screen checkable rather than asserted.",
    where: "The last section, marked as a plan throughout.",
  },
];
