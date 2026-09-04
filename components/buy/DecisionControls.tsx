"use client";

import { useId, useState, useTransition, type FormEvent } from "react";

import { Button, ButtonRow } from "@/components/Button";
import { recordDecision } from "@/lib/actions";

import { formatUnits } from "./format";

/**
 * Approve, Modify, Reject -- the human-in-the-loop control.
 *
 * MODIFY IS THE POINT. A recommender that a planner can only take or leave
 * is not decision support, it is an oracle, and the first time it is wrong
 * about something the planner knows the whole thing is switched off. The
 * control that matters is the one that lets the planner commit a different
 * number AND makes them say why, because the reason is what turns a
 * disagreement into training signal instead of noise.
 *
 * Three rules are enforced here and re-enforced on the server:
 *
 *   1. The reason is required. An override with no reason is just a
 *      different number, so the submit is blocked in the browser and
 *      recordDecision refuses it again on the server for anyone who skips
 *      the browser.
 *   2. Nothing is updated. planner_decision is append-only and a change of
 *      mind is a new row; there is no edit path in this component because
 *      there is no edit path in the database.
 *   3. Accountability is not a form field. The planner's name and employee
 *      id come from the session inside recordDecision -- this component
 *      never sends them, and a body that tried to would be refused.
 *
 * After a successful write the action revalidates /buy, so the server
 * re-renders the row and the override appears beside the recommendation it
 * replaced. The confirmation below is a receipt, not the record.
 */

export type DecisionControlsProps = {
  recommendationId: number;
  /** The model's number. Prefills the override input. */
  recommendedUnits: number;
  /** Series name, for the fieldset legend. */
  seriesLabel: string;
};

type Mode = "idle" | "modify" | "reject";

const PATH = "/buy";

