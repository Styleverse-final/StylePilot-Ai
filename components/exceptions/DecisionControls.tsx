"use client";

import { useState, useTransition } from "react";

import { recordDecision } from "@/lib/actions";
import { buttonClasses } from "../Button";
import { formatInr } from "./format";

/**
 * Approve / Modify / Reject for one exception.
 *
 * Everything this component knows about accountability is: nothing. It sends
 * a recommendation id, a status, a value and a reason. Who is acting is read
 * from the session inside recordDecision(), on the server, and the insert
 * then goes through the anon client so RLS adjudicates it -- category
 * ownership, the INR 50,00,000 planner ceiling, and the rule that the
 * planner id must match the session. A refusal is therefore not an error
 * state to be smoothed over: it is the governance model answering, so the
 * message comes back onto the screen word for word.
 *
 * A modification and a rejection both require a reason, and the server is
 * what enforces that. This component deliberately does not pre-validate it,
 * because the server's sentence ("The override is the record; without the
 * reason it is just a different number") says more than a red asterisk.
 */

type Status = "APPROVED" | "MODIFIED" | "REJECTED";

/** Structurally the DecisionResult that lib/actions returns. */
type Result = { ok: true; message: string } | { ok: false; error: string };

export type DecisionControlsProps = {
  recommendationId: number;
  /**
   * Prefill for the modify field: the recommendation's own value at stake.
   * The decision row records the recommended value beside the accepted one,
   * and the recommended value for an exception IS value_at_stake_inr, so the
   * two are only comparable if the planner commits in the same unit.
   */
  valueAtStakeInr: number | null;
  /** Set once a decision exists, so the controls read as a re-decision. */
  alreadyDecided: boolean;
};

const FIELD_CLASS =
  "w-full rounded-inner bg-cream px-[12px] py-[9px] text-[12.5px] font-semibold text-ink border-none outline-none placeholder:text-mute";

export function DecisionControls({
  recommendationId,
  valueAtStakeInr,
  alreadyDecided,
}: DecisionControlsProps) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "MODIFIED" | "REJECTED">("idle");
  const [reason, setReason] = useState<string>("");
  const [accepted, setAccepted] = useState<string>(() =>
    typeof valueAtStakeInr === "number" && Number.isFinite(valueAtStakeInr)
      ? String(Math.round(valueAtStakeInr))
      : "",
  );
  const [result, setResult] = useState<Result | null>(null);

  function submit(status: Status): void {
    startTransition(async () => {
      const parsed = Number.parseFloat(accepted);
      const outcome: Result = await recordDecision({
        recommendationId,
        status,
        acceptedValue:
          status === "MODIFIED" && Number.isFinite(parsed) ? parsed : null,
        reason: status === "APPROVED" ? null : reason,
        revalidate: "/exceptions",
      });
      setResult(outcome);
      if (outcome.ok) {
        setMode("idle");
        setReason("");
      }
    });
  }

  const verb = alreadyDecided ? "Re-approve" : "Approve";

  return (
    <div className="min-w-[240px]">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-[7px]">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("APPROVED")}
            className={buttonClasses(
              "orange",
              "sm",
              pending ? "opacity-60 cursor-wait" : undefined,
            )}
          >
            {pending ? "Recording..." : verb}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setResult(null);
              setMode("MODIFIED");
            }}
            className={buttonClasses(
              "default",
              "sm",
              pending ? "opacity-60" : undefined,
            )}
          >
            Modify
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setResult(null);
              setMode("REJECTED");
            }}
            className={buttonClasses(
              "default",
              "sm",
              pending ? "opacity-60" : undefined,
            )}
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[8px] rounded-inner bg-shell p-[12px] max-w-[420px]">
          <div className="text-[11.5px] font-extrabold text-ink">
            {mode === "MODIFIED"
              ? "Commit to a different value"
              : "Reject this exception"}
          </div>

          {mode === "MODIFIED" ? (
            <label className="block">
              <span className="mb-[4px] block text-[10.5px] font-bold text-mute">
                VALUE AT STAKE YOU ARE COMMITTING TO (INR)
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={accepted}
                onChange={(event) => setAccepted(event.target.value)}
                className={`${FIELD_CLASS} tabular-nums`}
                placeholder="Units of INR"
              />
              <span className="mt-[4px] block text-[10.5px] font-semibold text-mute leading-[1.5]">
                The recommendation&apos;s own figure,{" "}
                {formatInr(valueAtStakeInr)}, is written into the same row, so
                the pair reads as one comparison rather than two numbers.
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-[4px] block text-[10.5px] font-bold text-mute">
              REASON
            </span>
            <textarea
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={FIELD_CLASS}
              placeholder={
                mode === "MODIFIED"
                  ? "Why this value rather than the recommended one"
                  : "Why this exception should not be acted on"
              }
            />
          </label>

          <div className="flex flex-wrap gap-[7px]">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(mode)}
              className={buttonClasses(
                "orange",
                "sm",
                pending ? "opacity-60 cursor-wait" : undefined,
              )}
            >
              {pending
                ? "Recording..."
                : mode === "MODIFIED"
                  ? "Record modification"
                  : "Record rejection"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMode("idle");
                setResult(null);
              }}
              className={buttonClasses(
                "default",
                "sm",
                pending ? "opacity-60" : undefined,
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result === null ? null : (
        <p
          role="status"
          className={`mt-[8px] max-w-[420px] rounded-quote px-[11px] py-[8px] text-[11.5px] font-semibold leading-[1.55] ${
            result.ok ? "bg-greenW text-green" : "bg-redW text-red"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

export default DecisionControls;
