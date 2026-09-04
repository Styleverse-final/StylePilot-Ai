import { Pill, type PillVariant } from "@/components/Pill";

import {
  ARROW,
  DASH,
  MIDDOT,
  formatSignedUnits,
  formatTimestamp,
  formatUnits,
  humaniseRole,
} from "./format";
import type { BuyDecision } from "./types";

/**
 * The override, shown beside the recommendation it replaced.
 *
 * THIS IS THE DELIVERABLE, so it is worth saying what it is for. A product
 * that lets a planner change a number and then displays only the changed
 * number has quietly destroyed the evidence: nobody can later ask whether
 * the overrides were right, because there is nothing left to compare
 * against. Keeping both values on screen, permanently, with the name and
 * job title of the person who made the call and the moment they made it,
 * is what turns "the planner disagreed" from an anecdote into a measurable
 * series. It is also the only way the modify rate on the adoption screen
 * means anything.
 *
 * The two numbers sit side by side rather than one replacing the other.
 * There is no toast, and nothing here fades.
 *
 * `superseded` marks an entry that a later decision overtook. It is still
 * rendered in full: planner_decision is append-only, and an earlier
 * decision that is no longer in force is a fact about how the plan was
 * arrived at, not a mistake to be tidied away.
 */

export type DecisionComparisonProps = {
  decision: BuyDecision;
  /** A later decision exists on the same recommendation. */
  superseded?: boolean;
  /** The tighter form that fits inside a table cell. */
  compact?: boolean;
  className?: string;
};

const STATUS_PILL: Record<BuyDecision["status"], PillVariant> = {
  APPROVED: "up",
  MODIFIED: "orange",
  REJECTED: "down",
};

const STATUS_LABEL: Record<BuyDecision["status"], string> = {
  APPROVED: "Approved",
  MODIFIED: "Modified",
  REJECTED: "Rejected",
};

/** What the right-hand column is called, and what goes in it. */
function committedSide(decision: BuyDecision): {
  label: string;
  value: string;
  tone: string;
} {
  if (decision.status === "MODIFIED") {
    return {
      label: "Override",
      value: formatUnits(decision.acceptedValue),
      tone: "text-orange",
    };
  }
  if (decision.status === "APPROVED") {
    return {
      label: "Committed",
      value: formatUnits(decision.recommendedValue),
      tone: "text-green",
    };
  }
  return { label: "Committed", value: DASH, tone: "text-red" };
}

/** The signed gap the override opened against the recommendation. */
function overrideDelta(decision: BuyDecision): string | null {
  if (
    decision.status !== "MODIFIED" ||
    typeof decision.acceptedValue !== "number" ||
    typeof decision.recommendedValue !== "number"
  ) {
    return null;
  }
  return `${formatSignedUnits(
    decision.acceptedValue - decision.recommendedValue,
  )} units against the model`;
}

/** Name, job title and moment. All three, always, or the record is thinner. */
function Attribution({
  decision,
  compact,
}: {
  decision: BuyDecision;
  compact: boolean;
}) {
  const role = humaniseRole(decision.plannerRole);
  const size = compact ? "text-[10.5px]" : "text-small";
  return (
    <div className={`${size} font-semibold text-mute leading-[1.45]`}>
      <span className="font-extrabold text-ink2">{decision.plannerName}</span>
      {role ? (
        <>
          {" "}
          {MIDDOT} {role}
        </>
      ) : null}
      {decision.actorType !== "human" ? (
        <>
          {" "}
          {MIDDOT} {decision.actorType}
        </>
      ) : null}
      <span className="block tabular-nums">
        {formatTimestamp(decision.decidedAt)}
      </span>
    </div>
  );
}

export function DecisionComparison({
  decision,
  superseded = false,
  compact = false,
  className,
}: DecisionComparisonProps) {
  const committed = committedSide(decision);
  const delta = overrideDelta(decision);

  return (
    <div
      className={`${
        compact ? "" : "rounded-inner bg-shell px-[14px] py-[12px]"
      }${superseded ? " opacity-80" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="flex flex-wrap items-center gap-[7px]">
        <Pill variant={STATUS_PILL[decision.status]}>
          {STATUS_LABEL[decision.status]}
        </Pill>
        {superseded ? (
          <span className="text-[10.5px] font-bold text-mute">
            superseded, kept on the record
          </span>
        ) : null}
      </div>

      {/* Both numbers, at once. Never one in place of the other. */}
      <div
        className={`${
          compact ? "mt-[6px] gap-[8px]" : "mt-[10px] gap-[12px]"
        } flex items-end`}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-mute">
            Recommended
          </div>
          <div
            className={`${
              compact ? "text-[13px]" : "text-[17px]"
            } font-extrabold tabular-nums text-ink`}
          >
            {formatUnits(decision.recommendedValue)}
          </div>
        </div>

        <div
          aria-hidden="true"
          className={`${
            compact ? "text-[12px] pb-[2px]" : "text-[15px] pb-[3px]"
          } font-bold text-mute`}
        >
          {ARROW}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-mute">
            {committed.label}
          </div>
          <div
            className={`${
              compact ? "text-[13px]" : "text-[17px]"
            } font-extrabold tabular-nums ${committed.tone}`}
          >
            {committed.value}
          </div>
        </div>
      </div>

      {delta ? (
        <div
          className={`${
            compact ? "mt-[3px] text-[10.5px]" : "mt-[5px] text-small"
          } font-semibold tabular-nums text-mute`}
        >
          {delta}
        </div>
      ) : null}

      {!compact && decision.reason ? (
        <p className="mt-[9px] rounded-quote bg-white px-[12px] py-[9px] text-copy leading-[1.6] text-body">
          {decision.reason}
        </p>
      ) : null}

      <div className={compact ? "mt-[5px]" : "mt-[9px]"}>
        <Attribution decision={decision} compact={compact} />
      </div>

      {!compact ? (
        <div className="mt-[7px] font-mono text-[10.5px] font-bold text-mute">
          {decision.modelVersion}
        </div>
      ) : null}
    </div>
  );
}

export default DecisionComparison;
