"use server";

// The decision write path. Every Approve, Modify and Reject in the product
// comes through here.
//
// D5, and the reason this file is small and boring: accountable_planner is
// taken from the SESSION and nowhere else. A caller can put any name in a
// form body; they cannot forge the session cookie that current_planner()
// reads on the database side. If a body arrives carrying its own
// accountable_planner or planner_id, that is not a field to be trusted and
// overwritten -- it is a request to be refused, because nothing legitimate
// sends it.
//
// The insert goes through the ANON client with the caller's cookie, so RLS
// adjudicates it: category ownership, the INR 50L planner ceiling, and the
// rule that planner_id must equal the session's own employee id. Using the
// service role here would bypass every one of those checks. The append-only
// trigger then guarantees this row can never be edited afterwards; a
// correction is a new row.

import { revalidatePath } from "next/cache";

import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export type DecisionStatus = "APPROVED" | "MODIFIED" | "REJECTED";

export type DecisionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type DecisionInput = {
  recommendationId: number;
  status: DecisionStatus;
  /** The value the planner is committing to. Required for MODIFIED. */
  acceptedValue?: number | null;
  /** Required for MODIFIED and REJECTED. */
  reason?: string | null;
  /** Path to revalidate after the write. */
  revalidate?: string;
};

/** Fields nothing legitimate ever sends. Their presence is refused. */
const FORBIDDEN_FIELDS = [
  "accountable_planner",
  "accountablePlanner",
  "planner_id",
  "plannerId",
  "actor_type",
  "actorType",
];

export async function recordDecision(
  input: DecisionInput & Record<string, unknown>,
): Promise<DecisionResult> {
  const smuggled = FORBIDDEN_FIELDS.filter((f) => f in input);
  if (smuggled.length > 0) {
    return {
      ok: false,
      error:
        `Refused: the request supplied ${smuggled.join(", ")}. Accountability ` +
        `is taken from your session, never from the request, so a body that ` +
        `names its own planner is rejected rather than corrected.`,
    };
  }

  const planner = await getSessionPlanner();
  if (!planner?.employeeId || !planner.fullName) {
    return {
      ok: false,
      error:
        "You are signed in but have no planner record, so no decision can be " +
        "recorded in your name. Ask your workspace administrator to link your account.",
    };
  }

  const reason = (input.reason ?? "").trim();
  if (input.status !== "APPROVED" && reason.length === 0) {
    return {
      ok: false,
      error:
        input.status === "MODIFIED"
          ? "A modification needs a reason. The override is the record; without the reason it is just a different number."
          : "A rejection needs a reason.",
    };
  }
  if (input.status === "MODIFIED" && (input.acceptedValue == null || !Number.isFinite(input.acceptedValue))) {
    return { ok: false, error: "Enter the quantity you are committing to." };
  }

  const sb = await createServerAnonClient();

  // The recommended value is read from the recommendation itself, so the
  // "what the model said" side of the comparison cannot be supplied by the
  // caller either.
  const { data: rec, error: recErr } = await sb
    .from("recommendation")
    .select("id, model_version, value_at_stake_inr, payload")
    .eq("id", input.recommendationId)
    .maybeSingle();

  if (recErr || !rec) {
    return {
      ok: false,
      error:
        "That recommendation is not visible to you, so no decision can be " +
        "recorded against it.",
    };
  }

  const payload = (rec.payload ?? {}) as Record<string, unknown>;
  const recommendedRaw =
    payload.recommended_buy_units ?? payload.recommended_units ?? rec.value_at_stake_inr;
  const recommendedValue =
    typeof recommendedRaw === "number" ? recommendedRaw : Number(recommendedRaw) || null;

  const { error } = await sb.from("planner_decision").insert({
    recommendation_id: rec.id,
    planner_id: planner.employeeId,          // session, not body
    status: input.status,
    recommended_value: recommendedValue,
    accepted_value: input.status === "MODIFIED" ? input.acceptedValue : null,
    override_reason: reason.length > 0 ? reason : null,
    accountable_planner: planner.fullName,   // session, not body
    actor_type: "human",
    actor_id: planner.employeeId,
    model_version: rec.model_version,
  });

  if (error) {
    // A refusal here is usually RLS doing its job, so say what the rule is
    // rather than surfacing a policy violation verbatim.
    const denied = /row-level security|42501/i.test(error.message);
    return {
      ok: false,
      error: denied
        ? "You cannot decide this recommendation. Planners may commit decisions " +
          "in their own categories below INR 50,00,000; anything larger goes to " +
          "a category manager or above."
        : `The decision was not recorded: ${error.message}`,
    };
  }

  if (input.revalidate) revalidatePath(input.revalidate);

  const verb =
    input.status === "APPROVED" ? "Approved" : input.status === "MODIFIED" ? "Modified" : "Rejected";
  return {
    ok: true,
    message: `${verb} and recorded against ${planner.fullName}. The entry is append-only; a change is a new row beside it.`,
  };
}
