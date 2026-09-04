// EDITORIAL REVIEW OF THE STORED HANDOFF TEXT.
//
// WHY A SCREEN REVIEWS ITS OWN CONTENT
// ------------------------------------
// downstream_handoff rows are prose written by a batch job and read by
// somebody outside planning -- a designer, a media buyer, a plant scheduler
// -- who has no way to check them against the warehouse. Rendering that prose
// unchanged makes this screen the last place a wrong claim could have been
// caught and wasn't. So every row is put through the checks below before it
// reaches the page, and anything they catch is rendered WITH the objection
// attached rather than quietly dropped or quietly passed on.
//
// Rendering rather than withholding is deliberate. A withheld row is
// invisible: the reader cannot see what was suppressed or disagree with the
// suppression. A row rendered under its own objection is still checkable, and
// the objection is the useful part.
//
// WHAT THESE CHECKS ARE AND ARE NOT
// ---------------------------------
// Most of them are STRUCTURAL and hold for any row: they compare fields inside
// the row against each other and cannot be wrong about what they compare.
// One is LEXICAL -- it matches words against a list -- and a word list is a
// blunt instrument in both directions. It can miss a causal claim phrased
// without any of these verbs, and it can fire on an innocent sentence that
// happens to use one. The screen says so where the result of the scan is
// reported, because a check whose limits are hidden reads as a guarantee.
//
// None of these checks invents a number. Each one either compares two values
// the row already carries, or matches text.

import { formatUnitsAbs } from "@/components/DriverBars";

export type ReviewLevel = "flag" | "note";

export type ReviewMark = {
  level: ReviewLevel;
  /** Stable identity, so a mark can be counted and grouped. */
  code: string;
  /** Two or three words for a pill. */
  label: string;
  /** The objection, in a planner's words. Rendered under the insight. */
  detail: string;
  /** The words that triggered a lexical match, quoted back. */
  quote?: string;
};

type Lexeme = { pattern: RegExp; label: string; detail: string };

/**
 * Verbs that assert a MECHANISM. An attribute observation is a ranking of
 * what already sold; a mechanism claim says one thing produced another, and
 * nothing in a sell-through ranking can support that. Fabric, silhouette and
 * colour are chosen together, merchandised together and discounted together,
 * so any of them can carry the credit for all of them.
 */
const CAUSAL: readonly Lexeme[] = [
  {
    pattern: /\b(drives?|driving|drove|driven by)\b/i,
    label: "Causal verb",
    detail:
      "asserts that one measured quantity produces another. The handoff rows rank outcomes; a ranking cannot separate an attribute from everything that was decided alongside it.",
  },
  {
    pattern: /\b(causes?|caused|causing)\b/i,
    label: "Causal verb",
    detail:
      "asserts causation from an observational ranking. Nothing in these rows is an experiment, so there is no counterfactual to attribute an outcome to.",
  },
  {
    pattern: /\bleads? to\b/i,
    label: "Causal verb",
    detail:
      "asserts a consequence rather than a co-occurrence. The measured quantity supports the second but not the first.",
  },
  {
    pattern: /\b(lifts?|lifted|boosts?|boosted|uplift)\b/i,
    label: "Effect claim",
    detail:
      "claims a change produced by an action. No row here measures a before and an after under an intervention.",
  },
  {
    pattern: /\b(because of|due to|thanks to|owing to)\b/i,
    label: "Attribution",
    detail:
      "attributes an outcome to a single factor. The rows carry no way to hold the other factors still.",
  },
];

/** Assertions about the future, or instructions dressed as findings. */
const PREDICTIVE: readonly Lexeme[] = [
  {
    pattern: /\bwill\b/i,
    label: "Prediction",
    detail:
      "states what will happen. These rows describe a window that has already closed; a forecast belongs to the model, with its own accuracy and interval attached, not to a handoff summary.",
  },
  {
    pattern: /\b(guarantees?|ensures?|proves?)\b/i,
    label: "Overstated",
    detail:
      "claims certainty. Every figure in these rows is an aggregate over a finite window and carries sampling variation the row does not state.",
  },
  {
    // "need committing", "requires ordering" -- obligation phrased as
    // necessity rather than as an instruction. The six MANUFACTURING rows in
    // this dataset are all of this form, and a list without it caught none of
    // them while reporting a clean scan.
    // Flat alternatives on purpose: LEXICON_TERMS is derived from this
    // source, and a nested group splits into fragments ("to be", "placing")
    // that read as nonsense in a published word list.
    pattern: /\b(should|must|ought to|need committing|needs committing|need ordering|needs ordering|need placing|needs placing|require committing|requires committing|need to be|needs to be)\b/i,
    label: "Prescriptive",
    detail:
      "instructs the receiving function rather than informing it. A handoff that arrives as an order removes the judgement the receiving function is accountable for. Stating the lead time and the units inside it is the observation; deciding that they must therefore be committed is manufacturing's call.",
  },
];

