"use client";

import { useId, useState, useTransition, type FormEvent } from "react";

import { Button, ButtonRow } from "@/components/Button";
import { Card, CardBody, CardHeader } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { RoleGate, roleAllows, type AppRole } from "@/components/RoleGate";

import { setKillSwitch } from "./actions";
import { KILL_SWITCH_REASON_MAX } from "./constants";

/**
 * THE KILL SWITCH.
 *
 * WHY A PLANNER SEES IT AT ALL
 * ----------------------------
 * Hiding a control from the people who cannot use it makes the product lie
 * about its own governance: it suggests the system has no kill switch, when
 * what it actually has is a kill switch two named roles own. A planner sees
 * it disabled, with a line naming who can act, because that is the true
 * shape of the arrangement and this is the screen where the arrangement is
 * the subject.
 *
 * WHY THE CONTROL IS REAL RATHER THAN A PROP
 * ------------------------------------------
 * agent_kill_switch already carries an UPDATE policy for planning_manager
 * and coe_admin over a read policy of USING (true). The database is willing
 * to accept this write from those two roles, so building a dead button would
 * be understating what exists. The write goes through the anon client
 * carrying the caller's cookie, so the policy -- not this component --
 * decides. A planner who defeats the disabled attribute reaches a server
 * action that refuses them, and behind that a database that refuses them
 * again by matching zero rows.
 *
 * WHY PAUSING ASKS FOR A REASON, AND SO DOES RELEASING
 * ---------------------------------------------------
 * Both are consequential and both are recorded on the row. An unexplained
 * release is the entry an auditor asks about first, so the same box appears
 * in both directions.
 */

/**
 * The roles the database will accept an UPDATE from. Deliberately identical
 * to the array in agent_kill_switch_mgr_update -- if that policy changes,
 * this changes with it, and until then a mismatch can only ever disable a
 * control someone was entitled to use, never enable one they were not.
 */
export const KILL_SWITCH_ROLES: readonly AppRole[] = ["planning_manager", "coe_admin"];

export type KillSwitchProps = {
  /** The row, or null when it could not be read. */
  state: {
    engaged: boolean;
    reason: string | null;
    engagedBy: string | null;
    /** Pre-formatted on the server so both renders agree. */
    changedAt: string | null;
  } | null;
  /** app_role from the session. */
  role: string | null;
  /** That role in words, e.g. "Category manager". Formatted on the server. */
  roleLabel: string | null;
};

