import { Card } from "@/components";
import type { AgentRun, TouchlessRate } from "@/lib/queries";

import { AgentActivity } from "./AgentActivity";
import { DecisionThreads } from "./DecisionThreads";

/**
 * AgentsPanel -- blocks 2 and 3, which were always one subject.
 *
 * "This week's decisions" draws how the brand's programme was disposed of --
 * how much the agents closed, how much they handed back, how much is left for
 * a human. "Agent activity" lists the runs that did the disposing. They are
 * the shape and the detail of a single answer to "what have the agents been
 * doing", and as two cards the reader had to notice they were related before
 * either one meant very much.
 *
 * One surface, one rule between them, and the partition reads as the summary
 * of the feed underneath it -- which is what it is.
 */

export type AgentsPanelProps = {
  touchless: TouchlessRate | null;
  runs: readonly AgentRun[];
  /** Exceptions in this reader's scope with no decision on them. */
  openExceptionCount?: number;
  openExceptionValueInr?: number | null;
};

export function AgentsPanel({
  touchless,
  runs,
  openExceptionCount,
  openExceptionValueInr,
}: AgentsPanelProps) {
  return (
    <Card className="flex h-full flex-col">
      <DecisionThreads
        bare
        touchless={touchless}
        openExceptionCount={openExceptionCount}
        openExceptionValueInr={openExceptionValueInr}
      />
      <div aria-hidden="true" className="mx-[20px] border-t border-rule" />
      <AgentActivity bare runs={runs} />
    </Card>
  );
}

export default AgentsPanel;
