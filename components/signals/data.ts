// Server-side reads for /signals, and the fold from rows into the shapes the
// panels render.
//
// WHY THE BRAND FILTER IS ABSENT
// ------------------------------
// lib/queries exposes getSignalIntelligence(sb, brandId), which pins
// .eq("brand_id", brandId). That is the right shape for a screen that has
// already chosen a brand, and the wrong one here: signal_intelligence's read
// policy hands a group CMPO or a CoE administrator BOTH brands, and pinning
// the session planner's own brand_id would quietly hide the second one from
// somebody entitled to it. So the select below carries no brand predicate at
// all and lets row level security decide the scope, exactly as the learning
// roll-up does. A category planner still reads only the categories on their
// planner record, because the same policy says so.
//
// Everything takes the client as an argument, like lib/queries, so the caller
// decides whose RLS applies. The page passes createServerAnonClient().

import type { StyleverseClient } from "@/lib/supabase";

import {
  asTrendBand,
  SIGNAL_KINDS,
  TREND_BANDS,
  type BandBoundary,
  type GateRule,
  type SignalKind,
  type SignalPair,
  type SignalScope,
  type SignalWeek,
  type TrendBand,
} from "./types";

/** Rows per request when walking a table that can exceed one page. */
const PAGE_SIZE = 1000;

/** Hard stop on the pager. Twelve pairs of 104 weeks fit in two pages. */
const MAX_PAGES = 20;

const SIGNAL_COLUMNS =
  "brand_id, category_id, iso_week, week_start, search_interest_index, social_trend_index, competitor_activity_index, competitor_price_index, trend_momentum, trend_confidence_band, measured_lead_weeks, lead_correlation";

type ReadResult<T> = {
  data: T[] | null;
  error: { message: string; hint?: string | null } | null;
};

function fail(what: string, error: { message: string; hint?: string | null }): never {
  const hint = error.hint ? ` (${error.hint})` : "";
  throw new Error(`StyleVerse: ${what} failed -- ${error.message}${hint}`);
}

