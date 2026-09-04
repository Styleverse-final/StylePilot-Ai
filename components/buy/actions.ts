"use server";

// Bulk approval of the hold recommendations on the buy plan.
//
// A hold is the case where the model and the manual plan already agree
// inside the band, so there is nothing to argue about and no reason to make
// a planner click through them one at a time. Approving them together is a
// convenience, not a shortcut: every one of them still becomes its own
// planner_decision row, written by recordDecision, attributed to the
// session's planner and adjudicated by the same RLS policies as a single
// approve. There is no batch write path into planner_decision and this file
// does not create one.
//
// D5 / the Server Action rule: the client sends REFERENCES, never contents.
// The ids arriving here are treated as untrusted -- they are re-read under
// the caller's own RLS and anything that is not an undecided BUY_QUANTITY
// hold is dropped rather than approved. Without that check a caller could
// POST the id of a large REDUCE_BUY and have it approved with no reason
// attached, simply by not going through the UI.

import { revalidatePath } from "next/cache";

import { recordDecision } from "@/lib/actions";
import { createServerAnonClient } from "@/lib/supabase";

export type BulkApproveResult = {
  /** Rows that became a planner_decision row. */
  approved: number;
  /**
   * Ids that were sent but are not undecided BUY_QUANTITY holds, or are not
   * visible to the caller at all. Silence here would be the wrong shape of
   * honesty, so the count is returned and shown.
   */
  skipped: number;
  /** One message per refusal, already phrased for a planner. */
  errors: string[];
};

const BUY_PATH = "/buy";

export async function approveHolds(
  recommendationIds: number[],
): Promise<BulkApproveResult> {
  const ids = [...new Set(recommendationIds)].filter((id) =>
    Number.isInteger(id),
  );
  if (ids.length === 0) {
    return { approved: 0, skipped: 0, errors: [] };
  }

  const sb = await createServerAnonClient();

  // Re-read from a trusted source. RLS decides which of these ids the
  // caller can see at all; the rec_type and action checks decide which of
  // those are genuinely holds.
  const { data: candidates, error } = await sb
    .from("recommendation")
    .select("id, rec_type, action")
    .in("id", ids)
    .eq("rec_type", "BUY_QUANTITY")
    .eq("action", "HOLD");

  if (error) {
    return {
      approved: 0,
      skipped: ids.length,
      errors: ["The hold list could not be re-read, so nothing was approved."],
    };
  }

  const eligible = new Set(candidates.map((row) => row.id));

  // Anything already decided keeps its existing entry. planner_decision is
  // append-only, so approving it again would stack a second row on top of a
  // considered decision rather than confirm it.
  if (eligible.size > 0) {
    const { data: decided } = await sb
      .from("planner_decision")
      .select("recommendation_id")
      .in("recommendation_id", [...eligible]);
    for (const row of decided ?? []) eligible.delete(row.recommendation_id);
  }

  const errors: string[] = [];
  let approved = 0;

  for (const id of ids) {
    if (!eligible.has(id)) continue;
    const result = await recordDecision({
      recommendationId: id,
      status: "APPROVED",
    });
    if (result.ok) approved += 1;
    else errors.push(result.error);
  }

  if (approved > 0) revalidatePath(BUY_PATH);

  return { approved, skipped: ids.length - approved, errors };
}
