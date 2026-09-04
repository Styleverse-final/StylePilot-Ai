// ONE canonical accuracy statement. Part H.
//
// Four defensible accuracy numbers exist for this model, and left loose they
// drift across screens until two of them appear on the same slide. This is
// the only place any of them is computed, and the only shape they travel in.
//
// THE RULE THIS FILE ENFORCES: no screen may render the headline alone.
// The manual baseline in the workbook was authored by the dataset designer
// and calibrated by bisection to hit a target, so beating it by 24 points
// proves something about the fixture. Seasonal naive is a benchmark nobody
// constructed, it is much harder to beat, and the margin over it is small --
// +4.8 and +5.5 points. That smaller number is the one that proves the model
// works, so it travels attached to the headline rather than beside it in a
// footnote someone can drop.
//
// The type is what does the enforcing: `headline` is not exported as a bare
// number anywhere. It only exists inside AccuracyHeadline, which always
// carries vsSeasonalNaive, and the <AccuracyStatement/> component renders
// both together.

import { getModelRegistry, type ModelRegistryEntry } from "@/lib/queries";
import type { StyleverseClient } from "@/lib/supabase";

export type BrandId = "SPD" | "ECO";

export type AccuracyHeadline = {
  brandId: BrandId;
  modelVersion: string;
  generatedAt: string | null;

  /** 1 - WAPE, mean of four rolling-origin folds. NEVER render alone. */
  headlinePct: number;
  /**
   * Folds behind the headline, counted from the registry's own by_fold array.
   *
   * NULL when the registry row carries no by_fold, because this is the file
   * that owns Part H and it must not invent the number that says how much
   * evidence is behind an accuracy claim. A screen that cannot say how many
   * folds produced a figure should say nothing about folds.
   */
  foldCount: number | null;

  /** The authored baseline, and the margin over it. Context, not proof. */
  manualPct: number;
  vsManualPoints: number;

  /** The benchmark nobody constructed, and the margin that proves the model. */
  seasonalNaivePct: number;
  vsSeasonalNaivePoints: number;

  /** Scale-free, so SPD and ECO are directly comparable. Below 1 beats naive. */
  mase: number;
  maseSeasonalNaive: number;

  /** The other two benchmarks, for the accuracy card's bars. */
  driftPct: number;
  rolling13Pct: number;
};

/** jsonb arrives as Json; coerce narrowly rather than widening to `any`. */
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Fraction -> percentage, one decimal. */
function pct(v: unknown): number {
  return Math.round(num(v) * 1000) / 10;
}

/** Fraction -> percentage points, one decimal. */
function pts(v: unknown): number {
  return Math.round(num(v) * 1000) / 10;
}

function fromEntry(entry: ModelRegistryEntry): AccuracyHeadline | null {
  const m = entry.metrics;
  if (!m) return null;
  const bm = (m.benchmark_comparison ?? {}) as Record<string, unknown>;
  const brandId = entry.model_id.slice(0, 3) as BrandId;

  const headlinePct = pct(m.ai_accuracy_vs_demand);
  const manualPct = pct(m.manual_accuracy_vs_demand);
  const seasonalNaivePct = pct(bm.seasonal_naive);

  return {
    brandId,
    modelVersion: entry.model_version,
    generatedAt: entry.trained_at ?? null,
    headlinePct,
    foldCount: Array.isArray(m.by_fold) ? m.by_fold.length : null,
    manualPct,
    // Computed, not read: the stored margin and the two accuracies must agree.
    vsManualPoints: Math.round((headlinePct - manualPct) * 10) / 10,
    seasonalNaivePct,
    vsSeasonalNaivePoints:
      bm.margin_over_snaive !== undefined
        ? pts(bm.margin_over_snaive)
        : Math.round((headlinePct - seasonalNaivePct) * 10) / 10,
    mase: Math.round(num(bm.mase_model) * 1000) / 1000,
    maseSeasonalNaive: Math.round(num(bm.mase_snaive) * 1000) / 1000,
    driftPct: pct(bm.drift),
    rolling13Pct: pct(bm.rolling_13),
  };
}

/**
 * Every accuracy figure on every screen comes from here.
 *
 * Reads the planning-grain registry rows only; the cold-start model has its
 * own, much lower, accuracy and must never be averaged into this.
 */
export async function getAccuracyHeadline(
  sb: StyleverseClient,
  brandId?: BrandId,
): Promise<AccuracyHeadline[]> {
  const rows = await getModelRegistry(sb);
  return rows
    .filter((r) => r.model_id.endsWith("_planning_grain"))
    .map(fromEntry)
    .filter((x): x is AccuracyHeadline => x !== null)
    .filter((x) => (brandId ? x.brandId === brandId : true))
    .sort((a, b) => a.brandId.localeCompare(b.brandId));
}

/** Portfolio-level: both brands, for a group CMPO. */
export async function getAccuracyHeadlines(
  sb: StyleverseClient,
): Promise<AccuracyHeadline[]> {
  return getAccuracyHeadline(sb);
}

/**
 * The sentence that may be quoted. Built here so the phrasing cannot drift
 * either -- the seasonal margin is named in the same breath as the headline.
 */
export function accuracySentence(a: AccuracyHeadline): string {
  const folds =
    a.foldCount === null
      ? "a rolling-origin backtest whose fold count the registry does not record"
      : `mean of ${a.foldCount} rolling-origin folds`;
  return (
    `${a.headlinePct.toFixed(1)}% at the planning grain, ${folds}` +
    ` -- ${a.vsSeasonalNaivePoints.toFixed(1)} points ` +
    `over seasonal naive (${a.seasonalNaivePct.toFixed(1)}%), which is the ` +
    `benchmark that counts, and ${a.vsManualPoints.toFixed(1)} over the ` +
    `authored manual baseline (${a.manualPct.toFixed(1)}%). MASE ${a.mase.toFixed(2)}.`
  );
}
