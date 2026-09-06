"use client";

import { useState, useTransition } from "react";

import { recordDecision } from "@/lib/actions";
import { buttonClasses } from "../Button";

/**
 * QueueApprove -- settle one row without leaving the command centre.
 *
 * WHY APPROVE, AND ONLY APPROVE
 * -----------------------------
 * recordDecision refuses a MODIFIED without a value and a REJECTED without a
 * reason, and it is right to: "the override is the record; without the reason
 * it is just a different number". Collecting a reason properly needs the room
 * and the context of the screen that owns the decision, so Modify and Reject
 * stay there and this row still links to them.
 *
 * APPROVED is the one status the server accepts on its own, because agreeing
 * with the recommendation adds no information the recommendation does not
 * already carry. That makes it the one decision that can honestly be taken
 * from a summary screen, and taking it here is the difference between a
 * dashboard that reports the queue and one that shortens it.
 *
 * NOTHING ABOUT AUTHORITY IS DECIDED HERE. This sends an id and a status.
 * Who is acting comes from the session inside recordDecision, on the server,
 * and the insert then goes through the anon client so row level security
 * adjudicates it -- category ownership and the INR 50,00,000 planner ceiling
 * included. A refusal is the governance model answering, so it is shown word
 * for word rather than replaced with a generic failure.
 */

type Result = { ok: true; message: string } | { ok: false; error: string };

export type QueueApproveProps = {
  recommendationId: number;
  /** Disambiguates the button for a screen reader working down the table. */
  rowLabel: string;
};

export function QueueApprove({
  recommendationId,
  rowLabel,
}: QueueApproveProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function submit(): void {
    startTransition(async () => {
      setResult(
        await recordDecision({
          recommendationId,
          status: "APPROVED",
          reason: null,
          // The dashboard is what the reader is looking at, so the dashboard
          // is what has to be refetched: the row leaves the open queue and
          // every count in the header band moves with it.
          revalidate: "/",
        }),
      );
    });
  }

  // A row that has just been approved is about to disappear from the queue on
  // the revalidate. Until it does, it says so rather than offering the button
  // again as though nothing had happened.
  if (result?.ok) {
    return (
      <span className="block text-[11.5px] font-semibold leading-[1.5] text-green">
        {result.message}
      </span>
    );
  }

  return (
    <span className="block">
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        aria-label={`Approve ${rowLabel}`}
        className={buttonClasses(
          "orange",
          "sm",
          pending ? "opacity-60 cursor-wait" : undefined,
        )}
      >
        {pending ? "Recording..." : "Approve"}
      </button>

      {result && !result.ok ? (
        <span
          role="status"
          className="mt-[6px] block max-w-[34ch] text-[11.5px] font-semibold leading-[1.5] text-red"
        >
          {result.error}
        </span>
      ) : null}
    </span>
  );
}

export default QueueApprove;
