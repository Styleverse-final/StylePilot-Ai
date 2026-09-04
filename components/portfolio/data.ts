// Server-side reads for the portfolio screen, and the shaping the panels
// need. Everything takes the Supabase client as its first argument, exactly
// like lib/queries, so the caller decides whose row level security applies.
// The page passes createServerAnonClient(): the CMPO's own session cookie.
//
// WHY THESE READS ARE HERE AND NOT IN lib/queries
// -----------------------------------------------
// lib/queries scopes almost everything to a single brand, because almost
// every screen belongs to a single brand. A group CMPO does not: their scope
// is whatever dim_brand hands back, which is two rows under the current
// policies and would be more if a third brand entered the pilot. These reads
// take a LIST of brand ids and let the policy decide the rest. The brand
// filter narrows within what row level security already permits; it never
// widens, and there is no service-role client anywhere in this file.
//
// PAGING
// ------
// Two of these reads can exceed a single PostgREST page. Rather than pick a
// window small enough to fit and quietly under-report, they page explicitly
// and carry a `truncated` flag out to the screen, which says so in words. A
// panel that silently showed nine weeks of a twelve-week window would be the
// exact failure this file exists to avoid.

import type { AccuracyHeadline } from "@/lib/accuracy";
import { getModelRegistry, getValueSummary } from "@/lib/queries";
import type { ModelRegistryEntry, RecType, ValueSummary } from "@/lib/queries";
import type { StyleverseClient } from "@/lib/supabase";

import type {
  AdoptionFinding,
  AdoptionRow,
  BenchmarkRow,
  BrandRow,
  CategoryEvidence,
  ConcentrationRow,
  CoverageRow,
  GridRow,
  HorizonView,
  MarkdownRecRow,
  MarkdownView,
  PortfolioScope,
  UndecidedGroup,
  UndecidedRow,
  UndecidedView,
  ValueRow,
  ValueView,
} from "./types";
import { humanise } from "./format";

// ------------------------------------------------------------------ plumbing

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Rows per request. PostgREST caps its own page; this never exceeds it. */
const PAGE_ROWS = 1000;

/**
 * Read every row a filter matches, one page at a time.
 *
 * Stops at `maxRows` and reports it rather than looping forever, so a
 * mis-scoped filter degrades into a stated truncation instead of a hung
 * request. `truncated` reaches the screen; nothing silently disappears.
 */
