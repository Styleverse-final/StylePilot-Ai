import type { ReactNode } from "react";

import { Card, CardBody, CardHeader, ThreadBand } from "@/components";
import type { TouchlessRate } from "@/lib/queries";

import { formatCount } from "./format";

/**
 * DecisionThreads -- block 2.
 *
 * One thread per recommendation, coloured by how it was disposed of. The
 * design reference hardcodes 221 / 297 / 66 against a total of 584. Those
 * numbers were never live. Everything here comes from v_touchless_rate,
 * which is a view over the decision log and moves on every agent run:
 *
 *   agent-executed  = agent_acted
 *   escalated       = agent_escalated
 *   planner review  = everything the agents did not close, which includes
 *                     the buy recommendations they are not allowed to touch
 *
 * The three add to recommendations_total by construction, so the band is a
 * true partition rather than three counts that happen to sit together.
 *
 * `framing` on the view is a ready-made sentence written next to the SQL
 * that produces the numbers. It is rendered verbatim; rewriting it here
 * would let the prose drift away from the arithmetic.
 */

/** Thread colours, lifted from `.th.a`, `.th.b` and `.th.c`. */
const AGENT_COLOR = "#E5DED7";
const REVIEW_COLOR = "#CDBFB4";
const ESCALATED_COLOR = "#D04A02";

export type DecisionThreadsProps = {
  touchless: TouchlessRate | null;
  /** Rendered in the header slot, e.g. the forward-actuals lock tag. */
  headerTag?: ReactNode;
};

export function DecisionThreads({ touchless, headerTag }: DecisionThreadsProps) {
  const acted = Math.max(0, touchless?.agent_acted ?? 0);
  const escalated = Math.max(0, touchless?.agent_escalated ?? 0);
  const reported = Math.max(0, touchless?.recommendations_total ?? 0);

  // The view's agent counters and its recommendation total are not always
  // narrowed by row level security to the identical row set: for a planner
  // whose categories exclude some of what the agents examined, agent_acted +
  // agent_escalated can exceed recommendations_total. Taking the larger of
  // the two as the whole keeps the band an honest partition -- no reported
  // count is altered, and "planner review" is only ever the remainder, which
  // then correctly falls to zero rather than going negative.
  const total = Math.max(reported, acted + escalated);
  const review = total - acted - escalated;

  return (
    <Card>
      <CardHeader
        title="This week's decisions"
        subtitle="Every thread is one recommendation"
        actions={headerTag}
      />
      <CardBody>
        {total === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No recommendations are visible in your scope, so there is no week
            to draw. This is what a planner scoped to a region with no open
            work sees; it is a scope result, not a failure.
          </p>
        ) : (
          <>
            <ThreadBand
              ariaLabel={`${total} decisions by disposition: ${acted} agent-executed, ${review} planner review, ${escalated} escalated`}
              classes={[
                {
                  key: "agent",
                  label: `${formatCount(acted)} agent-executed`,
                  count: acted,
                  color: AGENT_COLOR,
                  height: 0.32,
                },
                {
                  key: "review",
                  label: `${formatCount(review)} planner review`,
                  count: review,
                  color: REVIEW_COLOR,
                  height: 0.58,
                },
                {
                  key: "escalated",
                  label: `${formatCount(escalated)} escalated`,
                  count: escalated,
                  color: ESCALATED_COLOR,
                  height: 1,
                },
              ]}
            />
            {touchless?.framing ? (
              <p className="mt-[12px] max-w-[88ch] text-[12.5px] leading-[1.6] text-body">
                {touchless.framing}
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default DecisionThreads;