export function DecisionControls({
  recommendationId,
  recommendedUnits,
  seriesLabel,
}: DecisionControlsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [units, setUnits] = useState<string>(String(Math.round(recommendedUnits)));
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unitsId = useId();
  const reasonId = useId();
  const errorId = useId();

  function reset(next: Mode) {
    setMode(next);
    setError(null);
    setReceipt(null);
    if (next === "modify") setUnits(String(Math.round(recommendedUnits)));
    if (next === "idle") setReason("");
  }

  function commit(
    status: "APPROVED" | "MODIFIED" | "REJECTED",
    acceptedValue: number | null,
    text: string,
  ) {
    setError(null);
    setReceipt(null);
    startTransition(async () => {
      const result = await recordDecision({
        recommendationId,
        status,
        acceptedValue,
        reason: text,
        revalidate: PATH,
      });
      if (result.ok) {
        setReceipt(result.message);
        setReason("");
        setMode("idle");
      } else {
        setError(result.error);
      }
    });
  }

  function submitModify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      // Rule 1, in the browser. The server refuses it again regardless.
      setError(
        "A modification needs a reason. The override is the record; without the reason it is just a different number.",
      );
      return;
    }
    const value = Number.parseFloat(units);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter the quantity you are committing to, in whole units.");
      return;
    }
    commit("MODIFIED", Math.round(value), trimmed);
  }

  function submitReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("A rejection needs a reason.");
      return;
    }
    commit("REJECTED", null, trimmed);
  }

  const parsed = Number.parseFloat(units);
  const delta = Number.isFinite(parsed)
    ? Math.round(parsed) - Math.round(recommendedUnits)
    : null;

  return (
    <div>
      {mode === "idle" ? (
        <ButtonRow>
          <Button
            variant="orange"
            size="sm"
            disabled={pending}
            onClick={() => commit("APPROVED", null, "")}
          >
            Approve
          </Button>
          <Button size="sm" disabled={pending} onClick={() => reset("modify")}>
            Modify
          </Button>
          <Button size="sm" disabled={pending} onClick={() => reset("reject")}>
            Reject
          </Button>
        </ButtonRow>
      ) : null}

      {mode === "modify" ? (
        <form onSubmit={submitModify}>
          <fieldset
            disabled={pending}
            className="rounded-inner bg-shell px-[14px] py-[13px]"
          >
            <legend className="sr-only">
              Modify the recommended buy for {seriesLabel}
            </legend>

            <div className="flex flex-wrap items-end gap-[16px]">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-mute">
                  Recommended
                </div>
                <div className="mt-[3px] text-[17px] font-extrabold tabular-nums text-ink">
                  {formatUnits(recommendedUnits)}
                </div>
              </div>

              <div>
                <label
                  htmlFor={unitsId}
                  className="block text-[10px] font-bold uppercase tracking-[0.06em] text-mute"
                >
                  Your quantity
                </label>
                <input
                  id={unitsId}
                  name="acceptedValue"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={0}
                  required
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  className="mt-[3px] w-[140px] rounded-[10px] border border-rule2 bg-white px-[10px] py-[7px] text-[15px] font-extrabold tabular-nums text-ink outline-none focus:border-orange"
                />
              </div>

              {delta === null ? null : (
                <div className="pb-[7px] text-small font-semibold tabular-nums text-mute">
                  {delta === 0
                    ? "No change against the model"
                    : `${delta > 0 ? "+" : ""}${formatUnits(delta)} units against the model`}
                </div>
              )}
            </div>

            <div className="mt-[12px]">
              <label
                htmlFor={reasonId}
                className="block text-[10px] font-bold uppercase tracking-[0.06em] text-mute"
              >
                Why (required)
              </label>
              <textarea
                id={reasonId}
                name="reason"
                required
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby={error ? errorId : undefined}
                placeholder="What do you know that the model does not?"
                className="mt-[3px] w-full rounded-[12px] border border-rule2 bg-white px-[12px] py-[9px] text-copy leading-[1.55] text-ink outline-none focus:border-orange"
              />
              <p className="mt-[5px] text-small font-semibold text-mute leading-[1.5]">
                Saved as a new decision beside the recommendation. Earlier
                entries stay on the record; nothing is overwritten.
              </p>
            </div>

            <ButtonRow className="mt-[12px]">
              <Button
                type="submit"
                variant="orange"
                size="sm"
                disabled={pending || reason.trim().length === 0}
              >
                {pending ? "Saving" : "Save override"}
              </Button>
              <Button size="sm" onClick={() => reset("idle")}>
                Cancel
              </Button>
            </ButtonRow>
          </fieldset>
        </form>
      ) : null}

      {mode === "reject" ? (
        <form onSubmit={submitReject}>
          <fieldset
            disabled={pending}
            className="rounded-inner bg-shell px-[14px] py-[13px]"
          >
            <legend className="sr-only">
              Reject the recommended buy for {seriesLabel}
            </legend>
            <label
              htmlFor={`${reasonId}-reject`}
              className="block text-[10px] font-bold uppercase tracking-[0.06em] text-mute"
            >
              Why (required)
            </label>
            <textarea
              id={`${reasonId}-reject`}
              name="reason"
              required
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={error ? errorId : undefined}
              className="mt-[3px] w-full rounded-[12px] border border-rule2 bg-white px-[12px] py-[9px] text-copy leading-[1.55] text-ink outline-none focus:border-orange"
            />
            <ButtonRow className="mt-[12px]">
              <Button
                type="submit"
                variant="dark"
                size="sm"
                disabled={pending || reason.trim().length === 0}
              >
                {pending ? "Saving" : "Record rejection"}
              </Button>
              <Button size="sm" onClick={() => reset("idle")}>
                Cancel
              </Button>
            </ButtonRow>
          </fieldset>
        </form>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-[10px] rounded-quote bg-redW px-[12px] py-[9px] text-copy font-semibold leading-[1.55] text-red"
        >
          {error}
        </p>
      ) : null}

      {receipt ? (
        <p
          role="status"
          className="mt-[10px] rounded-quote bg-greenW px-[12px] py-[9px] text-copy font-semibold leading-[1.55] text-green"
        >
          {receipt}
        </p>
      ) : null}
    </div>
  );
}

export default DecisionControls;
