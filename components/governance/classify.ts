// THE OVERRIDE CLASSIFICATION, AND WHY IT LIVES ON THE SCREEN
// ===========================================================
//
// The brief for this panel said "22 overrides classified -- 18 planner
// judgement, 4 model gap", and attached the buckets "competitor_activity 7,
// supplier_constraint 7, calendar_shift 3" to the model-gap set. Those
// buckets sum to 17 and cannot describe 4 rows, so one of the two figures
// had to be wrong. Reading the actual rows, NEITHER is: both numbers are
// right and they belong to different sets. Four overrides say the MODEL
// missed something; eighteen are the planner knowing something the model
// could not; and seventeen of those eighteen fall into the three buckets,
// with one -- "Trimmed on judgement after walking the floor in two doors
// this week" -- belonging to none of them. 4 + 18 = 22, and 7 + 7 + 3 + 1 =
// 18. Every row is accounted for and none is quietly dropped.
//
// THERE IS NO STORED CLASSIFICATION TO READ
// -----------------------------------------
// planner_decision.override_reason is free text. There is no bucket column,
// no tag table and no classification anywhere in the schema. The
// learning_agent's autonomy band says it "classifies planner overrides into
// judgement versus model gap and queues the model gaps for retraining", and
// every one of its runs in agent_run has items_examined = 0. It has never
// looked at an override. That is not a detail to bury: on a governance
// screen, an agent whose stated job has produced nothing is itself the
// finding, and the panel says so at the same size as the counts.
//
// So this classification is computed ON READ, by the rule below, and the
// rule is rendered on the screen next to its own output. A reader who
// disagrees with a bucket can see exactly which words put a row in it and
// argue with the rule rather than with a number. That is the difference
// between a classification and an assertion.
//
// PRECEDENCE IS PART OF THE RULE
// ------------------------------
// MODEL GAP is tested first and wins outright. A reason that says the model
// missed something is a model gap even if it also names a competitor,
// because the claim being made about the SYSTEM is the one that decides
// whether the row belongs in a retraining queue. The three judgement
// buckets are then tested in a fixed order, stated on screen, so a reason
// matching two of them lands in the same bucket every time rather than
// depending on object key order.

import type { LedgerEntry } from "./data";

// ------------------------------------------------------------- the rule

export type OverrideClass = "model_gap" | "judgement";

export type JudgementBucket =
  | "competitor_activity"
  | "supplier_constraint"
  | "calendar_shift"
  | "unbucketed";

export type KeywordRule = {
  /** Stable key, used in the UI and in the counts. */
  key: string;
  /** How the rule is described to a reader. */
  label: string;
  /** One sentence saying what the bucket means, in a planner's words. */
  meaning: string;
  /**
   * The literal phrases matched, case-insensitively, on word boundaries.
   * These are the rule. They are rendered on screen verbatim, so a reader
   * can check any row against them without reading this file.
   */
  keywords: readonly string[];
};

/**
 * Tested FIRST, and it wins outright.
 *
 * Each phrase is a claim about the model's own knowledge rather than about
 * the world: it missed something, it ignores something, it has not caught
 * up, it has no signal. A planner saying any of those is reporting a
 * feature the model does not have, which is a retraining candidate. A
 * planner saying "a competitor is discounting by 30%" is reporting the
 * world, which is not.
 */
export const MODEL_GAP_RULE: KeywordRule = {
  key: "model_gap",
  label: "Model gap",
  meaning:
    "The reason names something the MODEL does not know -- a feature it " +
    "missed, ignores, has no signal for, or has not caught up with. These " +
    "are retraining candidates, because the planner is reporting a gap in " +
    "the model rather than a fact about the market.",
  keywords: [
    "model missed",
    "model ignores",
    "not caught up",
    "no signal",
  ],
};

/**
 * The judgement buckets, IN THE ORDER THEY ARE TESTED. First match wins.
 *
 * The order is stated on screen because it is part of the rule: "Market
 * price has moved against us since the forecast was cut" contains the word
 * "moved", and a calendar bucket that matched loose words like "moved"
 * would have swallowed it. Competitor is tested before supplier and
 * supplier before calendar, and the phrases are specific enough that no row
 * in the current ledger matches two.
 */
export const JUDGEMENT_RULES: readonly KeywordRule[] = [
  {
    key: "competitor_activity",
    label: "Competitor activity",
    meaning:
      "A rival's move that has already happened and that no feature in the " +
      "model observes -- an exit, a discount, a price change in the channel.",
    keywords: ["competitor", "rival", "market price", "discounting"],
  },
  {
    key: "supplier_constraint",
    label: "Supplier constraint",
    meaning:
      "The quantity is not available to commit: a lead time, a minimum " +
      "order break, unconfirmed capacity, goods held at the port.",
    keywords: [
      "supplier",
      "vendor",
      "mill",
      "moq",
      "sourcing",
      "factory",
      "shipment",
      "port",
      "lead time",
    ],
  },
  {
    key: "calendar_shift",
    label: "Calendar shift",
    meaning:
      "The trading calendar the forecast was built on has moved -- a " +
      "festival week, a sale window -- so the peak lands outside the " +
      "horizon the recommendation assumes.",
    keywords: ["diwali", "eoss", "calendar", "sale week"],
  },
];

