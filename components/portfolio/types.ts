// The shapes the portfolio page passes into its panels.
//
// Everything here is already resolved on the server: the page reads the
// rows, joins them, works out the shares and hands flat values down. No
// component below this file looks anything up, converts a rate, or decides
// what a threshold is. That is deliberate -- a CMPO screen that computed
// figures inside its own render would be a screen nobody could re-derive.
//
// The types are erased at build time, so importing them costs nothing.

import type { RecType } from "@/lib/queries";

// ------------------------------------------------------------------- scope

/** A brand row level security actually returned for this session. */
export type BrandRow = {
  brandId: string;
  brandName: string;
  /** dim_brand.gross_margin -- the rate lost sales revenue was converted at. */
  grossMargin: number | null;
  positioning: string | null;
};

/**
 * What this session may look at, and what it asked to look at.
 *
 * `brands` is the set row level security handed back from dim_brand, which
 * is the switcher's only source of truth: a brand CMPO gets one row, a group
 * CMPO gets both. Nothing here reads the role string to decide -- the policy
 * decides, and the page renders what came back.
 */
export type PortfolioScope = {
  brands: BrandRow[];
  /** The brand named in the URL, verbatim, or null. */
  requested: string | null;
  /** Resolved: one brand id, or null meaning every brand in `brands`. */
  selected: string | null;
  /** The URL named a brand this session cannot read. Said out loud on screen. */
  requestedOutOfScope: boolean;
  /** Ids in scope after resolution -- one, or all of them. */
  brandIds: string[];
};

// ------------------------------------------------------------------- value

/** One value_summary row, resolved and named. */
export type ValueRow = {
  /** "BRAND" or "PORTFOLIO", as stored. */
  scope: string;
  /** "SPD", "ECO", or "ALL" for the portfolio row. */
  brandId: string | null;
  /** dim_brand.brand_name where there is one; the id otherwise. */
  label: string;
  markdownAvoidedInr: number | null;
  lostSalesRecoveredInr: number | null;
  totalMarginInr: number | null;
  /** value_summary.unit_change_pct, already 0..100 and signed. */
  unitChangePct: number | null;
  holdingCostInr: number | null;
  /** The stored derivation, rendered verbatim wherever it is shown. */
  basis: string;
};

/**
 * Whether the portfolio row is the total of what this session can see.
 *
 * value_summary lets brand_id = 'ALL' through to every authenticated user,
 * so a brand CMPO can read the group row even though only one of the brands
 * inside it is theirs. Headlining that row for them would be a scope error
 * dressed as a bigger number, so the page checks the arithmetic instead of
 * trusting the label: if the group row does not equal the sum of the brand
 * rows in scope, it covers brands this session cannot see, and it is named
 * rather than shown.
 */
export type ValueView = {
  portfolio: ValueRow | null;
  brands: ValueRow[];
  /** portfolio total equals the sum of the readable brand rows. */
  portfolioCoversScope: boolean;
  /** The row this screen headlines: portfolio when it covers scope, else brand. */
  headline: ValueRow | null;
};

// ---------------------------------------------------------------- accuracy

/**
 * The benchmarks the batch scorer published beside the model, each with the
 * margin the model holds over it. Sorted hardest-to-beat first, which is the
 * order that matters: the authored manual baseline sits wherever the numbers
 * put it, not at the top where it flatters.
 */
export type BenchmarkRow = {
  key: string;
  label: string;
  /** 1 - WAPE, as a percentage. */
  pct: number;
  /** Model accuracy minus this benchmark, in points. */
  marginPoints: number;
  /** True for the baseline the dataset designer authored. */
  authored: boolean;
  note: string;
};

/** Interval quality, and why its fold count differs from the accuracy's. */
export type CoverageRow = {
  brandId: string;
  /** policy_parameter.computed_value -- the measured, calibrated coverage. */
  calibrated: number | null;
  /** policy_parameter.applied_value -- the nominal the band was built to. */
  nominal: number | null;
  /**
   * model_registry.metrics.p10_p90_coverage -- RAW, pre-calibration. This
   * describes a band that was never shipped and is never presented as
   * interval quality; it appears only so a reader who finds it in the
   * registry knows why it must not be quoted.
   */
  raw: number | null;
  /** policy_parameter.basis, verbatim. */
  basis: string | null;
  /** policy_parameter.override_reason, verbatim. Null when unset. */
  overrideReason: string | null;
};

// ---------------------------------------------------------------- markdown

/** One category or region, with its share of realised markdown loss. */
export type ConcentrationRow = {
  key: string;
  label: string;
  lossInr: number;
  revenueInr: number;
  /** loss / revenue over the window. Null when no revenue was recorded. */
  rate: number | null;
  /** Share of the window's total markdown loss in scope. */
  share: number;
};

/** One cell of the category-by-region grid. */
export type GridRow = {
  key: string;
  label: string;
  cells: { regionId: string; lossInr: number; rate: number | null }[];
  lossInr: number;
};

