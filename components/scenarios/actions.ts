"use server";

// Saving a scenario. The only write path on this screen.
//
// A scenario is a planner_decision row with status = SCENARIO, and that is
// the whole design. There is no scenario table and no separate audit trail:
// exploration lands in the same append-only ledger as commitment, under the
// same accountable planner, adjudicated by the same RLS policies. What keeps
// the two apart is the status value and the two views that filter it out --
// v_recommendation_state joins only non-SCENARIO decisions, so a scenario
// can never surface as a recommendation's state, and v_adoption_kpi counts
// only APPROVED / MODIFIED / REJECTED, so exploring cannot inflate an
// approval rate. Writing APPROVED here to make the insert easier would break
// both of those at once.
//
// D5, and it is copied from lib/actions.ts on purpose rather than
// paraphrased: accountable_planner and planner_id come from the SESSION and
// nowhere else. A body that arrives carrying its own accountable_planner is
// REFUSED rather than corrected, because nothing legitimate sends one and a
// caller who does is telling you something about their intent.
//
// The client sends the name, the four lever values and the scope. It does
// not send the anchor, the model version, the unit totals or any money: all
// of those are recomputed here from the stored forecast under the caller's
// own RLS, so the sentence that lands in the ledger describes what the
// database says rather than what a form said.

import { revalidatePath } from "next/cache";

import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

import {
  readAnchor,
  readElasticity,
  readForecastBase,
  readLabels,
  readOwnedCategories,
  readPlanEconomics,
} from "./data";
import {
  BASE_LEVERS,
  LEVER_BOUNDS,
  compare,
  runScenario,
  type LeverState,
} from "./model";
import {
  formatScenarioNote,
  sanitiseScenarioName,
  type ScenarioScope,
} from "./note";

const SCENARIOS_PATH = "/scenarios";

/** Roles whose insert the RLS policy on planner_decision can accept. */
const WRITING_ROLES = [
  "planner",
  "category_manager",
  "planning_manager",
  "coe_admin",
] as const;

/**
 * Fields nothing legitimate ever sends. Their presence is a refusal, not a
 * field to overwrite. Identical in spirit to lib/actions.ts, extended with
 * the two this screen would otherwise be trusted to derive.
 */
const FORBIDDEN_FIELDS = [
  "accountable_planner",
  "accountablePlanner",
  "planner_id",
  "plannerId",
  "actor_type",
  "actorType",
  "actor_id",
  "actorId",
  "status",
  "recommendation_id",
  "recommendationId",
  "model_version",
  "modelVersion",
];

export type SaveScenarioInput = {
  name: string;
  levers: LeverState;
  scope: ScenarioScope;
};

export type SaveScenarioResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function withinBounds(
  value: number,
  bounds: { min: number; max: number },
): boolean {
  return Number.isFinite(value) && value >= bounds.min - 1e-9 && value <= bounds.max + 1e-9;
}

function validateLevers(levers: LeverState): string | null {
  if (!withinBounds(levers.priceChange, LEVER_BOUNDS.priceChange)) {
    return "The price change is outside the range this screen explores.";
  }
  if (!withinBounds(levers.promoDepth, LEVER_BOUNDS.promoDepth)) {
    return (
      "The promotion depth is outside the range the elasticity curve is " +
      "solved over, so no depth on that setting has an answer to store."
    );
  }
  if (!withinBounds(levers.marketingIndex, LEVER_BOUNDS.marketingIndex)) {
    return "The marketing index is outside the range this screen explores.";
  }
  if (
    levers.capacityShare !== null &&
    !withinBounds(levers.capacityShare, LEVER_BOUNDS.capacityShare)
  ) {
    return "The capacity cap is outside the range this screen explores.";
  }
  return null;
}

/** Only the three ids, and only as strings. Everything else is dropped. */
function cleanScope(scope: ScenarioScope): ScenarioScope {
  const clean = (value: unknown): string | null =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(value) ? value : null;
  return {
    category: clean(scope?.category),
    channel: clean(scope?.channel),
    region: clean(scope?.region),
  };
}

