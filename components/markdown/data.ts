// Server-side reads for the markdown optimiser that lib/queries does not
// already cover, plus the join that turns four reads into one flat row.
//
// Everything takes the Supabase client as an argument, exactly like
// lib/queries, so the caller decides whose RLS applies. The markdown screen
// passes createServerAnonClient(), which carries the planner's session
// cookie. Nothing here reaches for the service role.
//
// WHY dim_sku IS READ AT ALL
// --------------------------
// The 5% trigger the pipeline applies is "margin_saved above five percent of
// the leftover's value at LIST price". markdown_recommendation stores
// margin_saved and the projected leftover but not the price, so without
// dim_sku the trigger would have to be asserted on screen instead of shown.
// dim_sku carries exactly the same RLS predicate as
// markdown_recommendation -- brand, then either a manager role or the
// planner's own category list -- so a planner who can see a recommendation
// can always see the price behind it, and this read never widens the page's
// scope. Where it comes back empty the share prints as a dash rather than as
// a number nobody can check.

import type { Elasticity, MarkdownRecommendation } from "@/lib/queries";
import type { StyleverseClient } from "@/lib/supabase";

import type { CategoryFit, MarkdownRow } from "./types";

/** Display names for the category ids on the fit table and the row list. */
export async function getCategoryNames(
  sb: StyleverseClient,
): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("dim_category")
    .select("category_id, category_name");

  // A missing label is cosmetic: the id is still a true identifier, so a
  // failed lookup degrades to the id rather than failing the screen.
  if (error || !data) return {};

  const names: Record<string, string> = {};
  for (const row of data) {
    if (row.category_name) names[row.category_id] = row.category_name;
  }
  return names;
}

/** list_price_inr for the styles on screen, keyed by style_id. */
export async function getStyleListPrices(
  sb: StyleverseClient,
  styleIds: readonly string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (styleIds.length === 0) return prices;

  const { data, error } = await sb
    .from("dim_sku")
    .select("style_id, list_price_inr")
    .in("style_id", [...styleIds]);

  if (error || !data) return prices;
  for (const row of data) {
    if (typeof row.list_price_inr === "number") {
      prices.set(row.style_id, row.list_price_inr);
    }
  }
  return prices;
}

/** elasticity rows -> the fit map the recommendation rows join against. */
export function toCategoryFits(
  rows: readonly Elasticity[],
  categoryNames: Readonly<Record<string, string>>,
): CategoryFit[] {
  const fits: CategoryFit[] = [];
  for (const row of rows) {
    if (row.category_id === null) continue;
    fits.push({
      categoryId: row.category_id,
      categoryLabel: categoryNames[row.category_id] ?? row.category_id,
      coefficient: row.coefficient,
      intercept: row.intercept,
      rSquared: row.r_squared,
      nObservations: row.n_observations,
      isPooled: row.is_pooled_fallback,
    });
  }
  fits.sort((a, b) => a.categoryId.localeCompare(b.categoryId));
  return fits;
}

/**
 * markdown_recommendation -> MarkdownRow, joined to price and fit.
 *
 * Rows missing the identity the whole screen is about -- a style, a
 * category, a depth, a cover -- are dropped rather than rendered with
 * dashes in the columns that carry the argument. A recommendation with no
 * depth is a pipeline fault, and showing it as an empty row would invite a
 * planner to act on nothing.
 */
export function toMarkdownRows(
  recommendations: readonly MarkdownRecommendation[],
  fits: readonly CategoryFit[],
  prices: ReadonlyMap<string, number>,
  categoryNames: Readonly<Record<string, string>>,
): MarkdownRow[] {
  const byCategory = new Map(fits.map((fit) => [fit.categoryId, fit]));
  const rows: MarkdownRow[] = [];

  for (const rec of recommendations) {
    if (
      rec.style_id === null ||
      rec.category_id === null ||
      rec.recommended_depth === null ||
      rec.current_cover_weeks === null ||
      rec.remaining_life_weeks === null ||
      rec.weeks_since_launch === null ||
      rec.timing === null
    ) {
      continue;
    }

    const listPrice = prices.get(rec.style_id) ?? null;
    const leftover = rec.projected_leftover_units;
    const marginSaved = rec.margin_saved ?? 0;
    const listValue =
      listPrice !== null && typeof leftover === "number"
        ? leftover * listPrice
        : null;

    rows.push({
      id: rec.id,
      styleId: rec.style_id,
      styleName: rec.style_name ?? rec.style_id,
      categoryId: rec.category_id,
      categoryLabel: categoryNames[rec.category_id] ?? rec.category_id,
      weeksSinceLaunch: rec.weeks_since_launch,
      remainingLifeWeeks: rec.remaining_life_weeks,
      coverWeeks: rec.current_cover_weeks,
      projectedLeftoverUnits: leftover,
      recommendedDepth: rec.recommended_depth,
      recommendedWeek: rec.recommended_week ?? 0,
      marginIfNow: rec.margin_if_now,
      marginIfDelayed: rec.margin_if_delayed,
      marginSaved,
      timing: rec.timing,
      rationale: rec.rationale,
      modelVersion: rec.model_version,
      generatedAt: rec.generated_at,
      listPriceInr: listPrice,
      waitCostShare:
        listValue !== null && listValue > 0 ? marginSaved / listValue : null,
      fit: byCategory.get(rec.category_id) ?? null,
    });
  }

  // Most consequential first, matching the order the pipeline itself writes:
  // a planner works the list top down and stops when the remaining value
  // stops justifying the attention.
  rows.sort((a, b) => b.marginSaved - a.marginSaved);
  return rows;
}
