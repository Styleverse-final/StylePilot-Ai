// Server-side reads for the buy plan that lib/queries does not already
// cover, plus the mapping from a RecommendationState into the flat BuyRow
// the client table renders.
//
// WHY THERE IS A SECOND DECISION READ HERE
// ----------------------------------------
// getRecommendations() reads v_recommendation_state, and that view collapses
// planner_decision with `ORDER BY decided_at DESC LIMIT 1` -- it answers
// "what is the current state of this recommendation", which is the right
// answer for a queue.
//
// It is the wrong answer for this screen. planner_decision is append-only:
// a planner who changes their mind writes a new row and the earlier one
// stays. Showing only the latest row would quietly hide exactly the thing
// the append-only design exists to prove, so the full history is read here
// and every entry is rendered. There is a real example in the pilot data --
// one buy recommendation carries a REJECTED followed by a MODIFIED nine
// hours later, and both belong on the screen.
//
// Everything below takes the client as an argument, exactly like
// lib/queries, so the caller decides whose RLS applies. The buy screen
// passes createServerAnonClient(), which carries the planner's session
// cookie: a planner sees the decisions on the recommendations they are
// entitled to see, and nothing else.

import { parseDrivers, parsePayload } from "@/lib/queries";
import type { RecommendationState } from "@/lib/queries";
import type { StyleverseClient } from "@/lib/supabase";
import type { Driver } from "@/components/DriverBars";

import type { BuyDecision, BuyDecisionStatus, BuyRow } from "./types";

/** Display names for the three dimensions a series is keyed by. */
export type SeriesLabels = {
  category: Record<string, string>;
  channel: Record<string, string>;
  region: Record<string, string>;
};

const EMPTY_LABELS: SeriesLabels = { category: {}, channel: {}, region: {} };

/**
 * The dim tables behind a series key. All three are readable to any
 * authenticated user, so this never narrows what the screen can show; it
 * only turns "ACCS|D2C|EU" into words.
 */
export async function getSeriesLabels(
  sb: StyleverseClient,
): Promise<SeriesLabels> {
  const [categories, channels, regions] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  // A missing label is cosmetic: the id is still a true identifier, so a
  // failed lookup degrades to the id rather than failing the screen.
  if (categories.error || channels.error || regions.error) return EMPTY_LABELS;

  const labels: SeriesLabels = { category: {}, channel: {}, region: {} };
  for (const row of categories.data) {
    if (row.category_name) labels.category[row.category_id] = row.category_name;
  }
  for (const row of channels.data) {
    if (row.channel_name) labels.channel[row.channel_id] = row.channel_name;
  }
  for (const row of regions.data) {
    if (row.region_name) labels.region[row.region_id] = row.region_name;
  }
  return labels;
}

function isDecisionStatus(value: string): value is BuyDecisionStatus {
  return value === "APPROVED" || value === "MODIFIED" || value === "REJECTED";
}

/**
 * Every decision ever recorded against the given recommendations, oldest
 * first, with the acting planner's job title resolved.
 *
 * The role is read from dim_planner rather than stored on the decision,
 * because a title is a property of the person today and the decision row is
 * a record of what was committed then. The name on the row
 * (accountable_planner) is the one that was captured at write time from the
 * session, and it is never re-derived.
 */