export async function saveScenario(
  input: SaveScenarioInput & Record<string, unknown>,
): Promise<SaveScenarioResult> {
  const smuggled = FORBIDDEN_FIELDS.filter((field) => field in input);
  if (smuggled.length > 0) {
    return {
      ok: false,
      error:
        `Refused: the request supplied ${smuggled.join(", ")}. Accountability, ` +
        `the anchoring recommendation and the model version are all taken from ` +
        `your session and from the stored forecast, never from the request, so ` +
        `a body that names its own is rejected rather than corrected.`,
    };
  }

  const planner = await getSessionPlanner();
  if (!planner?.employeeId || !planner.fullName) {
    return {
      ok: false,
      error:
        "You are signed in but have no planner record, so a scenario cannot be " +
        "recorded in your name. Ask your workspace administrator to link your account.",
    };
  }
  if (!planner.brandId) {
    return {
      ok: false,
      error:
        "Your planner record carries no brand, so there is no book to run a " +
        "scenario against.",
    };
  }
  if (!(WRITING_ROLES as readonly string[]).includes(planner.appRole ?? "")) {
    return {
      ok: false,
      error:
        `Scenarios are written into the decision ledger, and the ledger accepts ` +
        `entries from a planner, a category manager, a planning manager or a CoE ` +
        `administrator. You are signed in as ${planner.appRole ?? "a role with no write policy"}, ` +
        `so you can run scenarios on this screen but not file them.`,
    };
  }

  const name = sanitiseScenarioName(input?.name ?? "");
  if (name.length === 0) {
    return {
      ok: false,
      error:
        "Give the scenario a name. The ledger entry is read by someone who was " +
        "not in the room, and \"Untitled\" tells them nothing about what was explored.",
    };
  }

  const levers: LeverState = {
    priceChange: Number(input?.levers?.priceChange),
    promoDepth: Number(input?.levers?.promoDepth),
    marketingIndex: Number(input?.levers?.marketingIndex),
    capacityShare:
      input?.levers?.capacityShare === null ||
      input?.levers?.capacityShare === undefined
        ? null
        : Number(input.levers.capacityShare),
  };
  const invalid = validateLevers(levers);
  if (invalid !== null) return { ok: false, error: invalid };

  const scope = cleanScope(input?.scope ?? { category: null, channel: null, region: null });
  const brandId = planner.brandId;
  const sb = await createServerAnonClient();

  // Everything below is re-read under the caller's own RLS. A scope the
  // session cannot see returns no forecast rows, and the refusal says so
  // rather than writing a row describing a plan that does not exist for them.
  const [labels, elasticity] = await Promise.all([
    readLabels(sb),
    readElasticity(sb, brandId),
  ]);

  let base;
  try {
    base = await readForecastBase(sb, brandId, scope, elasticity, labels.category);
  } catch (error) {
    return {
      ok: false,
      error: `The forecast behind this scenario could not be re-read, so nothing was saved: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (base.categories.length === 0 || base.rowCount === 0) {
    return {
      ok: false,
      error:
        "There are no forecast rows in that selection for your session, so there " +
        "is no plan to save a scenario against. This is a scope result rather " +
        "than a failure: row level security answered the read with your own " +
        "categories and region.",
    };
  }

  const { economics } = await readPlanEconomics(sb, brandId, base.horizonWeeks);
  if (economics === null) {
    return {
      ok: false,
      error:
        "The policy parameters this scenario is priced with are not readable, so " +
        "the unit and holding-cost figures that belong in the ledger entry cannot " +
        "be computed. Nothing was saved rather than saving a sentence with a gap in it.",
    };
  }

  const ownedCategories = await readOwnedCategories(sb, planner.employeeId);
  const restrictToOwned =
    planner.appRole === "planner" || planner.appRole === "category_manager";
  const anchor = await readAnchor(sb, brandId, scope, ownedCategories, restrictToOwned);

  if (anchor === null) {
    return {
      ok: false,
      error:
        "No buy recommendation in your own categories is visible to anchor this " +
        "scenario to. planner_decision.recommendation_id is not nullable, and that " +
        "is what makes the insert policy check category ownership -- without an " +
        "anchor there is no row the database would accept from you.",
    };
  }

  const baseRun = runScenario(base.categories, economics, BASE_LEVERS, 0);
  const scenarioRun = runScenario(
    base.categories,
    economics,
    levers,
    baseRun.planUnits,
  );
  const delta = compare(baseRun, scenarioRun, economics);

  const modelVersion =
    base.modelVersions.length > 0
      ? base.modelVersions.join(" + ")
      : anchor.modelVersion;

  const note = formatScenarioNote({
    name,
    levers,
    scope,
    scopeLabels: {
      category: scope.category === null ? "all categories" : labels.category[scope.category] ?? scope.category,
      channel: scope.channel === null ? "all channels" : labels.channel[scope.channel] ?? scope.channel,
      region: scope.region === null ? "all regions" : labels.region[scope.region] ?? scope.region,
    },
    brandId,
    modelVersion,
    rowCount: base.rowCount,
    horizonWeeks: base.horizonWeeks,
    baseUnits: baseRun.planUnits,
    scenarioUnits: scenarioRun.planUnits,
    unitChange: delta.unitChange,
    unitChangePct: delta.unitChangePct,
    holdingCostChangeInr: delta.holdingCostChangeInr,
    holdingCostPerUnitWeekInr: economics.holdingCostPerUnitWeekInr,
    marginChangeInr: delta.marginChangeInr,
    pooledCategories: scenarioRun.pooledCategories,
  });

  const { error } = await sb.from("planner_decision").insert({
    recommendation_id: anchor.recommendationId, // resolved here, not sent
    planner_id: planner.employeeId, // session, not body
    status: "SCENARIO", // never APPROVED
    // A scenario commits no quantity, so neither value column is written.
    recommended_value: null,
    accepted_value: null,
    override_reason: note,
    accountable_planner: planner.fullName, // session, not body
    actor_type: "human",
    actor_id: planner.employeeId,
    model_version: modelVersion,
  });

  if (error) {
    const denied = /row-level security|42501/i.test(error.message);
    return {
      ok: false,
      error: denied
        ? "The ledger refused this scenario. Scenarios are filed against a " +
          "recommendation in a category you own, and the policy checks that " +
          "ownership on the database side rather than trusting the screen. Choose " +
          "a selection inside your own categories and try again."
        : `The scenario was not saved: ${error.message}`,
    };
  }

  revalidatePath(SCENARIOS_PATH);

  return {
    ok: true,
    message:
      `Saved as "${name}" against ${planner.fullName}, filed on recommendation ` +
      `#${anchor.recommendationId} with status SCENARIO. It carries no committed ` +
      `quantity, it is excluded from the adoption and approval figures, and like ` +
      `every other decision row it cannot be edited -- a revision is a new entry.`,
  };
}
