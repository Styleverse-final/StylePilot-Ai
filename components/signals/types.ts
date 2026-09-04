// Shapes for the signals screen.
//
// Nothing in this file holds a value. Every number that fills these types is
// read from signal_intelligence, dim_category, dim_brand or
// downstream_handoff at request time, under the signed-in planner's row
// level security.
//
// THE ONE RULE THIS FILE ENFORCES BY SHAPE
// ----------------------------------------
// `leadWeeks` and `correlation` sit on the same object and are never
// exported apart. A three-week lead at r=0.26 and a four-week lead at
// r=0.84 are different claims about the world, and a component that could
// receive one without the other would eventually render them looking alike.
// Every renderer on this screen takes a SignalPair, so it always has both.

/**
 * trend_confidence_band as the fixture writes it. Text in Postgres; narrowed
 * here so a fourth spelling shows up as null rather than as a silent fourth
 * band nobody styled.
 */
export type TrendBand = "High" | "Medium" | "Low";

/** Strongest first. The order the governor reads in. */
export const TREND_BANDS: readonly TrendBand[] = ["High", "Medium", "Low"];

export function asTrendBand(value: string | null | undefined): TrendBand | null {
  return value === "High" || value === "Medium" || value === "Low" ? value : null;
}

/** The four external series signal_intelligence carries, keyed for the chart. */
export type SignalKind =
  | "search"
  | "social"
  | "competitorActivity"
  | "competitorPrice";

export type SignalKindMeta = {
  kind: SignalKind;
  /** The column the values come from. Shown so a reader can go and check. */
  column: string;
  label: string;
  /** Index series share a 0-100 axis; the price ratio needs its own. */
  axis: "index" | "ratio";
};

export const SIGNAL_KINDS: readonly SignalKindMeta[] = [
  {
    kind: "search",
    column: "search_interest_index",
    label: "Search interest",
    axis: "index",
  },
  {
    kind: "social",
    column: "social_trend_index",
    label: "Social trend",
    axis: "index",
  },
  {
    kind: "competitorActivity",
    column: "competitor_activity_index",
    label: "Competitor activity",
    axis: "index",
  },
  {
    kind: "competitorPrice",
    column: "competitor_price_index",
    label: "Competitor price",
    axis: "ratio",
  },
];

/** One week of one brand-category series. */
export type SignalWeek = {
  isoWeek: string;
  weekStart: string;
  search: number | null;
  social: number | null;
  competitorActivity: number | null;
  competitorPrice: number | null;
  momentum: number | null;
  band: TrendBand | null;
};

/**
 * The verdict the admission gate reaches for one pair.
 *
 * Three states, not two, because the pipeline that wrote these rows reaches
 * three: it weights a signal only when the correlation clears the bar AND
 * the measured lead is at least one week. A signal that correlates at 0.73
 * but peaks at lag zero is a strong signal with no forward window -- it
 * moves WITH demand, so there is nothing to act on early. Collapsing that
 * into "pass" would promise a campaign window that does not exist.
 */
export type GateVerdict =
  | "weighted"
  | "concurrent"
  | "below"
  | "unmeasured"
  | "no-gate";

export type SignalPair = {
  /** "SPD|OUTW". Stable identity for keys and for the chart picker. */
  key: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;

  /**
   * Lag in weeks at which deseasonalised search interest correlates most
   * strongly with demand. Zero means the peak is contemporaneous.
   */
  leadWeeks: number | null;
  /** The correlation AT that lag. Never rendered without leadWeeks. */
  correlation: number | null;

  /** 104 weeks, oldest first. */
  weeks: SignalWeek[];
  /** How many of those weeks carry each band. */
  bandCounts: Record<TrendBand, number>;
  /** The band on the most recent week, which is the one in force. */
  currentBand: TrendBand | null;
  currentWeek: string | null;
  currentMomentum: number | null;
};

/**
 * The admission threshold as the pipeline recorded it, per brand.
 *
 * NOT A CONSTANT IN THIS REPO. min_actionable_corr is written into
 * downstream_handoff.supporting_metric by the same run that measured the
 * leads, so the bar this screen applies is the bar the pipeline applied, and
 * the two cannot drift. If the row is unreadable the screen says so and
 * marks no pair either way, rather than falling back to a number typed here.
 */
export type GateRule = {
  brandId: string;
  minCorrelation: number;
  /** The column the lead-lag search ran on, e.g. "search_interest_index". */
  leadSignal: string | null;
  /** downstream_handoff.source_table, for the citation on screen. */
  sourceTable: string | null;
  isoWeek: string | null;
  generatedAt: string | null;
};

/** The tightest bracket the rows on screen put around the band boundary. */
export type BandBoundary = {
  weeks: number;
  /** Lowest momentum on any week labelled High. */
  highFloor: number | null;
  /** Highest momentum on any week labelled Medium. */
  mediumCeiling: number | null;
  /** Lowest momentum on any week labelled Medium. */
  mediumFloor: number | null;
  /** Highest momentum on any week labelled Low. */
  lowCeiling: number | null;
  /** True when no two bands overlap on momentum anywhere in scope. */
  separable: boolean;
};

/** What a pair's data says, folded once so every panel agrees. */
export type SignalScope = {
  pairs: SignalPair[];
  /** Keyed by brand_id. Missing brand means no readable gate for it. */
  gates: Record<string, GateRule>;
  boundary: BandBoundary;
  /** Which of the four series carry at least one value in scope. */
  populated: SignalKind[];
  /** Distinct week counts across pairs; one entry means every pair matches. */
  weekCounts: number[];
  firstWeek: string | null;
  lastWeek: string | null;
};

export function verdictFor(pair: SignalPair, gate: GateRule | undefined): GateVerdict {
  if (gate === undefined) return "no-gate";
  if (pair.correlation === null || pair.leadWeeks === null) return "unmeasured";
  if (Math.abs(pair.correlation) < gate.minCorrelation) return "below";
  return pair.leadWeeks >= 1 ? "weighted" : "concurrent";
}