export function KillSwitch({ state, role, roleLabel }: KillSwitchProps) {
  const [mode, setMode] = useState<"idle" | "confirm">("idle");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasonId = useId();
  const errorId = useId();

  const permitted = roleAllows(role, KILL_SWITCH_ROLES);
  const engaged = state?.engaged ?? false;
  const engaging = !engaged;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError(
        engaging
          ? "Say why the agents are being paused. The reason is what the next person reads before deciding whether to release them."
          : "Say why the agents are being released.",
      );
      return;
    }
    setError(null);
    setReceipt(null);
    startTransition(async () => {
      const result = await setKillSwitch({ engage: engaging, reason: trimmed });
      if (result.ok) {
        setReceipt(result.message);
        setReason("");
        setMode("idle");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Kill switch"
        subtitle="Stops the next run. Never rewrites the last one."
        actions={
          state === null ? (
            <Pill variant="grey">state unreadable</Pill>
          ) : engaged ? (
            <Pill variant="down">all agents paused</Pill>
          ) : (
            <Pill variant="up">agents running</Pill>
          )
        }
      />
      <CardBody>
        {state === null ? (
          <p className="max-w-[80ch] text-copy leading-[1.6] text-body">
            The kill switch row could not be read, so this panel cannot tell you
            whether the agents are running. It is not showing you a reassuring
            default: agent_kill_switch is readable to every authenticated user
            by policy, so a failure here is a failure to reach the table rather
            than a permission you lack.
          </p>
        ) : (
          <>
            <p className="max-w-[80ch] text-copy leading-[1.6] text-body">
              {engaged
                ? "Every agent is paused. Nothing is executing inside a band while this is engaged; recommendations still reach the queue, and a person decides each one."
                : "Every agent is running inside the bands published below. Pausing stops the next run -- it does not reverse an action already in the ledger, because the ledger is append-only and a reversal is its own entry with its own author."}
            </p>

            <div className="mt-[10px] rounded-quote bg-shell px-[14px] py-[11px] max-w-[80ch]">
              <div className="text-copy leading-[1.55] text-body">
                <span className="font-bold text-ink">Reason on the row. </span>
                {state.reason ?? "None recorded."}
              </div>
              <div className="mt-[5px] text-small font-semibold leading-[1.6] text-mute">
                {state.engagedBy || state.changedAt ? (
                  <>
                    Last change{state.engagedBy ? ` by ${state.engagedBy}` : ""}
                    {state.changedAt ? ` at ${state.changedAt}` : ""}. The columns
                    are named engaged_by and engaged_at; this screen writes both
                    on a release as well as on a pause, because a release is an
                    act with an owner exactly as a pause is.
                  </>
                ) : (
                  <>
                    Nobody has moved this switch: engaged_by and engaged_at are
                    both empty, and the reason above is the value the row was
                    seeded with rather than something a person wrote.
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* The line naming who can act is rendered for EVERYONE, not only in
            the disabled tooltip. A planner should be able to read who to ask
            without hovering something. */}
        <div className="mt-[12px] text-small font-semibold leading-[1.6] text-mute">
          {permitted ? (
            <>
              You can move this switch:{" "}
              <span className="font-bold text-ink">
                {roleLabel ?? "your role"}
              </span>{" "}
              is one of the two roles agent_kill_switch accepts an update from,
              the other being a{" "}
              {role === "coe_admin" ? "planning manager" : "CoE administrator"}.
              The database enforces that, not this screen.
            </>
          ) : (
            <>
              Only a planning manager or a CoE administrator can pause the
              agents. You are signed in as{" "}
              <span className="font-bold text-ink">
                {roleLabel ?? "a role with no name on it"}
              </span>
              , so the control below is disabled -- and it would be refused by
              the policy on the table even if it were not, which is where the
              rule actually lives.
            </>
          )}
        </div>

        {state === null ? null : mode === "idle" ? (
          <ButtonRow className="mt-[10px]">
            <RoleGate
              role={role}
              allow={KILL_SWITCH_ROLES}
              action={engaging ? "pause every agent" : "release the agents"}
            >
              <Button
                variant={engaging ? "default" : "orange"}
                size="md"
                disabled={!permitted || pending}
                onClick={() => {
                  setMode("confirm");
                  setError(null);
                  setReceipt(null);
                }}
                /* The red wash the spec puts on "Pause all agents". Applied
                   as a style rather than a class so it cannot lose a
                   specificity race with the variant's own background. The
                   values are the design tokens from globals.css, not new
                   colours. */
                style={
                  engaging && permitted
                    ? { background: "var(--redW)", color: "var(--red)" }
                    : undefined
                }
              >
                {engaging ? "Pause all agents" : "Release the agents"}
              </Button>
            </RoleGate>
          </ButtonRow>
        ) : (
          <form onSubmit={submit} className="mt-[10px]">
            <label
              htmlFor={reasonId}
              className="block text-small font-bold text-mute"
            >
              {engaging
                ? "Why are the agents being paused?"
                : "Why are the agents being released?"}
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              disabled={!permitted || pending}
              aria-describedby={error ? errorId : undefined}
              className="mt-[5px] w-full rounded-quote border border-rule2 bg-white px-[11px] py-[9px] text-copy leading-[1.55] text-ink outline-none focus:border-orange disabled:opacity-55"
              maxLength={KILL_SWITCH_REASON_MAX}
              placeholder={
                engaging
                  ? "What changed, and what has to be true before they run again."
                  : "What was fixed, and why the bands can be trusted again."
              }
            />
            <div className="mt-[4px] text-small font-semibold leading-[1.6] text-mute">
              Written to the row and read by whoever decides what happens next,
              so write it for them. Up to {KILL_SWITCH_REASON_MAX} characters -- a length
              this screen chose, long enough for a sentence and a ticket
              reference.
            </div>
            <ButtonRow className="mt-[8px]">
              <Button
                type="submit"
                variant="orange"
                size="md"
                disabled={!permitted || pending}
              >
                {pending
                  ? "Recording..."
                  : engaging
                    ? "Confirm pause"
                    : "Confirm release"}
              </Button>
              <Button
                type="button"
                size="md"
                disabled={pending}
                onClick={() => {
                  setMode("idle");
                  setReason("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </ButtonRow>
          </form>
        )}

        {error ? (
          <div
            id={errorId}
            role="alert"
            className="mt-[10px] rounded-quote bg-redW px-[12px] py-[9px] text-copy leading-[1.55] text-red max-w-[80ch]"
          >
            {error}
          </div>
        ) : null}

        {receipt ? (
          <div className="mt-[10px] rounded-quote bg-greenW px-[12px] py-[9px] text-copy leading-[1.55] text-ink max-w-[80ch]">
            {receipt}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
