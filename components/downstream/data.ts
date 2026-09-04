// Server-side reads for the downstream handoff screen, and the derivations
// this screen computes from the rows it read.
//
// WHY THE READ LIVES HERE AND NOT IN lib/queries.ts
// ------------------------------------------------
// lib/queries.ts already exports getDownstreamHandoffs(sb, brandId, fn?), and
// this screen cannot use it: it takes a REQUIRED brand id and applies
// .eq("brand_id", brandId). That is right for a screen scoped to one brand
// and wrong here. downstream_handoff's read policy already grants a
// group_cmpo or coe_admin BOTH brands and everybody else their own, so a
// brand filter on top of it would silently hide half the portfolio from the
// one role entitled to see it, and hide it in a way that looks like an empty
// week rather than a filter.
//
// The read below therefore names no brand at all and lets row level security
// decide, which is the same reason components/buy/data.ts and
// components/learning/data.ts hold their own reads: same signature style as
// lib/queries (the client is the first argument, so the CALLER decides whose
// RLS applies), same failure discipline, just not in the shared file. That
// file is being edited by other screens in parallel and this screen does not
// own it. The signature gap is worth closing in lib/queries.ts later; until
// then it is documented here rather than worked around silently.
//
// PROVENANCE IS THE POINT OF THIS SCREEN
// --------------------------------------
// Every row carries source_table, and source_table names the tables the
// BATCH JOB read -- pipeline names, not this application's names. Two of the
// four sets have no counterpart in the schema the app can read at all, which
// means those rows cannot be recomputed here. That is stated on the screen,
// because a reader who assumes they could check a figure and cannot is worse
// off than one who was told up front.

import type { StyleverseClient } from "@/lib/supabase";

import { isFunctionKey, type FunctionKey } from "./format";
import { reviewInsight, type ReviewMark } from "./review";

// --------------------------------------------------------------- the rows

/** supporting_metric is a "key=value; key=value" string, parsed once. */
export type HandoffMetric = Readonly<Record<string, string>>;

export type HandoffRow = {
  id: number;
  fn: FunctionKey;
  brandId: string | null;
  isoWeek: string;
  insight: string;
  metric: HandoffMetric;
  /** The raw string, rendered verbatim: it is the receipt for the sentence. */
  metricRaw: string | null;
  sourceTable: string | null;
  generatedAt: string;
  review: readonly ReviewMark[];
};

/**
 * Parse "dim=fabric; best=Linen blend:0.711; spread_ratio=1.993".
 *
 * Split on the FIRST "=" only: a value may contain one (none do today, and a
 * parser that assumed so would drop the tail of the first that did). Keys are
 * lowercased; values are kept exactly as stored, because a value that has
 * been tidied is no longer a receipt.
 */
export function parseMetric(raw: string | null): HandoffMetric {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const text = part.trim();
    if (text.length === 0) continue;
    const eq = text.indexOf("=");
    if (eq <= 0) continue;
    out[text.slice(0, eq).trim().toLowerCase()] = text.slice(eq + 1).trim();
  }
  return out;
}

/**
 * "Recycled polyester:0.722" -> { label, value }.
 *
 * Split on the LAST colon, not the first: every attribute label in the
 * fixture is free text and several contain spaces and hyphens, so only the
 * numeric tail is safe to identify positionally.
 */
export function parseLabelledValue(
  raw: string | undefined,
): { label: string; value: number } | null {
  if (!raw) return null;
  const cut = raw.lastIndexOf(":");
  if (cut <= 0) return null;
  const value = Number.parseFloat(raw.slice(cut + 1));
  if (!Number.isFinite(value)) return null;
  return { label: raw.slice(0, cut).trim(), value };
}

