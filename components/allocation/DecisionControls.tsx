"use client";

import { useId, useState, useTransition } from "react";

import { Button, ButtonRow } from "@/components";
import {
  recordDecision,
  type DecisionResult,
  type DecisionStatus,
} from "@/lib/actions";

/**
 * Approve / Modify / Reject for one allocation row.
 *
 * The write itself is `recordDecision` and nothing else. This component
 * sends a recommendation id, a status, a quantity and a reason; it does not
 * send -- and cannot usefully send -- who is acting. Accountability is taken
 * from the session on the server, and a body that names its own planner is
 * refused there rather than corrected, so there is deliberately no field for
 * it here.
 *
 * Modify and Reject both hold the buttons until a reason exists, because the
 * override reason IS the record. Without it a modification is just a
 * different number with no argument attached to it, which is the thing the
 * learning loop cannot classify later.
 *
 * A refusal is shown verbatim. Most refusals here are row level security
 * doing its job -- a category the planner does not own, or a value above the
 * planner ceiling -- and the honest thing is to say so rather than to hide
 * the control and imply the decision does not exist.
 */

export type DecisionControlsProps = {
  recommendationId: number;
  /** The optimiser's split, and the starting value of a modification. */
  recommendedUnits: number;
  /** Names the row in the confirmation line, e.g. "IN-N in TOPS RETAIL". */
  rowLabel: string;
  /** Path revalidated after a successful write. */
  revalidate: string;
};

type Mode = "idle" | "MODIFIED" | "REJECTED";

export function DecisionControls({
  recommendationId,
  recommendedUnits,
  rowLabel,
  revalidate,
}: DecisionControlsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [units, setUnits] = useState<string>(String(Math.round(recommendedUnits)));
  const [reason, setReason] = useState<string>("");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const unitsId = useId();
  const reasonId = useId();

  const submit = (status: DecisionStatus): void => {
    const trimmed = reason.trim();
    const parsed = Number.parseInt(units, 10);

    startTransition(async () => {
      const outcome = await recordDecision({
        recommendationId,
        status,
        acceptedValue: status === "MODIFIED" ? parsed : null,
        reason: status === "APPROVED" ? null : trimmed,
        revalidate,
      });
      setResult(outcome);
      if (outcome.ok) {
        setMode("idle");
        setReason("");
      }
    });
  };

  const reasonMissing = reason.trim().length === 0;
  const unitsInvalid = !Number.isFinite(Number.parseInt(units, 10));

  return (
    <div>
      <ButtonRow>
        <Button
          size="sm"
          variant="dark"
          disabled={pending}
          onClick={() => {
            setMode("idle");
            submit("APPROVED");
          }}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant={mode === "MODIFIED" ? "orange" : "default"}
          aria-expanded={mode === "MODIFIED"}
          disabled={pending}
          onClick={() => setMode(mode === "MODIFIED" ? "idle" : "MODIFIED")}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant={mode === "REJECTED" ? "orange" : "default"}
          aria-expanded={mode === "REJECTED"}
          disabled={pending}
          onClick={() => setMode(mode === "REJECTED" ? "idle" : "REJECTED")}
        >
          Reject
        </Button>
        {pending ? (
          <span className="self-center text-[11.5px] font-semibold text-mute">
            Recording{String.fromCharCode(0x2026)}
          </span>
        ) : null}
      </ButtonRow>

      {mode === "idle" ? null : (
        <div className="mt-[9px] max-w-[52ch] rounded-quote bg-shell px-[14px] py-[11px]">
          {mode === "MODIFIED" ? (
            <div className="mb-[8px]">
              <label
                htmlFor={unitsId}
                className="block text-[10.5px] font-bold tracking-[0.04em] text-mute"
              >
                Units you are committing to
              </label>
              <input
                id={unitsId}
                name="accepted_units"
                type="number"
                inputMode="numeric"
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                className="mt-[4px] h-[32px] w-[160px] rounded-pill border border-rule2 bg-white px-[12px] text-[12.5px] tabular-nums text-ink outline-none focus:border-orange"
              />
            </div>
          ) : null}

          <label
            htmlFor={reasonId}
            className="block text-[10.5px] font-bold tracking-[0.04em] text-mute"
          >
            {mode === "MODIFIED"
              ? "Why the optimiser is wrong here"
              : "Why this shift should not happen"}
          </label>
          <textarea
            id={reasonId}
            name="override_reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-[4px] w-full rounded-quote border border-rule2 bg-white px-[12px] py-[8px] text-[12.5px] leading-[1.5] text-ink outline-none focus:border-orange"
          />

          <div className="mt-[9px] flex flex-wrap items-center gap-[8px]">
            <Button
              size="sm"
              variant="orange"
              disabled={pending || reasonMissing || (mode === "MODIFIED" && unitsInvalid)}
              onClick={() => submit(mode)}
            >
              {mode === "MODIFIED" ? "Commit modification" : "Commit rejection"}
            </Button>
            <Button size="sm" disabled={pending} onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <span className="text-[11.5px] font-semibold text-mute">
              {reasonMissing
                ? "A reason is required. It is the record, not a formality."
                : `Recorded against ${rowLabel}, append-only.`}
            </span>
          </div>
        </div>
      )}

      {result === null ? null : (
        <p
          role="status"
          className={`mt-[8px] max-w-[64ch] text-[11.5px] font-semibold leading-[1.6] ${
            result.ok ? "text-green" : "text-red"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}

export default DecisionControls;
