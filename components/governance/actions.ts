"use server";

// THE KILL SWITCH WRITE PATH.
//
// This is the only thing on the governance screen that writes, and it exists
// because row level security already permits it: agent_kill_switch carries
// agent_kill_switch_mgr_update, USING and WITH CHECK
// current_app_role() = ANY('{planning_manager,coe_admin}'), over a read
// policy of USING (true). Everyone can see the switch; two roles can move it.
// A screen that rendered a dead button for those two roles would be
// misrepresenting a control the database is willing to accept, and a screen
// that rendered a live one for a planner would be lying in the other
// direction. So the control is live for the roles the policy names and
// disabled with a visible reason for everyone else -- and the server refuses
// it again regardless of what the browser did.
//
// THREE RULES, THE SAME THREE AS THE DECISION WRITE PATH
// -----------------------------------------------------
//  1. Who acted comes from the SESSION and nowhere else. A body that carries
//     its own engaged_by is refused rather than corrected, because nothing
//     legitimate sends one.
//  2. A reason is required in BOTH directions. Pausing every agent in the
//     estate and releasing them again are equally consequential, and an
//     unexplained release is the one an auditor would ask about first.
//  3. The anon client does the write, carrying the caller's cookie, so the
//     policy adjudicates it. The service role would bypass the only rule
//     that matters here.
//
// WHY THE RESULT IS CHECKED WITH .select()
// ----------------------------------------
// A PostgREST UPDATE that no row satisfies is not an error. When the USING
// clause excludes the caller the statement affects zero rows and returns
// 204, so an unguarded write path would report success to a planner whose
// change never happened. The update asks for the row back and treats an
// empty result as the refusal it is.

import { revalidatePath } from "next/cache";

import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

import { KILL_SWITCH_REASON_MAX } from "./constants";

export type KillSwitchResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type KillSwitchInput = {
  /** True pauses every agent; false releases them. */
  engage: boolean;
  /** Why. Required in both directions. */
  reason: string;
};

/** Fields nothing legitimate ever sends. Their presence is refused. */
const FORBIDDEN_FIELDS = [
  "engaged_by",
  "engagedBy",
  "engaged_at",
  "engagedAt",
  "actor",
  "app_role",
  "appRole",
];

export async function setKillSwitch(
  input: KillSwitchInput & Record<string, unknown>,
): Promise<KillSwitchResult> {
  const smuggled = FORBIDDEN_FIELDS.filter((field) => field in input);
  if (smuggled.length > 0) {
    return {
      ok: false,
      error:
        `Refused: the request supplied ${smuggled.join(", ")}. Who flipped the ` +
        `switch is taken from your session, never from the request, so a body ` +
        `that names its own actor is rejected rather than corrected.`,
    };
  }

  const planner = await getSessionPlanner();
  if (!planner?.fullName) {
    return {
      ok: false,
      error:
        "You are signed in but have no planner record, so there is no name to " +
        "record against this change. The switch is left where it is.",
    };
  }

  const reason = input.reason.trim();
  if (reason.length === 0) {
    return {
      ok: false,
      error: input.engage
        ? "Say why the agents are being paused. The reason is what the next person reads before deciding whether to release them."
        : "Say why the agents are being released. A release with no reason is the entry an auditor asks about first.",
    };
  }
  if (reason.length > KILL_SWITCH_REASON_MAX) {
    return {
      ok: false,
      error: `Keep the reason under ${KILL_SWITCH_REASON_MAX} characters; this one is ${reason.length}.`,
    };
  }

  const sb = await createServerAnonClient();

  // The row to move is read here rather than taken from the caller. There is
  // one switch; letting a body choose which row it lands on would be a
  // pointless degree of freedom on the most consequential control in the app.
  const { data: current, error: readError } = await sb
    .from("agent_kill_switch")
    .select("id, engaged")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError || !current) {
    return {
      ok: false,
      error:
        "The kill switch row could not be read, so nothing was changed. That " +
        "is the safe failure: the agents keep running under the bands they " +
        "already had rather than being paused by a request that half worked.",
    };
  }

  if (current.engaged === input.engage) {
    return {
      ok: false,
      error: input.engage
        ? "The agents are already paused. Nothing was written, because a second pause would add an entry that records no change."
        : "The agents are already running. Nothing was written.",
    };
  }

  const { data, error } = await sb
    .from("agent_kill_switch")
    .update({
      engaged: input.engage,
      reason,
      // Session, not body. Both columns are written in both directions: a
      // release is an act with an owner exactly as a pause is, and the screen
      // labels them as the last change rather than as the last pause.
      engaged_by: planner.fullName,
      engaged_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("id, engaged");

  if (error) {
    const denied = /row-level security|42501/i.test(error.message);
    return {
      ok: false,
      error: denied
        ? "Your role cannot move the kill switch. Only a planning manager or a CoE administrator can, which is enforced by the policy on the table rather than by this screen."
        : `The switch was not moved: ${error.message}`,
    };
  }

  // Zero rows back is the RLS refusal described at the top of this file.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "The database accepted the request and changed nothing, which is how " +
        "it refuses a write your role may not make. Only a planning manager " +
        "or a CoE administrator can move the kill switch.",
    };
  }

  revalidatePath("/governance");

  return {
    ok: true,
    message: input.engage
      ? `Every agent is paused, recorded against ${planner.fullName}. Work already in the ledger stays exactly as it was; pausing stops the next run rather than undoing the last one.`
      : `The agents are running again, recorded against ${planner.fullName}. Each one resumes inside the band it had before the pause, not a wider one.`,
  };
}