function numberFrom(metric: HandoffMetric, key: string): number | null {
  const parsed = Number.parseFloat(metric[key] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every handoff row the signed-in reader is entitled to.
 *
 * No brand filter: downstream_handoff_scoped_read grants group_cmpo and
 * coe_admin every brand and everybody else the brand on their planner record.
 * Ordered here rather than in the database because the display order is a
 * property of this screen -- function first, then brand, then the pipeline's
 * own row order within a function, which is the order the insights were
 * written to be read in.
 */
export type HandoffRead = {
  rows: HandoffRow[];
  /**
   * Function values the read returned that this screen has no heading for.
   *
   * Collected from the SAME read rather than from a second query, so the
   * count can never disagree with the rows on screen. A value here means the
   * pipeline has started writing a fifth function and this screen would
   * otherwise have dropped it in silence.
   */
  unknownFunctions: string[];
  /** Rows returned before the unknown ones were set aside. */
  returned: number;
};

export async function getHandoffRows(
  sb: StyleverseClient,
): Promise<HandoffRead> {
  const { data, error } = await sb
    .from("downstream_handoff")
    .select(
      "id, function, brand_id, iso_week, insight, supporting_metric, source_table, generated_at",
    )
    .order("function", { ascending: true })
    .order("brand_id", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    const hint = error.hint ? ` (${error.hint})` : "";
    throw new Error(`StyleVerse: getHandoffRows failed -- ${error.message}${hint}`);
  }

  const rows: HandoffRow[] = [];
  const unknown = new Set<string>();
  for (const row of data) {
    // A function value outside the four the screen knows about is not
    // rendered under a heading invented for it. It is counted and reported,
    // never silently folded into one of the four.
    if (!isFunctionKey(row.function)) {
      unknown.add(row.function);
      continue;
    }
    const metric = parseMetric(row.supporting_metric);
    rows.push({
      id: row.id,
      fn: row.function,
      brandId: row.brand_id,
      isoWeek: row.iso_week,
      insight: row.insight,
      metric,
      metricRaw: row.supporting_metric,
      sourceTable: row.source_table,
      generatedAt: row.generated_at,
      review: reviewInsight({ insight: row.insight, metric }),
    });
  }
  return { rows, unknownFunctions: [...unknown].sort(), returned: data.length };
}

/**
 * Brand ids to brand names, for the sub-headings.
 *
 * dim_brand carries the identical read policy to downstream_handoff -- group
 * CMPO and CoE admin see every brand, everybody else sees their own -- so
 * this lookup can never widen what the screen shows; it only turns "SPD" into
 * "SpeedStyle". A failed lookup degrades to the id rather than failing the
 * screen, because the id is still a true identifier.
 */
export async function getBrandNames(
  sb: StyleverseClient,
): Promise<Record<string, string>> {
  const { data, error } = await sb.from("dim_brand").select("brand_id, brand_name");
  if (error) return {};
  const names: Record<string, string> = {};
  for (const row of data) {
    if (row.brand_name) names[row.brand_id] = row.brand_name;
  }
  return names;
}

/**
 * Category ids to category names, for the completeness table.
 *
 * dim_category is readable by any authenticated user -- it is a label table
 * and carries nothing brand-specific -- so this can only ever turn "ACTV"
 * into "Activewear". It never decides which rows appear.
 */
export async function getCategoryNames(
  sb: StyleverseClient,
): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("dim_category")
    .select("category_id, category_name");
  if (error) return {};
  const names: Record<string, string> = {};
  for (const row of data) {
    if (row.category_name) names[row.category_id] = row.category_name;
  }
  return names;
}

// ------------------------------------------------------------ the thresholds

export type ThresholdParameter = {
  paramName: string;
  brandId: string | null;
  computedValue: number | null;
  appliedValue: number | null;
  basis: string | null;
  overrideReason: string | null;
};

/**
 * The policy rows behind the thresholds the handoff sentences quote.
 *
 * policy_parameter's read policy is `true` -- any authenticated user reads
 * EVERY brand's thresholds. That is fine for a governance table and wrong for
 * this screen, which would otherwise print a threshold for a brand whose
 * insights row level security has already withheld. So the brand list here is
 * derived from the handoff rows that came back, not from the reader's role:
 * the thresholds shown are the thresholds behind the sentences shown, and
 * nothing else.
 */
export async function getThresholdParameters(
  sb: StyleverseClient,
  brandIds: readonly string[],
): Promise<ThresholdParameter[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await sb
    .from("policy_parameter")
    .select("param_name, brand_id, computed_value, applied_value, basis, override_reason")
    .in("brand_id", [...brandIds])
    .order("param_name", { ascending: true });

  // A missing derivation costs the ledger its "why" column and nothing else,
  // so this degrades rather than taking the screen down with it.
  if (error) return [];
  return data.map((row) => ({
    paramName: row.param_name,
    brandId: row.brand_id,
    computedValue: row.computed_value,
    appliedValue: row.applied_value,
    basis: row.basis,
    overrideReason: row.override_reason,
  }));
}

/**
 * Where a threshold quoted inside a handoff sentence has its derivation
 * recorded. "unrecorded" is a real and useful answer: a cut-off that appears
 * in the prose and nowhere else is a number nobody can argue with, and the
 * screen says so rather than implying the whole set is governed.
 */
export type ThresholdSource = "policy_parameter" | "dim_channel" | "unrecorded";

export type ThresholdUse = {
  key: string;
  label: string;
  /** Distinct values quoted across the rows on screen, exactly as stored. */
  values: string[];
  unit: "fraction" | "weeks" | "plain";
  rowCount: number;
  source: ThresholdSource;
  /** The policy rows that record the derivation, where there are any. */
  params: ThresholdParameter[];
};

type ThresholdDef = {
  key: string;
  label: string;
  unit: ThresholdUse["unit"];
  source: ThresholdSource;
  match: (paramName: string) => boolean;
};

/**
 * The threshold keys the pipeline writes into supporting_metric, and where
 * each one's derivation lives. Keys, not values: every number in the ledger
 * is read off the rows on screen and off policy_parameter.
 */
const THRESHOLD_DEFS: readonly ThresholdDef[] = [
  {
    key: "floor",
    label: "Availability floor",
    unit: "fraction",
    source: "policy_parameter",
    match: (name) => name === "availability_floor",
  },
  {
    key: "floor_weeks",
    label: "Store cover floor",
    unit: "weeks",
    source: "policy_parameter",
    match: (name) => name.startsWith("stockout_floor_"),
  },
  {
    key: "lead_time_weeks",
    label: "Channel lead time",
    unit: "weeks",
    source: "dim_channel",
    match: () => false,
  },
  {
    key: "min_actionable_corr",
    label: "Signal correlation cut",
    unit: "plain",
    source: "unrecorded",
    match: () => false,
  },
];

export function thresholdUses(
  rows: readonly HandoffRow[],
  params: readonly ThresholdParameter[],
): ThresholdUse[] {
  return THRESHOLD_DEFS.map((def) => {
    const quoting = rows.filter((row) => row.metric[def.key] !== undefined);
    const values = [...new Set(quoting.map((row) => row.metric[def.key]))].sort();
    return {
      key: def.key,
      label: def.label,
      values,
      unit: def.unit,
      rowCount: quoting.length,
      source: def.source,
      params: params.filter((param) => def.match(param.paramName)),
    };
  }).filter((use) => use.rowCount > 0);
}

// ------------------------------------------------------------- the grouping

export type BrandGroup = { brandId: string | null; rows: HandoffRow[] };
export type FunctionGroup = {
  fn: FunctionKey;
  brands: BrandGroup[];
  rows: HandoffRow[];
};

/** Group by function, then by brand, preserving the read order inside each. */
export function groupRows(
  rows: readonly HandoffRow[],
  order: readonly FunctionKey[],
): FunctionGroup[] {
  return order
    .map((fn) => {
      const inFunction = rows.filter((row) => row.fn === fn);
      const brandIds = [...new Set(inFunction.map((row) => row.brandId))].sort(
        (a, b) => (a ?? "").localeCompare(b ?? ""),
      );
      return {
        fn,
        rows: inFunction,
        brands: brandIds.map((brandId) => ({
          brandId,
          rows: inFunction.filter((row) => row.brandId === brandId),
        })),
      };
    })
    .filter((group) => group.rows.length > 0);
}

// ----------------------------------------------- the attribute observations
//
// THE ONE THING ON THIS SCREEN MOST LIKELY TO BE MISREAD.
//
// The DESIGN rows rank attributes by sell-through and by markdown share.
// Everything below computes what those rankings do and do not support, from
// the rows themselves. Nothing here is written down in advance: the spread
// range in the copy, the count of dimensions where the two rankings coincide,
// and the sample behind each are all read off the metric strings, so if the
// pipeline reruns and the spreads change, the sentences change with them.

export type AttributeKind = "sell_through" | "markdown_share";

export type AttributeSpread = {
  rowId: number;
  brandId: string | null;
  /** "fabric", "silhouette", "colour_family". */
  dim: string;
  kind: AttributeKind;
  topLabel: string;
  topValue: number;
  bottomLabel: string;
  bottomValue: number;
  /** The stored ratio where present, otherwise top / bottom. */
  spread: number | null;
  levels: number | null;
  styles: number | null;
  weeks: number | null;
};

function spreadFrom(row: HandoffRow): AttributeSpread | null {
  const { metric } = row;
  const dim = metric.dim;
  if (!dim) return null;

  const sellTop = parseLabelledValue(metric.best);
  const sellBottom = parseLabelledValue(metric.worst);
  const markTop = parseLabelledValue(metric.highest_markdown);
  const markBottom = parseLabelledValue(metric.lowest_markdown);

  const kind: AttributeKind | null = sellTop && sellBottom
    ? "sell_through"
    : markTop && markBottom
      ? "markdown_share"
      : null;
  if (!kind) return null;

  const top = kind === "sell_through" ? sellTop : markTop;
  const bottom = kind === "sell_through" ? sellBottom : markBottom;
  if (!top || !bottom) return null;

  const stored = numberFrom(metric, "spread_ratio");
  return {
    rowId: row.id,
    brandId: row.brandId,
    dim,
    kind,
    topLabel: top.label,
    topValue: top.value,
    bottomLabel: bottom.label,
    bottomValue: bottom.value,
    spread: stored ?? (bottom.value > 0 ? top.value / bottom.value : null),
    levels: numberFrom(metric, "levels"),
    styles: numberFrom(metric, "n_styles"),
    weeks: numberFrom(metric, "weeks"),
  };
}

export function attributeSpreads(rows: readonly HandoffRow[]): AttributeSpread[] {
  return rows
    .filter((row) => row.fn === "DESIGN")
    .map(spreadFrom)
    .filter((spread): spread is AttributeSpread => spread !== null);
}

/**
 * One brand and one dimension, with both rankings side by side.
 *
 * `coincides` is the observation that decides how much the sell-through
 * ranking is worth: when the attribute at the top of sell-through is also the
 * attribute that was discounted hardest, the ranking is at least partly a
 * record of the discount, and reading it as a preference signal would be
 * reading the markdown calendar back as customer demand.
 */
export type DimensionPair = {
  brandId: string | null;
  dim: string;
  sell: AttributeSpread | null;
  markdown: AttributeSpread | null;
  coincides: boolean;
};

export function dimensionPairs(
  spreads: readonly AttributeSpread[],
): DimensionPair[] {
  const keys: string[] = [];
  for (const spread of spreads) {
    const key = `${spread.brandId ?? ""}|${spread.dim}`;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.map((key) => {
    const [brandPart, dim] = key.split("|");
    const brandId = brandPart.length > 0 ? brandPart : null;
    const inPair = spreads.filter(
      (spread) => (spread.brandId ?? "") === brandPart && spread.dim === dim,
    );
    const sell = inPair.find((s) => s.kind === "sell_through") ?? null;
    const markdown = inPair.find((s) => s.kind === "markdown_share") ?? null;
    return {
      brandId,
      dim,
      sell,
      markdown,
      // Compared case-insensitively on the stored label, which is the only
      // identity these rows carry for an attribute level.
      coincides:
        sell !== null &&
        markdown !== null &&
        sell.topLabel.toLowerCase() === markdown.topLabel.toLowerCase(),
    };
  });
}

export type SpreadRange = { min: number; max: number; count: number };

/**
 * The measured sell-through spread across every attribute dimension on
 * screen. This is the number the screen leads with, and it is computed here
 * rather than written down, so it is always the range of the rows a
 * particular reader can actually see.
 */
export function sellThroughRange(
  spreads: readonly AttributeSpread[],
): SpreadRange | null {
  const values = spreads
    .filter((spread) => spread.kind === "sell_through")
    .map((spread) => spread.spread)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

/** The widest evidence base quoted across the sell-through rows on screen. */
export function attributeSample(spreads: readonly AttributeSpread[]): {
  styles: number | null;
  weeks: number | null;
  levels: number | null;
} {
  const pick = (get: (s: AttributeSpread) => number | null): number | null => {
    const values = spreads
      .filter((spread) => spread.kind === "sell_through")
      .map(get)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.max(...values) : null;
  };
  return {
    styles: pick((s) => s.styles),
    weeks: pick((s) => s.weeks),
    levels: pick((s) => s.levels),
  };
}

// ------------------------------------------------------------- the sources

/**
 * The distinct source_table values behind the rows on screen, with how many
 * rows each stands behind.
 */
export function sourceTables(
  rows: readonly HandoffRow[],
): { table: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const table = row.sourceTable ?? "not recorded";
    counts.set(table, (counts.get(table) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([table, count]) => ({ table, count }))
    .sort((a, b) => b.count - a.count || a.table.localeCompare(b.table));
}

/** The most recent generated_at across the rows on screen. */
export function latestGeneratedAt(rows: readonly HandoffRow[]): string | null {
  return (
    rows
      .map((row) => row.generatedAt)
      .filter((value): value is string => typeof value === "string")
      .sort()
      .at(-1) ?? null
  );
}

/** Distinct iso_week values on screen, so the header can name the week. */
export function weeksOnScreen(rows: readonly HandoffRow[]): string[] {
  return [...new Set(rows.map((row) => row.isoWeek))].sort();
}

/** Distinct brands on screen, in a stable order. */
export function brandsOnScreen(rows: readonly HandoffRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.brandId)
        .filter((brandId): brandId is string => typeof brandId === "string"),
    ),
  ].sort();
}

// ------------------------------------------------ the arithmetic, recomputed
//
// WHY A SCREEN RECOMPUTES ITS OWN ROWS.
//
// Two of the four functions receive a number that was arrived at by dividing
// two other numbers in the same row. A pull-forward is a share of a horizon;
// a transfer is the gap between a store's cover and its regional median,
// priced at that store's own sell rate. Both are asserted in the sentence and
// both are checkable from the metric string beside it -- so this screen does
// the division rather than asking the reader to take it on trust.
//
// Nothing here re-derives a figure from the warehouse. Every input is a field
// of the row being checked, which is what makes the check safe: it can
// disagree with the row, and when it does, the disagreement is about
// arithmetic rather than about which of two datasets is fresher.

/** Sum of a metric field across rows, or null if any row is missing it. */
function sumField(rows: readonly HandoffRow[], key: string): number | null {
  let total = 0;
  for (const row of rows) {
    const value = numberFrom(row.metric, key);
    if (value === null) return null;
    total += value;
  }
  return rows.length > 0 ? total : null;
}

export type PullForwardCheck = {
  rowId: number;
  brandId: string | null;
  channel: string;
  leadWeeks: number;
  horizonWeeks: number;
  horizonUnits: number;
  /** The share of the brand requirement this channel carries, as stored. */
  storedShare: number | null;
  storedPullForward: number;
  /** Horizon units x lead weeks / horizon weeks, done here. */
  recomputed: number;
  /** Within a unit of the stored figure, which is rounding rather than doubt. */
  agrees: boolean;
};

/**
 * The channel pull-forward rows, with the division done again.
 *
 * The claim in these sentences is that a lead time eats a fixed slice of the
 * horizon: four weeks of a twelve-week horizon is a third of it, so a third
 * of that channel's units have to be committed before the horizon opens.
 * That is the whole derivation, and it is short enough to show.
 */
export function pullForwardChecks(
  rows: readonly HandoffRow[],
): PullForwardCheck[] {
  const checks: PullForwardCheck[] = [];
  for (const row of rows) {
    if (row.fn !== "MANUFACTURING") continue;
    const channel = row.metric.channel;
    const leadWeeks = numberFrom(row.metric, "lead_time_weeks");
    const horizonWeeks = numberFrom(row.metric, "horizon_weeks");
    const horizonUnits = numberFrom(row.metric, "horizon_units");
    const storedPullForward = numberFrom(row.metric, "pull_forward_units");
    if (
      !channel ||
      leadWeeks === null ||
      horizonWeeks === null ||
      horizonUnits === null ||
      storedPullForward === null ||
      horizonWeeks <= 0
    ) {
      continue;
    }
    const recomputed = (horizonUnits * leadWeeks) / horizonWeeks;
    checks.push({
      rowId: row.id,
      brandId: row.brandId,
      channel,
      leadWeeks,
      horizonWeeks,
      horizonUnits,
      storedShare: numberFrom(row.metric, "demand_share"),
      storedPullForward,
      recomputed,
      // A unit of tolerance, because the pipeline rounds to whole garments
      // and this does not. Anything wider is a disagreement, not a rounding.
      agrees: Math.abs(recomputed - storedPullForward) <= 1,
    });
  }
  return checks;
}

export type RequirementCheck = {
  brandId: string | null;
  /** The capacity row's own total for the horizon. */
  requirementUnits: number | null;
  /** The channel rows' horizons, added up here. */
  channelTotal: number | null;
  /** The channel shares, added up here. One, if the split is exhaustive. */
  shareTotal: number | null;
  channelCount: number;
  agrees: boolean | null;
};

/**
 * Do the channel rows account for the whole requirement?
 *
 * A capacity call that quotes a total and then splits it by channel is only
 * worth acting on if the split is exhaustive. If the parts came to less than
 * the whole, some share of the requirement would have no lead time attached
 * to it and nothing on the screen would say so.
 */
export function requirementChecks(
  rows: readonly HandoffRow[],
): RequirementCheck[] {
  const brandIds = [
    ...new Set(
      rows.filter((row) => row.fn === "MANUFACTURING").map((row) => row.brandId),
    ),
  ];
  return brandIds.map((brandId) => {
    const inBrand = rows.filter(
      (row) => row.fn === "MANUFACTURING" && row.brandId === brandId,
    );
    const total = inBrand.find(
      (row) => row.metric.requirement_units !== undefined,
    );
    const channels = inBrand.filter(
      (row) => row.metric.horizon_units !== undefined,
    );
    const requirementUnits = total
      ? numberFrom(total.metric, "requirement_units")
      : null;
    const channelTotal = sumField(channels, "horizon_units");
    return {
      brandId,
      requirementUnits,
      channelTotal,
      shareTotal: sumField(channels, "demand_share"),
      channelCount: channels.length,
      agrees:
        requirementUnits === null || channelTotal === null
          ? null
          : Math.abs(requirementUnits - channelTotal) <= 1,
    };
  });
}

export type TransferCheck = {
  rowId: number;
  brandId: string | null;
  region: string;
  toStore: string;
  toCover: number;
  fromStore: string;
  fromCover: number;
  median: number;
  movableUnits: number;
  /** The receiving store's own recent sell rate, units a week. */
  toRate: number;
  /** Where the receiving store lands: cover + units moved / its sell rate. */
  coverAfter: number;
  reachesMedian: boolean;
  /** How far short it stops, in weeks and in units at the same rate. */
  shortfallWeeks: number;
  shortfallUnits: number;
};

/**
 * What each proposed transfer actually achieves for the receiving store.
 *
 * The sentence says the move levels both stores TOWARD the regional median,
 * and "toward" is doing real work: some of these moves land the receiving
 * store on the median and some stop short of it. Which is which cannot be
 * seen from the sentence and falls straight out of the arithmetic, so the
 * arithmetic is done.
 *
 * Only the receiving side can be checked. The row carries the receiving
 * store's sell rate and not the donor's, so where a move stops short this
 * cannot say whether the donor's own median floor was the binding constraint
 * or something else was. It says where the receiver lands and stops there.
 */
export function transferChecks(rows: readonly HandoffRow[]): TransferCheck[] {
  const checks: TransferCheck[] = [];
  for (const row of rows) {
    if (row.fn !== "RETAIL_OPS") continue;
    const to = parseLabelledValue(row.metric.to);
    const from = parseLabelledValue(row.metric.from);
    const median = numberFrom(row.metric, "median");
    const movableUnits = numberFrom(row.metric, "movable_units");
    const toRate = numberFrom(row.metric, "to_rate_units_wk");
    const region = row.metric.region;
    if (!to || !from || !region) continue;
    if (median === null || movableUnits === null) continue;
    if (toRate === null || toRate <= 0) continue;

    const coverAfter = to.value + movableUnits / toRate;
    const shortfallWeeks = Math.max(0, median - coverAfter);
    checks.push({
      rowId: row.id,
      brandId: row.brandId,
      region,
      toStore: to.label,
      toCover: to.value,
      fromStore: from.label,
      fromCover: from.value,
      median,
      movableUnits,
      toRate,
      coverAfter,
      // Cover weeks are stored to two decimals, so a recomputed landing point
      // carries about a hundredth of a week of rounding. A twentieth of a week
      // is wider than that and far narrower than any real shortfall here.
      reachesMedian: shortfallWeeks <= 0.05,
      shortfallWeeks,
      shortfallUnits: shortfallWeeks * toRate,
    });
  }
  return checks;
}

/** Retail rows that propose a transfer at all, checkable or not. */
export function transferCandidates(rows: readonly HandoffRow[]): number {
  return rows.filter(
    (row) => row.fn === "RETAIL_OPS" && row.metric.movable_units !== undefined,
  ).length;
}

// --------------------------------------------- what the handoff did not say
//
// Every other panel on this screen asks whether a sentence that is present is
// sound. This one asks the harder question: is a sentence MISSING? A weekly
// handoff is trusted precisely because nobody downstream re-runs the query,
// so a category quietly absent from the campaign calendar is invisible in a
// way a wrong figure is not -- there is nothing on the page to disagree with.
//
// The campaign-window rows are the only set where the complete population is
// knowable from a table this application can read: signal_intelligence holds
// one measured lead and one correlation per brand and category, which is the
// same pair the handoff rows quote.

export type SignalSeries = {
  brandId: string;
  categoryId: string;
  leadWeeks: number | null;
  correlation: number | null;
  isoWeek: string;
};

/**
 * The most recent measured lead per brand and category, in the reader's scope.
 *
 * SCOPE WARNING, AND WHY IT IS SAFE IN THIS DIRECTION.
 * signal_intelligence's read policy is NARROWER than downstream_handoff's: a
 * category-scoped role reads only its own categories, while the handoff rows
 * arrive whole for the brand. So this comparison runs against the series the
 * reader can see, and a reader with a narrow scope will see FEWER candidate
 * series than the handoff covers. That direction only ever hides a gap; it
 * cannot invent one. The panel says so rather than implying completeness.
 *
 * Read newest-first and deduped to one row per series. The fixture holds a
 * series' lead and correlation constant across its weeks, but this takes the
 * latest row rather than relying on that.
 */
export async function getSignalSeries(
  sb: StyleverseClient,
  brandIds: readonly string[],
): Promise<SignalSeries[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await sb
    .from("signal_intelligence")
    .select("brand_id, category_id, iso_week, measured_lead_weeks, lead_correlation")
    .in("brand_id", [...brandIds])
    .order("iso_week", { ascending: false })
    .limit(400);

  // A failed read costs the completeness check and nothing else, so it
  // degrades to an empty set and the panel says the check could not run.
  if (error) return [];

  const seen = new Set<string>();
  const series: SignalSeries[] = [];
  for (const row of data) {
    if (!row.brand_id || !row.category_id) continue;
    const key = `${row.brand_id}|${row.category_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    series.push({
      brandId: row.brand_id,
      categoryId: row.category_id,
      leadWeeks: row.measured_lead_weeks,
      correlation: row.lead_correlation,
      isoWeek: row.iso_week,
    });
  }
  return series;
}

/** The handoff rows that decide a campaign window: the ones quoting the cut. */
export function campaignRows(rows: readonly HandoffRow[]): HandoffRow[] {
  return rows.filter(
    (row) =>
      row.fn === "MARKETING" && row.metric.min_actionable_corr !== undefined,
  );
}

/**
 * The correlation cut, read off the rows that quote it.
 *
 * Null when the rows on screen quote more than one value. Picking one would
 * be inventing the threshold this screen exists to trace.
 */
export function correlationCut(rows: readonly HandoffRow[]): number | null {
  const values = [
    ...new Set(campaignRows(rows).map((row) => row.metric.min_actionable_corr)),
  ];
  if (values.length !== 1) return null;
  const parsed = Number.parseFloat(values[0] ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export type CoverageRow = {
  brandId: string;
  categoryId: string;
  leadWeeks: number | null;
  correlation: number | null;
  /** Clears the cut AND leads demand by at least a week. Null without a cut. */
  qualifies: boolean | null;
  /** The handoff row that names this category, if one does. */
  namedIn: number | null;
};

/**
 * Every signal series in scope, against the campaign rows that name it.
 *
 * A category counts as named if it appears as a metric key, as the row's
 * `category` value, or as a whole word in the sentence. Three ways of looking
 * because the pipeline writes single-category rows and grouped rows in
 * different shapes, and a category found by any of them is one the reader was
 * told about.
 */
/**
 * A whole-word mention of a category code in free text.
 *
 * Written without a regular expression on purpose: the needle is a value
 * read from the database, and building a pattern out of stored text is how a
 * page ends up throwing on a row somebody added later.
 */
function mentionsWord(text: string, word: string): boolean {
  if (word.length === 0) return false;
  const isWordChar = (ch: string | undefined): boolean =>
    ch !== undefined && /[A-Za-z0-9_]/.test(ch);
  let from = 0;
  for (;;) {
    const at = text.indexOf(word, from);
    if (at === -1) return false;
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + word.length])) {
      return true;
    }
    from = at + 1;
  }
}

export function signalCoverage(
  rows: readonly HandoffRow[],
  series: readonly SignalSeries[],
  cut: number | null,
): CoverageRow[] {
  const campaign = campaignRows(rows);
  return series
    .map((entry) => {
      const code = entry.categoryId;
      const naming = campaign.find(
        (row) =>
          (row.brandId ?? "") === entry.brandId &&
          (row.metric[code.toLowerCase()] !== undefined ||
            row.metric.category === code ||
            mentionsWord(row.insight, code)),
      );
      return {
        brandId: entry.brandId,
        categoryId: code,
        leadWeeks: entry.leadWeeks,
        correlation: entry.correlation,
        qualifies:
          cut === null || entry.correlation === null || entry.leadWeeks === null
            ? null
            : entry.correlation >= cut && entry.leadWeeks > 0,
        namedIn: naming?.id ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.brandId.localeCompare(b.brandId) ||
        a.categoryId.localeCompare(b.categoryId),
    );
}