/** Recommended markdown exposure for one category, from the optimiser. */
export type MarkdownRecRow = {
  brandId: string;
  categoryId: string;
  label: string;
  styles: number;
  /** Sum of margin_saved: acting at the recommended week rather than late. */
  marginSavedInr: number;
  leftoverUnits: number;
  /** Mean recommended_depth across the styles, as a fraction. */
  meanDepth: number | null;
  /** Styles whose timing is the earliest week the optimiser offers. */
  actNow: number;
  /**
   * THE JOIN. Realised markdown loss for this same brand and category over
   * the trailing window, from fact_demand_weekly -- a different table making
   * a different claim, carried alongside so a reader can see whether the
   * optimiser is pointing where the damage already landed or somewhere new.
   * Null where no realised rows matched the pair.
   */
  realisedLossInr: number | null;
  /** That loss as a share of the same pair's realised revenue. */
  realisedRate: number | null;
};

export type MarkdownView = {
  /** Weeks in the trailing window. Equals the published forecast horizon. */
  windowWeeks: number;
  firstWeek: string | null;
  lastWeek: string | null;
  byCategory: ConcentrationRow[];
  byRegion: ConcentrationRow[];
  grid: GridRow[];
  regions: { id: string; label: string }[];
  totalLossInr: number;
  totalRevenueInr: number;
  /** Fact rows actually read, so a truncated window is visible not silent. */
  rowsRead: number;
  truncated: boolean;
  recommendations: MarkdownRecRow[];
  /** Timing value the optimiser uses for "act this week", read from the rows. */
  actNowTiming: string | null;
};

// ---------------------------------------------------------------- adoption

/** One v_adoption_kpi row, named. */
export type AdoptionRow = {
  brandId: string;
  brandLabel: string;
  recType: RecType;
  recLabel: string;
  totalRecs: number;
  decided: number;
  approved: number;
  modified: number;
  rejected: number;
  /**
   * NULL where nothing has been decided. Rendered as "no decisions yet" and
   * never as 0% -- a brand whose planners have not opened the buy plan has
   * not rejected it.
   */
  approvalRatePct: number | null;
  valueActionedInr: number | null;
};

/** The pattern the rows describe, composed from the rows themselves. */
export type AdoptionFinding = {
  brandId: string;
  brandLabel: string;
  /** Lowest approval rate among the types this brand has decided anything on. */
  lowest: AdoptionRow | null;
  /** Highest, for the contrast. */
  highest: AdoptionRow | null;
  /** Types with recommendations but no decision at all. */
  undecidedTypes: AdoptionRow[];
};

// -------------------------------------------------------------- exceptions

/** Exceptions raised above threshold that nobody has decided. */
export type UndecidedRow = {
  brandId: string;
  brandLabel: string;
  severity: string;
  categoryId: string;
  categoryLabel: string;
  regionId: string;
  regionLabel: string;
  action: string;
  valueAtStakeInr: number | null;
  projectedWos: number | null;
  unitsAtRisk: number | null;
  createdAt: string | null;
};

/** One grouping of undecided exceptions, for a table row. */
export type UndecidedGroup = {
  key: string;
  label: string;
  count: number;
  valueInr: number;
  /** Undecided as a share of every exception in that group. */
  shareOfGroup: number | null;
};

export type UndecidedView = {
  rows: UndecidedRow[];
  /** Every exception in scope, decided or not. The denominator. */
  totalExceptions: number;
  decided: number;
  undecided: number;
  /** Value at stake across the UNDECIDED rows. */
  valueInr: number;
  /**
   * Value at stake across EVERY exception in scope. The denominator for the
   * share of exposure nobody has looked at -- which is a different, and
   * usually worse, number than the share by count.
   */
  totalValueInr: number;
  bySeverity: UndecidedGroup[];
  byBrand: UndecidedGroup[];
  byCategory: UndecidedGroup[];
  byRegion: UndecidedGroup[];
  /** Earliest created_at among the undecided rows. */
  oldestRaisedAt: string | null;
  truncated: boolean;
};

// ------------------------------------------------------------------ window

/**
 * The two windows this screen depends on, read rather than assumed.
 *
 * The forward horizon is max(forecast.horizon_week); the realised history
 * ends at max(fact_demand_weekly.week_start). The gap between them is the
 * reason no per-category accuracy can be recomputed, and both ends are read
 * so the sentence that says so cannot go stale.
 */
export type HorizonView = {
  horizonWeeks: number | null;
  forecastFirstWeek: string | null;
  forecastLastWeek: string | null;
  factLastWeek: string | null;
  /**
   * Forecast rows whose week falls on or before the last realised week --
   * the stored predictions a per-category backtest could have been scored
   * against. Counted, not assumed. Null when the count could not be read.
   */
  overlapRows: number | null;
  /** True when no forecast week falls inside the realised history. */
  noOverlap: boolean;
};

/**
 * The one accuracy question this screen has to answer with a refusal.
 *
 * The brief for this page asked for accuracy by CATEGORY. Nothing in the
 * schema supports one, and rather than assert that in a comment the page
 * measures it: `categoryKeys` is every metrics key on a planning-grain
 * registry row that mentions a category, and `overlapRows` above is the
 * count of stored predictions that could be rescored. Both come back empty
 * today; if a future pipeline run published either, the sentence on screen
 * changes with the rows instead of becoming a lie.
 */
export type CategoryEvidence = {
  /** Keys matching /categor/i across every planning-grain metrics object. */
  categoryKeys: string[];
  /** Registry rows actually inspected, so "none found" has a denominator. */
  registryRows: number;
};