/** ISO week range as it appears in an insight sentence or a metric value. */
const WEEK_RANGE = /(\d{4}-W\d{2})\s*(?:to|-|–)\s*(\d{4}-W\d{2})/i;

function normaliseRange(value: string | undefined): string | null {
  if (!value) return null;
  const match = WEEK_RANGE.exec(value);
  return match ? `${match[1].toUpperCase()} to ${match[2].toUpperCase()}` : null;
}

export type ReviewInput = {
  insight: string;
  metric: Readonly<Record<string, string>>;
};

/**
 * CHECK 1 -- lexical. Words that promise more than a ranking can deliver.
 */
function lexical(insight: string): ReviewMark[] {
  const marks: ReviewMark[] = [];
  const scan = (lexemes: readonly Lexeme[], code: string) => {
    for (const lexeme of lexemes) {
      const hit = lexeme.pattern.exec(insight);
      if (!hit) continue;
      marks.push({
        level: "flag",
        code,
        label: lexeme.label,
        detail: `The stored text ${lexeme.detail}`,
        quote: hit[0],
      });
    }
  };
  scan(CAUSAL, "causal-language");
  scan(PREDICTIVE, "predictive-language");
  return marks;
}

/**
 * CHECK 2 -- structural, and the one that catches something in the current
 * fixture. The metric string names the window the figures cover; the sentence
 * names a window too. When they disagree, one of the two numbers in the
 * comparison belongs to a different period from the other, and a difference
 * between two periods is not a plan variance.
 *
 * This compares two fields of the same row against each other, so it cannot
 * be wrong about the disagreement -- only about which of the two is correct,
 * which is why the mark says a window is contested rather than saying which
 * one wins.
 */
function windowMismatch(input: ReviewInput): ReviewMark[] {
  const stated = normaliseRange(input.metric.window);
  const written = normaliseRange(input.insight);
  if (!stated || !written || stated === written) return [];

  const basis = input.metric.basis ? ` The metric names its basis as ${input.metric.basis}.` : "";
  return [
    {
      level: "flag",
      code: "window-mismatch",
      label: "Windows disagree",
      detail:
        `The sentence attributes these figures to ${written}, while the row's own supporting metric ` +
        `records the window as ${stated}. Both cannot be the period behind both numbers, so the ` +
        `comparison is between two different spans of time and the percentage gap between them is ` +
        `not a like-for-like plan variance.${basis} Read the units; treat the gap as unlabelled ` +
        `until the pipeline says which window each side covers.`,
    },
  ];
}

/**
 * CHECK 3 -- structural. A ratio between two SHARES is not the same kind of
 * quantity as a ratio between two rates, and putting them in adjacent
 * sentences invites a comparison that does not hold.
 *
 * Sell-through runs across most of its range, so its top-to-bottom ratio is
 * bounded and small. Markdown share has a floor near zero, so dividing the
 * highest by the lowest can produce any number at all: an attribute that was
 * barely discounted makes the denominator tiny and the ratio enormous. The
 * arithmetic is correct and the impression it leaves is not.
 */
function shareRatio(input: ReviewInput): ReviewMark[] {
  const { metric } = input;
  if (!metric.highest_markdown || !metric.lowest_markdown || !metric.spread_ratio) {
    return [];
  }
  return [
    {
      level: "note",
      code: "ratio-of-shares",
      label: "Ratio of shares",
      detail:
        "This multiple divides one markdown SHARE by another. A share can sit near zero, so the " +
        "ratio is governed by how little the least-discounted attribute was marked down rather " +
        "than by how much the most-discounted one was. It is not comparable with the sell-through " +
        "spreads above it, which divide two rates that both sit well away from zero. Read the two " +
        "percentages, not the multiple.",
    },
  ];
}