export async function getDecisionHistory(
  sb: StyleverseClient,
  recommendationIds: readonly number[],
): Promise<Map<number, BuyDecision[]>> {
  const history = new Map<number, BuyDecision[]>();
  if (recommendationIds.length === 0) return history;

  const { data, error } = await sb
    .from("planner_decision")
    .select(
      "id, recommendation_id, planner_id, status, recommended_value, accepted_value, override_reason, accountable_planner, actor_type, decided_at, model_version",
    )
    .in("recommendation_id", [...recommendationIds])
    .order("decided_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });

  if (error || data.length === 0) return history;

  const plannerIds = [
    ...new Set(
      data
        .map((row) => row.planner_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const roles = new Map<string, string | null>();
  if (plannerIds.length > 0) {
    const { data: planners } = await sb
      .from("dim_planner")
      .select("employee_id, role, app_role")
      .in("employee_id", plannerIds);
    for (const planner of planners ?? []) {
      roles.set(planner.employee_id, planner.role ?? planner.app_role ?? null);
    }
  }

  for (const row of data) {
    if (!isDecisionStatus(row.status)) continue;
    const entry: BuyDecision = {
      id: row.id,
      status: row.status,
      recommendedValue: row.recommended_value,
      acceptedValue: row.accepted_value,
      reason: row.override_reason,
      plannerName: row.accountable_planner,
      plannerRole: row.planner_id ? (roles.get(row.planner_id) ?? null) : null,
      actorType: row.actor_type,
      decidedAt: row.decided_at,
      modelVersion: row.model_version,
    };
    const existing = history.get(row.recommendation_id);
    if (existing) existing.push(entry);
    else history.set(row.recommendation_id, [entry]);
  }

  return history;
}

/** Narrow one jsonb payload field to a finite number, or null. */
function payloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * RecommendationState -> BuyRow.
 *
 * Rows whose payload carries no recommended buy are dropped rather than
 * rendered with a dash in the column the whole screen is about: a
 * BUY_QUANTITY recommendation with no recommended quantity is a pipeline
 * fault, and showing it as an empty row would invite a planner to decide
 * against nothing.
 */
export function toBuyRows(
  recommendations: readonly RecommendationState[],
  labels: SeriesLabels,
  history: Map<number, BuyDecision[]>,
): BuyRow[] {
  const rows: BuyRow[] = [];

  for (const rec of recommendations) {
    if (rec.id === null || rec.model_version === null) continue;

    const payload = parsePayload(rec.payload) as Record<string, unknown>;
    const recommendedUnits = payloadNumber(payload, "recommended_buy_units");
    if (recommendedUnits === null) continue;

    const parsed = parseDrivers(rec.drivers);
    const drivers: Driver[] = parsed.map((driver) => ({
      label: driver.feature,
      value: driver.contribution_units,
    }));

    rows.push({
      id: rec.id,
      categoryId: rec.category_id,
      channelId: rec.channel_id,
      regionId: rec.region_id,
      categoryLabel:
        (rec.category_id ? labels.category[rec.category_id] : null) ??
        rec.category_id ??
        "Unassigned category",
      channelLabel:
        (rec.channel_id ? labels.channel[rec.channel_id] : null) ??
        rec.channel_id ??
        "Unassigned channel",
      // The code, not the name: dim_region names already carry a middle dot
      // ("India . North"), so spelling them inside a dot-separated series
      // key produces a line nobody can parse. The full name is kept beside
      // it for the expanded row, which has the width for it.
      regionLabel: rec.region_id ?? "Unassigned region",
      regionName:
        (rec.region_id ? labels.region[rec.region_id] : null) ??
        rec.region_id ??
        "Unassigned region",
      action: rec.action,
      confidence: rec.confidence,
      valueAtStakeInr: rec.value_at_stake_inr,
      rationale: rec.rationale ?? "",
      drivers,
      driverMethod: parsed.length > 0 ? parsed[0].method : null,
      modelVersion: rec.model_version,
      generatedAt: rec.generated_at,
      p50Units: payloadNumber(payload, "ai_demand_units"),
      safetyUnits: payloadNumber(payload, "safety_units"),
      recommendedUnits,
      manualUnits: payloadNumber(payload, "manual_units"),
      deltaUnits: payloadNumber(payload, "delta_units"),
      deltaPct: payloadNumber(payload, "delta_pct"),
      horizonWeeks: payloadNumber(payload, "weeks"),
      serviceTier: payloadString(payload, "service_level_tier"),
      decisions: history.get(rec.id) ?? [],
    });
  }

  // Most consequential first. A planner works the list top down and stops
  // when the remaining value stops justifying the attention; ordering by
  // created_at would put that decision in the pipeline's hands instead.
  rows.sort((a, b) => (b.valueAtStakeInr ?? 0) - (a.valueAtStakeInr ?? 0));
  return rows;
}
