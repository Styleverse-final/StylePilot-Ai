"use client";

import { useCallback, useState, useTransition } from "react";

import { Button, ButtonRow } from "@/components/Button";

import { approveHolds, type BulkApproveResult } from "./actions";
import { formatUnits } from "./format";

/**
 * Bulk approval of the holds.
 *
 * A hold is the case where the recommended buy and the manual plan already
 * agree inside the band. There is no argument to have and no judgement to
 * apply, so making a planner open each one is not diligence, it is a
 * tax that trains people to click through everything without reading -- and
 * the moment that habit exists the meaningful approvals stop meaning
 * anything either.
 *
 * The count is confirmed BEFORE anything is written, because "approve 41
 * things" is exactly the class of action where a mis-click is expensive and
 * an undo does not exist: planner_decision is append-only, so a wrong bulk
 * approve cannot be deleted, only answered by 41 further rows. One extra
 * click is cheap against that.
 *
 * Every hold still becomes its own attributed planner_decision row through
 * recordDecision. Nothing here writes to the database directly.
 */

export type HoldApproval = {
  ids: readonly number[];
  count: number;
  armed: boolean;
  pending: boolean;
  result: BulkApproveResult | null;
  arm: () => void;
  cancel: () => void;
  confirm: () => void;
};

export function useHoldApproval(ids: readonly number[]): HoldApproval {
  const [armed, setArmed] = useState<boolean>(false);
  const [result, setResult] = useState<BulkApproveResult | null>(null);
  const [pending, startTransition] = useTransition();

  const arm = useCallback(() => {
    setResult(null);
    setArmed(true);
  }, []);

  const cancel = useCallback(() => setArmed(false), []);

  const confirm = useCallback(() => {
    const batch = [...ids];
    startTransition(async () => {
      const outcome = await approveHolds(batch);
      setResult(outcome);
      setArmed(false);
    });
  }, [ids]);

  return {
    ids,
    count: ids.length,
    armed,
    pending,
    result,
    arm,
    cancel,
    confirm,
  };
}

export type HoldApprovalBarProps = {
  state: HoldApproval;
  /** What the holds have in common, stated in the confirmation. */
  note: string;
};

/**
 * The confirmation strip. Rendered under the card header so the count has
 * room to be read, rather than as a browser confirm() nobody reads.
 */
export function HoldApprovalBar({ state, note }: HoldApprovalBarProps) {
  if (!state.armed && !state.result && !state.pending) return null;

  if (state.armed || state.pending) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-[14px] border-b border-rule bg-amberW px-[20px] py-[13px]">
        <div>
          <div className="text-[13px] font-extrabold text-ink">
            {`Approve ${formatUnits(state.count)} ${
              state.count === 1 ? "hold" : "holds"
            }?`}
          </div>
          <p className="mt-[3px] max-w-[88ch] text-copy leading-[1.6] text-body">
            {note} Each one is written as its own decision in your name, and
            the record is append-only -- a bulk approve cannot be undone, only
            answered by a later decision on each row.
          </p>
        </div>
        <ButtonRow>
          <Button
            variant="dark"
            size="sm"
            disabled={state.pending}
            onClick={state.confirm}
          >
            {state.pending
              ? "Approving"
              : `Yes, approve ${formatUnits(state.count)}`}
          </Button>
          <Button size="sm" disabled={state.pending} onClick={state.cancel}>
            Cancel
          </Button>
        </ButtonRow>
      </div>
    );
  }

  const result = state.result;
  if (!result) return null;

  const failed = result.errors.length > 0;
  return (
    <div
      role="status"
      className={`border-b border-rule px-[20px] py-[13px] ${
        failed ? "bg-redW" : "bg-greenW"
      }`}
    >
      <div
        className={`text-[13px] font-extrabold ${failed ? "text-red" : "text-green"}`}
      >
        {`${formatUnits(result.approved)} ${
          result.approved === 1 ? "hold" : "holds"
        } approved${
          result.skipped > 0 ? `, ${formatUnits(result.skipped)} left alone` : ""
        }.`}
      </div>
      {result.skipped > 0 && !failed ? (
        <p className="mt-[3px] max-w-[88ch] text-copy leading-[1.6] text-body">
          The rows that were left alone already carry a decision, or are not
          holds you are entitled to act on. They are unchanged.
        </p>
      ) : null}
      {failed ? (
        <ul className="mt-[5px] max-w-[88ch] list-disc pl-[18px] text-copy leading-[1.6] text-body">
          {result.errors.map((message, index) => (
            <li key={`${index}-${message.slice(0, 24)}`}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default HoldApprovalBar;