/**
 * CHECK 4 -- structural. Unserved demand is not observable. Nobody records
 * the customer who found an empty shelf, so a figure for it is always an
 * availability ratio multiplied by a demand base.
 *
 * The row carries the ratio and the product but not the base, so the base can
 * be backed out of the two -- which is what makes the point concrete: the
 * number is arithmetic on an availability percentage, and it moves with
 * whatever estimated that percentage.
 */
function derivedUnserved(input: ReviewInput): ReviewMark[] {
  const { metric } = input;
  const unserved = Number.parseFloat(metric.unserved_units ?? "");
  const availability = Number.parseFloat(metric.availability ?? "");
  if (!Number.isFinite(unserved) || !Number.isFinite(availability)) return [];
  if (availability >= 1 || availability < 0) return [];

  // Grouped arithmetically rather than through toLocaleString, so the server
  // render and the hydrated client render produce the identical string.
  const impliedBase = formatUnitsAbs(unserved / (1 - availability));
  return [
    {
      level: "note",
      code: "derived-unserved",
      label: "Derived, not counted",
      detail:
        `Unserved demand is not recorded anywhere: a customer who found the shelf empty leaves no ` +
        `row. Read as demand x (1 - availability), this figure implies a demand base of about ` +
        `${impliedBase} units across the window. The base is not in the row, so that is the ` +
        `arithmetic the number is consistent with rather than a second measurement -- and the ` +
        `whole figure moves with the availability ratio that produced it.`,
    },
  ];
}

/**
 * CHECK 5 -- structural, and the one that catches a sentence rather than a
 * comparison. A percentage of a difference is meaningless without its
 * denominator, and these rows carry two candidates for it: the plan, and the
 * quantity the plan was measured against. The same gap expressed over one is
 * a different number from the same gap expressed over the other.
 *
 * The check ties the percentage in the SENTENCE to the one in the METRIC --
 * they must be the same figure or it does nothing -- works out which of the
 * two bases the stored figure was divided by, and then reads the words
 * immediately after the percentage to see which base the sentence hands the
 * reader. Where those disagree, the number is correct and the sentence
 * attaches it to the wrong quantity, which is the harder error to catch by
 * eye and the easier one to carry into a capacity meeting.
 *
 * Where the sentence names the same base the arithmetic used, nothing is
 * emitted. A mark on a correct sentence teaches a reader to ignore marks.
 */
type BaseCandidate = { key: string; label: string; phrase: RegExp };

const BASES: readonly BaseCandidate[] = [
  {
    key: "manual_units",
    label: "the manual plan",
    phrase: /manual plan|the plan\b/i,
  },
  {
    key: "demand_units",
    label: "the units the category recorded",
    phrase: /the units .{0,24}recorded|units of demand|of demand\b/i,
  },
  {
    key: "requirement_units",
    label: "the recommended buy",
    phrase: /recommended buy|the requirement/i,
  },
];

function percentageBase(input: ReviewInput): ReviewMark[] {
  const { metric } = input;
  const stored = Number.parseFloat(metric.delta_pct ?? "");
  const delta = Number.parseFloat(metric.delta_units ?? "");
  if (!Number.isFinite(stored) || !Number.isFinite(delta) || stored === 0) {
    return [];
  }

  const present = BASES.map((base) => ({
    base,
    value: Number.parseFloat(metric[base.key] ?? ""),
  })).filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  if (present.length < 2) return [];

  // Which base does the STORED percentage divide by? Half a point of
  // tolerance, which is far tighter than the gap between the candidates here.
  const used = present.find(
    (entry) => Math.abs(Math.abs(delta / entry.value) - Math.abs(stored)) <= 0.005,
  );
  if (!used) return [];

  // Find the same figure in the sentence, and read what follows it. Matching
  // on the value rather than on position is what makes this safe: a sentence
  // quoting some other percentage is not examined at all.
  const target = Math.abs(stored) * 100;
  const written = [...input.insight.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].find(
    (match) => Math.abs(Number.parseFloat(match[1]) - target) <= 0.05,
  );
  if (!written || written.index === undefined) return [];

  const tail = input.insight.slice(
    written.index + written[0].length,
    written.index + written[0].length + 56,
  );
  const named = present.find((entry) => entry.base.phrase.test(tail));
  if (!named || named.base.key === used.base.key) return [];

  const asWritten = ((Math.abs(delta) / named.value) * 100).toFixed(1);
  const asStored = (Math.abs(stored) * 100).toFixed(1);
  return [
    {
      level: "flag",
      code: "percentage-base",
      label: "Wrong base",
      detail:
        `The gap in this sentence is ${formatUnitsAbs(Math.abs(delta))} units, and the ` +
        `percentage beside it is that gap over ${used.base.label}: ${asStored}%. The ` +
        `sentence hands it to the reader against ${named.base.label} instead, and over ` +
        `that base the same gap is ${asWritten}%. Neither figure is wrong; the pairing ` +
        `is. Take the units, or take the percentage with the base named here.`,
      quote: written[0],
    },
  ];
}