/** Walk .range() until a short page comes back. */
async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<ReadResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) fail(what, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * numeric arrives from PostgREST as a number, but a driver or a view can
 * hand back the string form. Coerce narrowly; anything unparseable is null,
 * which every renderer prints as a dash rather than as a zero.
 */
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function int(value: unknown): number | null {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
}

// =============================================================== label reads

export type Labels = {
  brand: Record<string, string>;
  category: Record<string, string>;
};

const EMPTY_LABELS: Labels = { brand: {}, category: {} };

/**
 * Names for the two dimensions a pair is keyed by.
 *
 * A missing label is cosmetic -- the id is still a true identifier -- so a
 * failed lookup degrades to the id rather than failing the screen. dim_brand
 * is itself brand-scoped, so a planner gets one name back and that is
 * correct, not a partial read.
 */
export async function getLabels(sb: StyleverseClient): Promise<Labels> {
  const [brands, categories] = await Promise.all([
    sb.from("dim_brand").select("brand_id, brand_name"),
    sb.from("dim_category").select("category_id, category_name"),
  ]);

  if (brands.error || categories.error) return EMPTY_LABELS;

  const labels: Labels = { brand: {}, category: {} };
  for (const row of brands.data) {
    if (row.brand_name) labels.brand[row.brand_id] = row.brand_name;
  }
  for (const row of categories.data) {
    if (row.category_name) labels.category[row.category_id] = row.category_name;
  }
  return labels;
}

// ================================================================ gate rules

/** Pull `key=value` out of a downstream_handoff supporting_metric string. */
function readMetric(metric: string | null, key: string): string | null {
  if (!metric) return null;
  for (const part of metric.split(";")) {
    const [name, ...rest] = part.split("=");
    if (name?.trim() === key) {
      const value = rest.join("=").trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * THE ADMISSION THRESHOLD, READ RATHER THAN TYPED.
 *
 * The pipeline that measured the leads also writes the bar it applied them
 * against into downstream_handoff.supporting_metric, as
 * `min_actionable_corr=0.3`, on the MARKETING rows it derives from
 * `signals_cat + grain`. Reading it back from there means the gate this
 * screen draws is the gate the pipeline drew, and the two cannot drift --
 * which a constant in the web app could not promise.
 *
 * Returned per brand, because nothing guarantees the two brands were scored
 * against the same bar and a screen that averaged them would be inventing a
 * threshold neither run used. A brand with no readable row simply has no
 * entry, and the pairs under it are marked "no gate" rather than passed or
 * failed.
 */
export async function getGateRules(
  sb: StyleverseClient,
): Promise<Record<string, GateRule>> {
  const { data, error } = await sb
    .from("downstream_handoff")
    .select("brand_id, iso_week, insight, supporting_metric, source_table, generated_at")
    .eq("function", "MARKETING")
    .order("generated_at", { ascending: false });

  if (error) fail("getGateRules(downstream_handoff)", error);

  const rules: Record<string, GateRule> = {};
  for (const row of data ?? []) {
    const brandId = row.brand_id;
    if (!brandId || rules[brandId]) continue;

    const threshold = num(readMetric(row.supporting_metric, "min_actionable_corr"));
    if (threshold === null) continue;

    rules[brandId] = {
      brandId,
      minCorrelation: threshold,
      leadSignal: readMetric(row.supporting_metric, "signal"),
      sourceTable: row.source_table,
      isoWeek: row.iso_week,
      generatedAt: row.generated_at,
    };
  }
  return rules;
}

// ============================================================ the signal read

type SignalRow = {
  brand_id: string | null;
  category_id: string | null;
  iso_week: string;
  week_start: string;
  search_interest_index: number | null;
  social_trend_index: number | null;
  competitor_activity_index: number | null;
  competitor_price_index: number | null;
  trend_momentum: number | null;
  trend_confidence_band: string | null;
  measured_lead_weeks: number | null;
  lead_correlation: number | null;
};

/**
 * Every signal week the caller is entitled to read, oldest first within each
 * brand-category.
 *
 * The order is (brand, category, week) and that triple is unique, so the
 * .range() walk cannot skip or repeat a row between pages.
 */
export async function getSignalWeeks(sb: StyleverseClient): Promise<SignalRow[]> {
  return readAll<SignalRow>("getSignalWeeks(signal_intelligence)", (from, to) =>
    sb
      .from("signal_intelligence")
      .select(SIGNAL_COLUMNS)
      .order("brand_id", { ascending: true })
      .order("category_id", { ascending: true })
      .order("week_start", { ascending: true })
      .range(from, to),
  );
}

// ===================================================================== fold

/**
 * The band boundary, recovered from the rows rather than read from a
 * threshold table -- because there is no threshold table.
 *
 * trend_confidence_band and trend_momentum both arrive from the case
 * dataset's own signals sheet; the pipeline copies them across untouched and
 * publishes no rule connecting the two. So the screen brackets it: the
 * lowest momentum on any week the fixture called High, the highest on any
 * week it called Low, and the range the Medium weeks never leave. If the
 * three do not overlap, the boundary is pinned between the brackets and a
 * planner can predict the band from the momentum. If they DO overlap,
 * `separable` is false and the screen says the rows do not support the claim
 * rather than quoting a boundary that the data contradicts.
 */
export function recoverBoundary(pairs: readonly SignalPair[]): BandBoundary {
  let weeks = 0;
  let highFloor: number | null = null;
  let mediumCeiling: number | null = null;
  let mediumFloor: number | null = null;
  let lowCeiling: number | null = null;

  for (const pair of pairs) {
    for (const week of pair.weeks) {
      if (week.band === null || week.momentum === null) continue;
      weeks += 1;
      const m = week.momentum;
      if (week.band === "High") {
        if (highFloor === null || m < highFloor) highFloor = m;
      } else if (week.band === "Low") {
        if (lowCeiling === null || m > lowCeiling) lowCeiling = m;
      } else {
        if (mediumCeiling === null || m > mediumCeiling) mediumCeiling = m;
        if (mediumFloor === null || m < mediumFloor) mediumFloor = m;
      }
    }
  }

  const separable =
    highFloor !== null &&
    mediumCeiling !== null &&
    mediumFloor !== null &&
    lowCeiling !== null &&
    lowCeiling < mediumFloor &&
    mediumCeiling < highFloor;

  return { weeks, highFloor, mediumCeiling, mediumFloor, lowCeiling, separable };
}

function emptyBandCounts(): Record<TrendBand, number> {
  return { High: 0, Medium: 0, Low: 0 };
}

/**
 * Fold the flat week rows into one object per brand-category.
 *
 * measured_lead_weeks and lead_correlation are stamped on every week of a
 * pair by the pipeline -- the lead is measured once over full history and
 * broadcast, so the chart and the headline cannot disagree. This takes the
 * first non-null it sees and, if a later week ever disagreed, drops both to
 * null rather than picking a winner: a pair whose own rows cannot agree on
 * its lead has not measured one.
 */
export function foldPairs(
  rows: readonly SignalRow[],
  labels: Labels,
): SignalPair[] {
  const byKey = new Map<string, SignalPair>();
  const conflicted = new Set<string>();

  for (const row of rows) {
    const brandId = row.brand_id;
    const categoryId = row.category_id;
    if (!brandId || !categoryId) continue;

    const key = `${brandId}|${categoryId}`;
    let pair = byKey.get(key);
    if (!pair) {
      pair = {
        key,
        brandId,
        brandName: labels.brand[brandId] ?? brandId,
        categoryId,
        categoryName: labels.category[categoryId] ?? categoryId,
        leadWeeks: int(row.measured_lead_weeks),
        correlation: num(row.lead_correlation),
        weeks: [],
        bandCounts: emptyBandCounts(),
        currentBand: null,
        currentWeek: null,
        currentMomentum: null,
      };
      byKey.set(key, pair);
    } else {
      const lead = int(row.measured_lead_weeks);
      const corr = num(row.lead_correlation);
      const leadDiffers = lead !== null && pair.leadWeeks !== null && lead !== pair.leadWeeks;
      const corrDiffers =
        corr !== null && pair.correlation !== null && corr !== pair.correlation;
      if (leadDiffers || corrDiffers) conflicted.add(key);
      if (pair.leadWeeks === null) pair.leadWeeks = lead;
      if (pair.correlation === null) pair.correlation = corr;
    }

    const band = asTrendBand(row.trend_confidence_band);
    const week: SignalWeek = {
      isoWeek: row.iso_week,
      weekStart: row.week_start,
      search: num(row.search_interest_index),
      social: num(row.social_trend_index),
      competitorActivity: num(row.competitor_activity_index),
      competitorPrice: num(row.competitor_price_index),
      momentum: num(row.trend_momentum),
      band,
    };
    pair.weeks.push(week);
    if (band !== null) pair.bandCounts[band] += 1;
  }

  for (const [key, pair] of byKey) {
    if (conflicted.has(key)) {
      pair.leadWeeks = null;
      pair.correlation = null;
    }
    // The read is already ordered by week_start, but a fold that assumed it
    // would break silently if the order ever changed, and "the latest week"
    // is the band in force.
    pair.weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const latest = pair.weeks[pair.weeks.length - 1];
    pair.currentBand = latest?.band ?? null;
    pair.currentWeek = latest?.isoWeek ?? null;
    pair.currentMomentum = latest?.momentum ?? null;
  }

  return [...byKey.values()].sort(
    (a, b) =>
      (b.correlation ?? -Infinity) - (a.correlation ?? -Infinity) ||
      a.brandId.localeCompare(b.brandId) ||
      a.categoryId.localeCompare(b.categoryId),
  );
}

/** Which of the four series actually carry a value somewhere in scope. */
function populatedKinds(pairs: readonly SignalPair[]): SignalKind[] {
  const seen = new Set<SignalKind>();
  for (const pair of pairs) {
    for (const week of pair.weeks) {
      if (week.search !== null) seen.add("search");
      if (week.social !== null) seen.add("social");
      if (week.competitorActivity !== null) seen.add("competitorActivity");
      if (week.competitorPrice !== null) seen.add("competitorPrice");
    }
  }
  return SIGNAL_KINDS.filter((meta) => seen.has(meta.kind)).map((meta) => meta.kind);
}

/**
 * Everything the screen needs, read once.
 *
 * The gate read is separate from the signal read on purpose. A screen that
 * lost every measured lead because the handoff table was unreadable would be
 * withholding the evidence over a missing threshold; instead the gate falls
 * away, the leads and correlations still render, and the panels say that no
 * pair can be marked passed or failed until the threshold is readable again.
 */
export async function readSignalScope(sb: StyleverseClient): Promise<SignalScope> {
  const [rows, labels, gates] = await Promise.all([
    getSignalWeeks(sb),
    getLabels(sb),
    getGateRules(sb).catch(() => ({}) as Record<string, GateRule>),
  ]);

  const pairs = foldPairs(rows, labels);

  const weekCounts = [...new Set(pairs.map((pair) => pair.weeks.length))].sort(
    (a, b) => a - b,
  );

  let firstWeek: string | null = null;
  let lastWeek: string | null = null;
  for (const pair of pairs) {
    const first = pair.weeks[0]?.isoWeek ?? null;
    const last = pair.weeks[pair.weeks.length - 1]?.isoWeek ?? null;
    if (first !== null && (firstWeek === null || first < firstWeek)) firstWeek = first;
    if (last !== null && (lastWeek === null || last > lastWeek)) lastWeek = last;
  }

  return {
    pairs,
    gates,
    boundary: recoverBoundary(pairs),
    populated: populatedKinds(pairs),
    weekCounts,
    firstWeek,
    lastWeek,
  };
}

// ============================================================== small helpers

/** Band totals across every pair in scope. */
export function totalBandCounts(
  pairs: readonly SignalPair[],
): Record<TrendBand, number> {
  const totals = emptyBandCounts();
  for (const pair of pairs) {
    for (const band of TREND_BANDS) totals[band] += pair.bandCounts[band];
  }
  return totals;
}

/** The weakest band in force anywhere in scope. Drives the ModelStrip. */
export function weakestCurrentBand(
  pairs: readonly SignalPair[],
): TrendBand | undefined {
  const bands = new Set(pairs.map((pair) => pair.currentBand));
  if (bands.has("Low")) return "Low";
  if (bands.has("Medium")) return "Medium";
  if (bands.has("High")) return "High";
  return undefined;
}

/** The strongest measured lead in scope, with the correlation that earned it. */
export function strongestPair(pairs: readonly SignalPair[]): SignalPair | null {
  let best: SignalPair | null = null;
  for (const pair of pairs) {
    if (pair.correlation === null) continue;
    if (best === null || Math.abs(pair.correlation) > Math.abs(best.correlation ?? 0)) {
      best = pair;
    }
  }
  return best;
}