async function readPaged<T>(
  what: string,
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_ROWS) {
    const to = Math.min(from + PAGE_ROWS, maxRows) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`StyleVerse: ${what} failed -- ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function labelOf(map: Record<string, string>, id: string | null): string {
  if (!id) return "Unassigned";
  return map[id] ?? id;
}

// --------------------------------------------------------------------- scope

/**
 * The brands this session may read, straight from dim_brand.
 *
 * This is the brand switcher's entire authority. dim_brand's read policy
 * hands every row to a group CMPO and one row to everybody else, so the
 * switcher appears when more than one comes back and does not otherwise.
 * The page never inspects the role string to decide what to render; if the
 * policy changed, the switcher would change with it.
 */
export async function readBrands(sb: StyleverseClient): Promise<BrandRow[]> {
  const { data, error } = await sb
    .from("dim_brand")
    .select("brand_id, brand_name, gross_margin, positioning")
    .order("brand_id", { ascending: true });

  if (error) throw new Error(`StyleVerse: readBrands failed -- ${error.message}`);
  return (data ?? []).map((row) => ({
    brandId: row.brand_id,
    brandName: row.brand_name ?? row.brand_id,
    grossMargin: row.gross_margin,
    positioning: row.positioning,
  }));
}

/**
 * Resolve ?brand= against what row level security returned.
 *
 * The URL is a request, not an authority. A brand that is not in the
 * readable set resolves to the full scope and sets `requestedOutOfScope`, so
 * the screen can say the URL asked for something this session cannot read
 * instead of silently showing a different brand's figures under the
 * requested brand's name.
 */
export function resolveScope(
  brands: BrandRow[],
  requestedRaw: string | string[] | undefined,
): PortfolioScope {
  const requested =
    typeof requestedRaw === "string" && requestedRaw.length > 0
      ? requestedRaw
      : Array.isArray(requestedRaw)
        ? (requestedRaw[0] ?? null)
        : null;

  const match = requested
    ? (brands.find((brand) => brand.brandId === requested) ?? null)
    : null;

  return {
    brands,
    requested,
    selected: match?.brandId ?? null,
    requestedOutOfScope: requested !== null && match === null,
    brandIds: match ? [match.brandId] : brands.map((brand) => brand.brandId),
  };
}

// -------------------------------------------------------------------- labels

export type Labels = {
  category: Record<string, string>;
  region: Record<string, string>;
  brand: Record<string, string>;
};

/**
 * Display names. dim_category and dim_region are readable to every
 * authenticated user, so this never narrows what the screen can show -- it
 * only turns "IN-S" into words. A missing name falls through to the id,
 * which is still a true identifier.
 */
export async function readLabels(
  sb: StyleverseClient,
  brands: BrandRow[],
): Promise<Labels> {
  const [categories, regions] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  const labels: Labels = { category: {}, region: {}, brand: {} };
  for (const row of categories.data ?? []) {
    if (row.category_name) labels.category[row.category_id] = row.category_name;
  }
  for (const row of regions.data ?? []) {
    if (row.region_name) labels.region[row.region_id] = row.region_name;
  }
  for (const brand of brands) labels.brand[brand.brandId] = brand.brandName;
  return labels;
}

// --------------------------------------------------------------------- value

function toValueRow(row: ValueSummary, labels: Labels): ValueRow {
  const brandId = row.brand_id;
  return {
    scope: row.scope,
    brandId,
    label:
      row.scope === "PORTFOLIO"
        ? "Portfolio"
        : brandId
          ? (labels.brand[brandId] ?? brandId)
          : "Unattributed",
    markdownAvoidedInr: row.markdown_avoided_margin_inr,
    lostSalesRecoveredInr: row.lost_sales_recovered_margin_inr,
    totalMarginInr: row.total_margin_inr,
    unitChangePct: row.unit_change_pct,
    holdingCostInr: row.holding_cost_change_inr,
    basis: row.basis,
  };
}

/**
 * The margin bridge's rows, plus the scope check on the group total.
 *
 * The group row is readable by everyone, so its presence proves nothing
 * about scope. What proves it is arithmetic: if the group total does not
 * equal the sum of the brand rows this session can read, then it sums brands
 * this session cannot see, and the screen headlines the brand instead. One
 * rupee of tolerance, because these are stored to the rupee.
 */
export async function readValue(
  sb: StyleverseClient,
  scope: PortfolioScope,
  labels: Labels,
): Promise<ValueView> {
  const rows = await getValueSummary(sb);

  const portfolioRaw = rows.find((row) => row.scope === "PORTFOLIO") ?? null;
  const brandRows = rows
    .filter((row) => row.scope !== "PORTFOLIO")
    .filter((row) => row.brand_id !== null && scope.brandIds.includes(row.brand_id))
    .map((row) => toValueRow(row, labels));

  const portfolio = portfolioRaw ? toValueRow(portfolioRaw, labels) : null;

  const brandSum = brandRows.reduce(
    (total, row) => total + num(row.totalMarginInr),
    0,
  );
  const portfolioCoversScope =
    portfolio !== null &&
    brandRows.length > 0 &&
    Math.abs(num(portfolio.totalMarginInr) - brandSum) < 1;

  const headline = portfolioCoversScope
    ? portfolio
    : (brandRows[0] ?? portfolio ?? null);

  return { portfolio, brands: brandRows, portfolioCoversScope, headline };
}

// ------------------------------------------------------------------ horizon

/**
 * Where the realised history stops and the forward window starts.
 *
 * Both ends are read rather than assumed, because a sentence on this screen
 * depends on them: there are no stored predictions overlapping the actuals,
 * which is why no per-category accuracy can be recomputed here. If a future
 * pipeline run published a backtest into the forecast table, this would stop
 * reporting no overlap and the sentence beside it would change with it.
 */
export async function readHorizon(sb: StyleverseClient): Promise<HorizonView> {
  const [horizon, first, last, fact] = await Promise.all([

    sb
      .from("forecast")
      .select("horizon_week")
      .order("horizon_week", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("forecast")
      .select("iso_week, week_start")
      .order("week_start", { ascending: true })
      .limit(1)
      .maybeSingle(),
    sb
      .from("forecast")
      .select("iso_week, week_start")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("fact_demand_weekly")
      .select("iso_week, week_start")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const forecastFirstWeek = first.data?.iso_week ?? null;
  const forecastLastWeek = last.data?.iso_week ?? null;
  const factLastWeek = fact.data?.iso_week ?? null;
  const firstStart = first.data?.week_start ?? null;
  const factStart = fact.data?.week_start ?? null;

  // The count that turns "there is no overlap" from an inference into a
  // measurement: stored predictions dated on or before the last realised
  // week are the only ones a per-category backtest could be scored on.
  // head:true so this costs a count and no rows.
  let overlapRows: number | null = null;
  if (factStart !== null) {
    const { count, error } = await sb
      .from("forecast")
      .select("id", { count: "exact", head: true })
      .lte("week_start", factStart);
    overlapRows = error ? null : (count ?? 0);
  }

  return {
    horizonWeeks: horizon.data?.horizon_week ?? null,
    forecastFirstWeek,
    forecastLastWeek,
    factLastWeek,
    overlapRows,
    // Compared on week_start, which is a date, rather than on the ISO week
    // string, which sorts wrongly across a year boundary.
    noOverlap: firstStart !== null && factStart !== null && firstStart > factStart,
  };
}

// ------------------------------------------------------------------ accuracy

/** The planning-grain registry rows, for the raw metrics the headline drops. */
export async function readRegistry(
  sb: StyleverseClient,
): Promise<ModelRegistryEntry[]> {
  const rows = await getModelRegistry(sb);
  return rows.filter((row) => row.model_id.endsWith("_planning_grain"));
}

/**
 * Does the registry publish accuracy broken down by category anywhere?
 *
 * Asked of the rows rather than asserted. The screen states that the batch
 * scorer published accuracy at brand level only, and that claim is worth
 * nothing if it is a comment: this checks every key on every planning-grain
 * metrics object, so the day a by_category block appears the sentence
 * changes instead of becoming a lie.
 */
export function categoryKeysInRegistry(
  entries: readonly ModelRegistryEntry[],
): string[] {
  const found = new Set<string>();
  for (const entry of entries) {
    for (const key of Object.keys(entry.metrics)) {
      if (/categor/i.test(key)) found.add(key);
    }
  }
  return [...found].sort();
}

/** Raw, pre-calibration p10-p90 coverage, per brand. Never interval quality. */
export function rawCoverage(
  entries: readonly ModelRegistryEntry[],
  brandId: string,
): number | null {
  const entry = entries.find((row) => row.model_id.startsWith(brandId));
  const value = entry?.metrics.p10_p90_coverage;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The four benchmarks the batch scorer published, hardest to beat first.
 *
 * PART H, and the reason this function exists rather than a literal array in
 * a component: every percentage here comes off the AccuracyHeadline, which
 * is the only object in the app that carries an accuracy figure, and each
 * row travels with the margin the model holds over it. There is no row for
 * the model itself -- the headline reaches the screen through
 * <AccuracyStatement/> and through nothing else, so this ladder can only
 * ever say "how much better, and than what".
 *
 * The order is by benchmark strength, computed, not authored. The manual
 * baseline lands wherever its number puts it -- which on this data is last,
 * below all three unconstructed benchmarks. That position is the argument:
 * a baseline easier to beat than a seasonal naive forecast is a baseline
 * that was authored, and the note says so.
 */
export function benchmarkRows(accuracy: AccuracyHeadline): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [
    {
      key: "seasonal_naive",
      label: "Seasonal naive",
      pct: accuracy.seasonalNaivePct,
      marginPoints: accuracy.vsSeasonalNaivePoints,
      authored: false,
      note: "Last year's same week, carried forward. Nobody constructed it, it is the hardest of the four to beat, and this margin is the one that proves the model works.",
    },
    {
      key: "rolling_13",
      label: "13-week rolling mean",
      pct: accuracy.rolling13Pct,
      marginPoints:
        Math.round((accuracy.headlinePct - accuracy.rolling13Pct) * 10) / 10,
      authored: false,
      note: "The mean of the last thirteen weeks. A planner's mental arithmetic, and roughly what a spreadsheet does by default.",
    },
    {
      key: "drift",
      label: "Drift",
      pct: accuracy.driftPct,
      marginPoints:
        Math.round((accuracy.headlinePct - accuracy.driftPct) * 10) / 10,
      authored: false,
      note: "Last observed level extended along its own recent trend. It has no seasonality at all, which is why it sits below the seasonal benchmark.",
    },
    {
      key: "manual",
      label: "Manual baseline",
      pct: accuracy.manualPct,
      marginPoints: accuracy.vsManualPoints,
      authored: true,
      note: "The plan in the workbook. It was authored by the dataset designer and calibrated by bisection to hit a target, so the size of this margin is a property of the fixture as much as of the model. Read it last.",
    },
  ];
  return rows.sort((a, b) => b.pct - a.pct);
}

/** The evidence behind the refusal to publish a per-category accuracy. */
export function categoryEvidence(
  entries: readonly ModelRegistryEntry[],
): CategoryEvidence {
  return {
    categoryKeys: categoryKeysInRegistry(entries),
    registryRows: entries.length,
  };
}

/**
 * INTERVAL COVERAGE -- the shipped one, and the one that must never be shown
 * as interval quality.
 *
 * model_registry.metrics.p10_p90_coverage is around 56%. It is real, it is
 * in the registry, and it describes the RAW quantile band BEFORE conformal
 * calibration -- a band that was never shipped and that no planner has ever
 * committed stock against. Quoting it as interval quality would understate
 * the product by nearly thirty points and would be describing a different
 * artefact entirely.
 *
 * The band that ships is in policy_parameter under
 * interval_coverage_calibrated. Both are read here, together, so the screen
 * can print the shipped figure and say in the same breath what the other
 * one is and why it differs -- including the fold count, which differs by
 * one because split-conformal calibration fits its widening offset on a
 * PRIOR fold, leaving fold 1 with nothing to calibrate against.
 *
 * policy_parameter's read policy is `true` for any authenticated user, so
 * this returns a row per brand in scope regardless of role; the brand filter
 * narrows to the switcher's selection, nothing more.
 */
export async function readCoverage(
  sb: StyleverseClient,
  scope: PortfolioScope,
  entries: readonly ModelRegistryEntry[],
): Promise<CoverageRow[]> {
  const { data, error } = await sb
    .from("policy_parameter")
    .select("brand_id, param_name, computed_value, applied_value, basis, override_reason")
    .eq("param_name", "interval_coverage_calibrated")
    .in("brand_id", scope.brandIds)
    .order("brand_id", { ascending: true });

  if (error) throw new Error(`StyleVerse: readCoverage failed -- ${error.message}`);

  return (data ?? [])
    .filter((row): row is typeof row & { brand_id: string } => row.brand_id !== null)
    .map((row) => ({
      brandId: row.brand_id,
      // computed_value is the MEASURED coverage; applied_value is the nominal
      // the band was built to. They are not two estimates of one thing.
      calibrated: row.computed_value,
      nominal: row.applied_value,
      raw: rawCoverage(entries, row.brand_id),
      basis: row.basis,
      overrideReason: row.override_reason,
    }));
}

// ------------------------------------------------------------------ markdown

type FactRow = {
  brand_id: string | null;
  category_id: string | null;
  region_id: string | null;
  markdown_loss_inr: number | null;
  net_revenue_inr: number | null;
};

type MarkdownRecRaw = {
  brand_id: string;
  category_id: string;
  style_id: string;
  recommended_depth: number | null;
  recommended_week: number | null;
  margin_saved: number | null;
  projected_leftover_units: number | null;
  timing: string | null;
};

/** Subtract whole weeks from an ISO date, in UTC, without touching a clock. */
function weeksBefore(day: string, weeks: number): string {
  const at = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - weeks * 7);
  return at.toISOString().slice(0, 10);
}

function toConcentration(
  totals: Map<string, { loss: number; revenue: number }>,
  labels: Record<string, string>,
  grandLoss: number,
): ConcentrationRow[] {
  return [...totals.entries()]
    .map(([key, value]) => ({
      key,
      label: labelOf(labels, key),
      lossInr: value.loss,
      revenueInr: value.revenue,
      rate: value.revenue > 0 ? value.loss / value.revenue : null,
      share: grandLoss > 0 ? value.loss / grandLoss : 0,
    }))
    .sort((a, b) => b.lossInr - a.lossInr);
}

/**
 * Markdown concentration: where the exposure sits, by category and region.
 *
 * TWO HALVES FROM TWO TABLES, AND THEY ARE NOT INTERCHANGEABLE.
 *
 * markdown_recommendation carries brand, category and style -- and no
 * region column at all. So the recommended exposure can be broken out by
 * category and only by category. The regional half comes from
 * fact_demand_weekly, which is realised markdown loss: where markdown has
 * actually been landing, not where the optimiser says it will. Allocating
 * the recommended figure across regions by each region's realised share
 * would have produced a fuller-looking grid and a number nobody could
 * source, so it is not done and the screen says why.
 *
 * The trailing window is the same length as the published forward horizon,
 * read from forecast.horizon_week, ending at the last realised week. Neither
 * end is written into this file.
 */
export async function readMarkdown(
  sb: StyleverseClient,
  scope: PortfolioScope,
  labels: Labels,
  horizon: HorizonView,
): Promise<MarkdownView> {
  const lastDay = await sb
    .from("fact_demand_weekly")
    .select("week_start")
    .in("brand_id", scope.brandIds)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const windowWeeks = horizon.horizonWeeks ?? 0;
  const lastWeekStart = lastDay.data?.week_start ?? null;
  const since =
    lastWeekStart && windowWeeks > 0
      ? weeksBefore(lastWeekStart, windowWeeks - 1)
      : null;

  let facts: FactRow[] = [];
  let truncated = false;

  if (since) {
    // AGGREGATED IN THE DATABASE, not here.
    //
    // This used to page fact_demand_weekly through readPaged -- 2,592 rows for
    // a twelve-week window, three sequential HTTP round trips at 1,000 rows a
    // page -- and sum them in the loop below to produce 72 grouped cells. The
    // identical GROUP BY measured 103ms in one statement, so the paging was
    // spending three network round trips to move 2,520 rows that were only
    // ever going to be added together.
    //
    // markdown_concentration() is SECURITY INVOKER, so RLS on
    // fact_demand_weekly still decides which rows it may sum: a planner gets
    // 16 grouped rows for their own brand, a group CMPO gets 72 across both.
    // It returns the same numbers the paged read produced, because the
    // function groups at brand x category x region and every key the loop
    // below folds on is coarser than that.
    const { data, error } = await sb.rpc("markdown_concentration", {
      p_since: since,
    });

    if (error) {
      // Same failure shape as before: the panel says it could not read its
      // rows rather than rendering a total assembled from nothing.
      facts = [];
      truncated = false;
    } else {
      facts = (data ?? []).map((row) => ({
        brand_id: row.brand_id,
        category_id: row.category_id,
        region_id: row.region_id,
        markdown_loss_inr: row.loss_inr,
        net_revenue_inr: row.revenue_inr,
      })) as FactRow[];
      // Nothing is paged now, so nothing can be truncated.
      truncated = false;
    }
  }

  const byCategoryTotals = new Map<string, { loss: number; revenue: number }>();
  const byRegionTotals = new Map<string, { loss: number; revenue: number }>();
  const cells = new Map<string, { loss: number; revenue: number }>();
  // Keyed brand|category, which is the grain markdown_recommendation is
  // written at. This is the only key the two tables share, and it is what
  // lets the recommended exposure sit beside the loss already realised
  // without either being allocated into the other's shape.
  const byBrandCategory = new Map<string, { loss: number; revenue: number }>();
  let totalLossInr = 0;
  let totalRevenueInr = 0;

  for (const row of facts) {
    const category = row.category_id ?? "";
    const region = row.region_id ?? "";
    const loss = num(row.markdown_loss_inr);
    const revenue = num(row.net_revenue_inr);

    totalLossInr += loss;
    totalRevenueInr += revenue;

    const pairKey = `${row.brand_id ?? ""}|${category}`;
    const pair = byBrandCategory.get(pairKey) ?? { loss: 0, revenue: 0 };
    pair.loss += loss;
    pair.revenue += revenue;
    byBrandCategory.set(pairKey, pair);

    const cat = byCategoryTotals.get(category) ?? { loss: 0, revenue: 0 };
    cat.loss += loss;
    cat.revenue += revenue;
    byCategoryTotals.set(category, cat);

    const reg = byRegionTotals.get(region) ?? { loss: 0, revenue: 0 };
    reg.loss += loss;
    reg.revenue += revenue;
    byRegionTotals.set(region, reg);

    const cellKey = `${category}|${region}`;
    const cell = cells.get(cellKey) ?? { loss: 0, revenue: 0 };
    cell.loss += loss;
    cell.revenue += revenue;
    cells.set(cellKey, cell);
  }

  const byCategory = toConcentration(byCategoryTotals, labels.category, totalLossInr);
  const byRegion = toConcentration(byRegionTotals, labels.region, totalLossInr);

  const regions = byRegion.map((row) => ({ id: row.key, label: row.label }));
  const grid: GridRow[] = byCategory.map((category) => ({
    key: category.key,
    label: category.label,
    lossInr: category.lossInr,
    cells: regions.map((region) => {
      const cell = cells.get(`${category.key}|${region.id}`);
      return {
        regionId: region.id,
        lossInr: cell ? cell.loss : 0,
        rate: cell && cell.revenue > 0 ? cell.loss / cell.revenue : null,
      };
    }),
  }));

  // The optimiser side. No region column exists on this table, which is the
  // whole reason the two halves of this panel are read differently.
  const { data: recData, error: recError } = await sb
    .from("markdown_recommendation")
    .select(
      "brand_id, category_id, style_id, recommended_depth, recommended_week, margin_saved, projected_leftover_units, timing",
    )
    .in("brand_id", scope.brandIds)
    .order("margin_saved", { ascending: false, nullsFirst: false });

  if (recError) {
    throw new Error(`StyleVerse: readMarkdown recommendations failed -- ${recError.message}`);
  }

  const recRows = (recData ?? []) as MarkdownRecRaw[];

  // "Act now" is whatever timing value the optimiser wrote against the
  // earliest recommended week in the rows on screen -- not a string typed
  // into this file. With no rows there is no such value and none is shown.
  const earliestWeek = recRows.reduce<number | null>((soonest, row) => {
    const week = row.recommended_week;
    if (typeof week !== "number") return soonest;
    return soonest === null || week < soonest ? week : soonest;
  }, null);
  const actNowTiming =
    recRows.find((row) => row.recommended_week === earliestWeek)?.timing ?? null;

  // The accumulator deliberately excludes the join fields: they come from
  // fact_demand_weekly and are attached once, after the optimiser rows have
  // been folded, so there is no chance of a realised figure being summed
  // once per style.
  type RecAccumulator = Omit<
    MarkdownRecRow,
    "realisedLossInr" | "realisedRate"
  > & { depthSum: number; depthCount: number };

  const recTotals = new Map<string, RecAccumulator>();
  for (const row of recRows) {
    const key = `${row.brand_id}|${row.category_id}`;
    const existing =
      recTotals.get(key) ??
      {
        brandId: row.brand_id,
        categoryId: row.category_id,
        label: labelOf(labels.category, row.category_id),
        styles: 0,
        marginSavedInr: 0,
        leftoverUnits: 0,
        meanDepth: null,
        actNow: 0,
        depthSum: 0,
        depthCount: 0,
      };
    existing.styles += 1;
    existing.marginSavedInr += num(row.margin_saved);
    existing.leftoverUnits += num(row.projected_leftover_units);
    if (typeof row.recommended_depth === "number") {
      existing.depthSum += row.recommended_depth;
      existing.depthCount += 1;
    }
    if (actNowTiming !== null && row.timing === actNowTiming) existing.actNow += 1;
    recTotals.set(key, existing);
  }

  const recommendations: MarkdownRecRow[] = [...recTotals.values()]
    .map((row) => {
      // The join, on the only key the two tables share. A pair with no
      // realised rows in the window gets null rather than zero: the
      // optimiser can flag a style in a category that has taken no markdown
      // yet, and that is a finding rather than a blank.
      const realised = byBrandCategory.get(`${row.brandId}|${row.categoryId}`);
      return {
        brandId: row.brandId,
        categoryId: row.categoryId,
        label: row.label,
        styles: row.styles,
        marginSavedInr: row.marginSavedInr,
        leftoverUnits: row.leftoverUnits,
        meanDepth: row.depthCount > 0 ? row.depthSum / row.depthCount : null,
        actNow: row.actNow,
        realisedLossInr: realised ? realised.loss : null,
        realisedRate:
          realised && realised.revenue > 0 ? realised.loss / realised.revenue : null,
      };
    })
    .sort((a, b) => b.marginSavedInr - a.marginSavedInr);

  return {
    windowWeeks,
    firstWeek: since,
    lastWeek: lastWeekStart,
    byCategory,
    byRegion,
    grid,
    regions,
    totalLossInr,
    totalRevenueInr,
    rowsRead: facts.length,
    truncated,
    recommendations,
    actNowTiming,
  };
}

// ------------------------------------------------------------------ adoption

const REC_LABEL: Record<string, string> = {
  BUY_QUANTITY: "Buy quantity",
  ALLOCATION: "Allocation",
  EXCEPTION: "Exception",
};

/**
 * v_adoption_kpi across every brand in scope.
 *
 * approval_rate_pct arrives NULL where nothing has been decided, and it is
 * carried through as null all the way to the cell. Coercing it to zero would
 * have said that a brand's planners looked at their buy plan and turned it
 * down, when what actually happened is that nobody has opened it.
 */
export async function readAdoption(
  sb: StyleverseClient,
  scope: PortfolioScope,
  labels: Labels,
): Promise<AdoptionRow[]> {
  const { data, error } = await sb
    .from("v_adoption_kpi")
    .select("*")
    .in("brand_id", scope.brandIds)
    .order("brand_id", { ascending: true });

  if (error) throw new Error(`StyleVerse: readAdoption failed -- ${error.message}`);

  return (data ?? [])
    .filter((row) => row.brand_id !== null && row.rec_type !== null)
    .map((row) => {
      const brandId = row.brand_id as string;
      const recType = row.rec_type as RecType;
      return {
        brandId,
        brandLabel: labelOf(labels.brand, brandId),
        recType,
        recLabel: REC_LABEL[recType] ?? humanise(recType),
        totalRecs: num(row.total_recs),
        decided: num(row.decided),
        approved: num(row.approved),
        modified: num(row.modified),
        rejected: num(row.rejected),
        approvalRatePct: row.approval_rate_pct,
        valueActionedInr: row.value_actioned_inr,
      };
    });
}

/**
 * The pattern in the adoption rows, found rather than asserted.
 *
 * The sentence on screen names the lowest and the highest approval rate per
 * brand and the types nobody has decided at all. It is composed from
 * whatever the rows say, so if planners started approving buys tomorrow the
 * finding would change without anybody editing a paragraph.
 */
export function adoptionFindings(rows: readonly AdoptionRow[]): AdoptionFinding[] {
  const brands = [...new Set(rows.map((row) => row.brandId))].sort();
  return brands.map((brandId) => {
    const mine = rows.filter((row) => row.brandId === brandId);
    const rated = mine.filter(
      (row): row is AdoptionRow & { approvalRatePct: number } =>
        typeof row.approvalRatePct === "number",
    );
    const sorted = [...rated].sort((a, b) => a.approvalRatePct - b.approvalRatePct);
    return {
      brandId,
      brandLabel: mine[0]?.brandLabel ?? brandId,
      lowest: sorted[0] ?? null,
      highest: sorted[sorted.length - 1] ?? null,
      undecidedTypes: mine.filter((row) => row.decided === 0 && row.totalRecs > 0),
    };
  });
}

// ---------------------------------------------------------------- exceptions

type ExceptionRaw = {
  brand_id: string | null;
  category_id: string | null;
  region_id: string | null;
  action: string | null;
  severity: string | null;
  value_at_stake_inr: number | null;
  payload: unknown;
  created_at: string | null;
  status: string | null;
};

function payloadNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function group(
  rows: readonly UndecidedRow[],
  all: readonly ExceptionRaw[],
  keyOf: (row: UndecidedRow) => { key: string; label: string },
  rawKeyOf: (row: ExceptionRaw) => string,
): UndecidedGroup[] {
  const totals = new Map<string, { label: string; count: number; value: number }>();
  for (const row of rows) {
    const { key, label } = keyOf(row);
    const entry = totals.get(key) ?? { label, count: 0, value: 0 };
    entry.count += 1;
    entry.value += num(row.valueAtStakeInr);
    totals.set(key, entry);
  }

  const denominators = new Map<string, number>();
  for (const row of all) {
    const key = rawKeyOf(row);
    denominators.set(key, (denominators.get(key) ?? 0) + 1);
  }

  return [...totals.entries()]
    .map(([key, entry]) => {
      const denominator = denominators.get(key) ?? 0;
      return {
        key,
        label: entry.label,
        count: entry.count,
        valueInr: entry.value,
        shareOfGroup: denominator > 0 ? entry.count / denominator : null,
      };
    })
    .sort((a, b) => b.valueInr - a.valueInr);
}

/**
 * Exceptions raised above their threshold that carry no decision.
 *
 * EVERY exception in scope is read, not only the undecided ones, because the
 * undecided count means nothing without its denominator: 78 open cases reads
 * one way against 173 raised and another way against 800. v_recommendation_state
 * already excludes SCENARIO rows, so a null status here is genuinely nobody
 * having decided, never somebody exploring.
 */
export async function readUndecided(
  sb: StyleverseClient,
  scope: PortfolioScope,
  labels: Labels,
): Promise<UndecidedView> {
  const read = await readPaged<ExceptionRaw>(
    "readUndecided",
    (from, to) =>
      sb
        .from("v_recommendation_state")
        .select(
          "brand_id, category_id, region_id, action, severity, value_at_stake_inr, payload, created_at, status",
        )
        .in("brand_id", scope.brandIds)
        .eq("rec_type", "EXCEPTION")
        .order("id", { ascending: true })
        .range(from, to),
    5000,
  );

  const all = read.rows;
  const open = all.filter((row) => row.status === null);

  const rows: UndecidedRow[] = open
    .map((row) => ({
      brandId: row.brand_id ?? "",
      brandLabel: labelOf(labels.brand, row.brand_id),
      severity: row.severity ?? "UNRATED",
      categoryId: row.category_id ?? "",
      categoryLabel: labelOf(labels.category, row.category_id),
      regionId: row.region_id ?? "",
      regionLabel: labelOf(labels.region, row.region_id),
      action: row.action ?? "",
      valueAtStakeInr: row.value_at_stake_inr,
      projectedWos: payloadNumber(row.payload, "projected_wos"),
      unitsAtRisk: payloadNumber(row.payload, "units_at_risk"),
      createdAt: row.created_at,
    }))
    .sort((a, b) => num(b.valueAtStakeInr) - num(a.valueAtStakeInr));

  const oldestRaisedAt = rows
    .map((row) => row.createdAt)
    .filter((value): value is string => typeof value === "string")
    .sort()[0] ?? null;

  return {
    rows,
    totalExceptions: all.length,
    decided: all.length - open.length,
    undecided: open.length,
    valueInr: rows.reduce((total, row) => total + num(row.valueAtStakeInr), 0),
    totalValueInr: all.reduce(
      (total, row) => total + num(row.value_at_stake_inr),
      0,
    ),
    bySeverity: group(
      rows,
      all,
      (row) => ({ key: row.severity, label: humanise(row.severity) }),
      (row) => row.severity ?? "UNRATED",
    ),
    byBrand: group(
      rows,
      all,
      (row) => ({ key: row.brandId, label: row.brandLabel }),
      (row) => row.brand_id ?? "",
    ),
    byCategory: group(
      rows,
      all,
      (row) => ({ key: row.categoryId, label: row.categoryLabel }),
      (row) => row.category_id ?? "",
    ),
    byRegion: group(
      rows,
      all,
      (row) => ({ key: row.regionId, label: row.regionLabel }),
      (row) => row.region_id ?? "",
    ),
    oldestRaisedAt,
    truncated: read.truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* The planning cycle panel                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which recommendation type each agent actually decides.
 *
 * autonomy_band names an agent, not a rec_type, so the join between "an agent
 * has a band" and "a planning stage is automated" lives here. It is a mapping
 * of five known agents rather than a lookup, because there is no column that
 * carries it -- and an agent absent from this map contributes no automation to
 * any stage, which is the safe direction to be wrong in.
 *
 * forecast_agent and learning_agent decide nothing: the first refreshes and
 * escalates, the second reads the ledger. Neither commits a recommendation, so
 * neither makes a stage automated.
 */
const AGENT_DECIDES: Readonly<Record<string, string>> = {
  allocation_agent: "ALLOCATION",
  exception_agent: "EXCEPTION",
  markdown_agent: "MARKDOWN",
};

export type StageBandRow = {
  recType: string;
  agentName: string;
  enabled: boolean;
  actsWithin: string;
};

/**
 * Agent bands, as the cycle panel needs them.
 *
 * A band that permits nothing does not automate anything. markdown_agent is
 * enabled with max_shift_pp 0.0 and max_value_inr 0.0 -- recommend-only, on
 * purpose, because a price change is customer-visible and irreversible -- so
 * it is filtered out here rather than being allowed to turn a stage orange on
 * the strength of an `enabled` flag alone.
 */
export async function readStageBands(
  sb: StyleverseClient,
): Promise<StageBandRow[]> {
  const { data, error } = await sb
    .from("autonomy_band")
    .select("agent_name, brand_id, enabled, max_shift_pp, max_value_inr, acts_within");

  if (error || !data) return [];

  const seen = new Set<string>();
  const rows: StageBandRow[] = [];

  for (const band of data) {
    const recType = AGENT_DECIDES[band.agent_name];
    if (!recType) continue;

    const shift = Number(band.max_shift_pp ?? 0);
    const value = Number(band.max_value_inr ?? 0);
    const permits = shift > 0 || value > 0;
    if (!permits) continue;

    // One entry per agent, not per brand: the classification is about whether
    // the capability exists, and both brands carry the same agent set.
    if (seen.has(band.agent_name)) continue;
    seen.add(band.agent_name);

    rows.push({
      recType,
      agentName: band.agent_name,
      enabled: band.enabled === true,
      actsWithin: band.acts_within ?? "",
    });
  }

  return rows;
}

/** Recommendation counts by type, under the caller's own scope. */
export async function readCountsByType(
  sb: StyleverseClient,
  brandIds: readonly string[],
): Promise<Record<string, number>> {
  let query = sb.from("recommendation").select("rec_type");
  if (brandIds.length > 0) query = query.in("brand_id", [...brandIds]);

  const { data, error } = await query;
  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data) {
    const key = String(row.rec_type);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