/**
 * Whole-phrase, case-insensitive match on word boundaries.
 *
 * Boundaries matter: "port" must match "delayed at the port" and must NOT
 * match "opportunity" or "reported". The phrase is escaped before it
 * becomes a pattern so a keyword can never smuggle in regex syntax.
 */
function mentions(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/** Which keywords of a rule this text actually matched. Shown per row. */
export function matchedKeywords(
  text: string | null,
  rule: KeywordRule,
): string[] {
  if (!text) return [];
  return rule.keywords.filter((keyword) => mentions(text, keyword));
}

// ------------------------------------------------------ applying the rule

export type ClassifiedOverride = {
  entry: LedgerEntry;
  klass: OverrideClass;
  /** Only meaningful when klass is "judgement". */
  bucket: JudgementBucket;
  /** The exact phrases that put this row where it is. */
  matched: string[];
};

/**
 * An override is a committed human decision that departed from the
 * recommendation as issued: MODIFIED (a different number) or REJECTED
 * (no number at all). An APPROVED row is a human agreeing, and agreeing is
 * not an override however carefully it was reasoned.
 */
export function isHumanOverride(entry: LedgerEntry): boolean {
  return (
    entry.actorType === "human" &&
    (entry.status === "MODIFIED" || entry.status === "REJECTED")
  );
}

export function classifyOverride(entry: LedgerEntry): ClassifiedOverride {
  const text = entry.reason;

  const gapHits = matchedKeywords(text, MODEL_GAP_RULE);
  if (gapHits.length > 0) {
    return { entry, klass: "model_gap", bucket: "unbucketed", matched: gapHits };
  }

  for (const rule of JUDGEMENT_RULES) {
    const hits = matchedKeywords(text, rule);
    if (hits.length > 0) {
      return {
        entry,
        klass: "judgement",
        bucket: rule.key as JudgementBucket,
        matched: hits,
      };
    }
  }

  // No keyword matched. The row is still a planner override and still
  // belongs in the judgement total -- it just has no bucket, and saying so
  // is the honest reading. Silently dropping it, or stretching a bucket to
  // swallow it, would be the failure this panel exists to avoid.
  return { entry, klass: "judgement", bucket: "unbucketed", matched: [] };
}

export type OverrideAnalysis = {
  /** Every human override in scope, classified. */
  all: ClassifiedOverride[];
  /** Retraining candidates: the reason names a gap in the model. */
  modelGaps: ClassifiedOverride[];
  /** The rest: the planner knew something the model could not. */
  judgement: ClassifiedOverride[];
  /** Judgement rows per bucket, in the order the rules are tested. */
  buckets: { rule: KeywordRule; rows: ClassifiedOverride[] }[];
  /** Judgement rows that matched no keyword at all. Never hidden. */
  unbucketed: ClassifiedOverride[];
  /** Committed human decisions in scope, override or not. */
  humanDecisions: number;
  /** Of those, the ones that agreed with the recommendation as issued. */
  humanApprovals: number;
};

export function analyseOverrides(
  entries: readonly LedgerEntry[],
): OverrideAnalysis {
  const humans = entries.filter((entry) => entry.actorType === "human");
  const all = humans.filter(isHumanOverride).map(classifyOverride);

  const modelGaps = all.filter((row) => row.klass === "model_gap");
  const judgement = all.filter((row) => row.klass === "judgement");

  const buckets = JUDGEMENT_RULES.map((rule) => ({
    rule,
    rows: judgement.filter((row) => row.bucket === rule.key),
  }));
  const unbucketed = judgement.filter((row) => row.bucket === "unbucketed");

  return {
    all,
    modelGaps,
    judgement,
    buckets,
    unbucketed,
    humanDecisions: humans.length,
    humanApprovals: humans.length - all.length,
  };
}

/**
 * Does every override land in exactly one place?
 *
 * The panel prints this. A classification that quietly loses rows is worse
 * than no classification, so the arithmetic is checked at render time
 * rather than asserted in a comment: if the parts ever stop summing to the
 * whole, the screen says so instead of showing a tidy chart that is wrong.
 */
export function reconciles(analysis: OverrideAnalysis): boolean {
  const bucketed = analysis.buckets.reduce((sum, b) => sum + b.rows.length, 0);
  return (
    analysis.modelGaps.length + analysis.judgement.length === analysis.all.length &&
    bucketed + analysis.unbucketed.length === analysis.judgement.length
  );
}
