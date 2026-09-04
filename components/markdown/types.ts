// The shapes the markdown screen renders. One flat row per recommendation,
// assembled from four reads and nothing else.

/**
 * `timing` is text in the schema and the pipeline can write three values.
 * Only two ever occur -- see TimingBuckets for why the third cannot -- so
 * the union is written out and anything unexpected is carried through as a
 * string rather than coerced into one of the two.
 */
export type Timing = "NOW" | "HOLD";

export function isKnownTiming(value: string | null): value is Timing {
  return value === "NOW" || value === "HOLD";
}

/**
 * How a timing value is spelled and toned wherever it appears as a pill.
 *
 * There are THREE outcomes, not two. A `timing === "NOW" ? a : b` test reads
 * every unexpected value as HOLD, which turns a pipeline change into a
 * silent instruction to do nothing. TimingBuckets already surfaces an
 * unrecognised value in the open; this is the same rule for the pills, so
 * the screen cannot say "hold" about a label it does not understand.
 */
export type TimingDisplay = {
  label: string;
  /** A PillVariant. Amber is the warning tone, never one of the two verdicts. */
  variant: "down" | "grey" | "amber";
  known: boolean;
};

export function timingDisplay(
  timing: string,
  now: string,
  hold: string,
): TimingDisplay {
  if (timing === "NOW") return { label: now, variant: "down", known: true };
  if (timing === "HOLD") return { label: hold, variant: "grey", known: true };
  return {
    label: `${timing} -- not recognised`,
    variant: "amber",
    known: false,
  };
}

/** One category's fitted price elasticity, as stored in `elasticity`. */
export type CategoryFit = {
  categoryId: string;
  categoryLabel: string;
  /** Negative on every fitted category: cut price, sell more. */
  coefficient: number | null;
  intercept: number | null;
  /** The category's OWN R-squared, kept even where the pooled fit shipped. */
  rSquared: number | null;
  nObservations: number | null;
  /**
   * True where the category's own fit was too weak or too thin to defend, so
   * the coefficient and intercept on the row are the pooled ones. A depth
   * resting on this is weaker than one resting on a category fit.
   */
  isPooled: boolean;
};

/** One markdown timing recommendation, joined to the fit that produced it. */
export type MarkdownRow = {
  id: number;
  styleId: string;
  styleName: string;
  categoryId: string;
  categoryLabel: string;
  weeksSinceLaunch: number;
  remainingLifeWeeks: number;
  coverWeeks: number;
  projectedLeftoverUnits: number | null;
  /** Priced for the week it would be set in: week 0 on NOW, week 4 otherwise. */
  recommendedDepth: number;
  recommendedWeek: number;
  marginIfNow: number | null;
  marginIfDelayed: number | null;
  marginSaved: number;
  timing: string;
  rationale: string;
  modelVersion: string;
  generatedAt: string;
  /** dim_sku.list_price_inr, for the leftover's value at list. */
  listPriceInr: number | null;
  /**
   * What the wait costs as a share of that list value -- margin_saved
   * divided by (projected leftover x list price). This is the quantity the
   * pipeline compares against the 5% trigger, recomputed here from stored
   * parts so the trigger on screen is checkable rather than asserted.
   */
  waitCostShare: number | null;
  /** The category fit behind this row's depth. Null if the category has none. */
  fit: CategoryFit | null;
};