/** Every check, in the order they are rendered. */
export function reviewInsight(input: ReviewInput): ReviewMark[] {
  return [
    ...lexical(input.insight),
    ...windowMismatch(input),
    ...percentageBase(input),
    ...shareRatio(input),
    ...derivedUnserved(input),
  ];
}

export type ReviewSummary = {
  scanned: number;
  flagged: number;
  noted: number;
  /**
   * Rows carrying ANY mark. Not flagged + noted: a row can carry both, so
   * adding them double-counts it. The header KPI says "rendered with an
   * objection", and this is the number of rows that actually render one.
   */
  marked: number;
  /** Distinct flag codes present, so the header can name them. */
  flagCodes: string[];
};

export function summariseReview(
  marks: ReadonlyArray<readonly ReviewMark[]>,
): ReviewSummary {
  let flagged = 0;
  let noted = 0;
  let marked = 0;
  const codes = new Set<string>();
  for (const row of marks) {
    if (row.length > 0) marked += 1;
    if (row.some((mark) => mark.level === "flag")) flagged += 1;
    if (row.some((mark) => mark.level === "note")) noted += 1;
    for (const mark of row) {
      if (mark.level === "flag") codes.add(mark.code);
    }
  }
  return {
    scanned: marks.length,
    flagged,
    noted,
    marked,
    flagCodes: [...codes].sort(),
  };
}

/**
 * The checks, named, so the screen can describe itself without drifting.
 *
 * A page that says "four tests" while the code runs five is exactly the kind
 * of small, quiet inaccuracy this screen spends its whole length arguing
 * against. So the description is exported from beside the implementations and
 * the count is taken from the array.
 */
export type CheckDescription = {
  code: string;
  kind: "structural" | "lexical";
  what: string;
};

export const CHECKS: readonly CheckDescription[] = [
  {
    code: "causal-language",
    kind: "lexical",
    what: "matches the sentence against a list of words that promise a mechanism or a future",
  },
  {
    code: "window-mismatch",
    kind: "structural",
    what: "compares the window the sentence names against the window the metric records",
  },
  {
    code: "percentage-base",
    kind: "structural",
    what: "compares the base a percentage was divided by against the base the sentence hands the reader",
  },
  {
    code: "ratio-of-shares",
    kind: "structural",
    what: "marks a multiple made by dividing one share by another, which is not comparable with a ratio of two rates",
  },
  {
    code: "derived-unserved",
    kind: "structural",
    what: "marks a figure that could only have been arrived at by multiplying a ratio by a base the row does not carry",
  },
];

/**
 * The lexicon, DERIVED from the patterns that actually run.
 *
 * This used to be a hand-typed array beside the patterns, and it had drifted:
 * the screen published a list of thirteen words as "what it scanned for" while
 * the running patterns were a different set. Deriving it means the published
 * list cannot fall out of step with the executed one again -- if a term is
 * shown here, a pattern containing it ran.
 */
function termsOf(lexemes: readonly Lexeme[]): string[] {
  return lexemes.flatMap((lexeme) =>
    lexeme.pattern.source
      // Strip the regex scaffolding, leaving the alternatives.
      .replace(/\\b|\\y|[()]/g, " ")
      .split("|")
      .map((part) =>
        part
          .replace(/\?:/g, " ")
          .replace(/[?*+]/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((part) => part.length > 2),
  );
}

export const LEXICON_TERMS: readonly string[] = [
  ...new Set([...termsOf(CAUSAL), ...termsOf(PREDICTIVE)]),
].sort();
