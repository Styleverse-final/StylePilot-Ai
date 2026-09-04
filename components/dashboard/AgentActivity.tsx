import { Card, CardBody, CardHeader, Pill } from "@/components";
import type { AgentRun } from "@/lib/queries";

import { agentBadge, formatClock, formatCount, humanise, plural } from "./format";

/**
 * AgentActivity -- block 3.
 *
 * Ports `.agent` and `.abadge`: a 26px square badge, the run line, and the
 * clock face on the right.
 *
 * WHAT IS SHOWN, AND WHY IT IS NOT A SUM
 * --------------------------------------
 * agent_run holds one row per execution, and an agent can execute several
 * times in a day. Adding items_examined across those rows would count the
 * same 108 series once per run and report a number no agent ever produced.
 * So the feed shows the MOST RECENT run per agent within the window and
 * says how many runs it stands for. The counts on screen are therefore a
 * real row from the table, not an aggregate nobody can reproduce.
 *
 * `summary` is written by the agent itself and names the band it acted
 * inside and the person accountable for it; it is rendered as written.
 */

const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export type AgentActivityProps = {
  runs: readonly AgentRun[];
  /** Evaluated once on the server so the window is stable for the render. */
  now: number;
};

type FeedEntry = {
  key: string;
  run: AgentRun;
  runsInWindow: number;
};

/** Latest run per agent (and brand, for an account that sees both). */
function collapse(runs: readonly AgentRun[], now: number): FeedEntry[] {
  const byAgent = new Map<string, FeedEntry>();

  for (const run of runs) {
    const startedAt = Date.parse(run.started_at);
    if (!Number.isFinite(startedAt) || now - startedAt > WINDOW_MS) continue;

    const key = `${run.agent_name}|${run.brand_id ?? ""}`;
    const existing = byAgent.get(key);
    if (!existing) {
      byAgent.set(key, { key, run, runsInWindow: 1 });
      continue;
    }
    existing.runsInWindow += 1;
    if (startedAt > Date.parse(existing.run.started_at)) existing.run = run;
  }

  return [...byAgent.values()].sort(
    (a, b) => Date.parse(b.run.started_at) - Date.parse(a.run.started_at),
  );
}

export function AgentActivity({ runs, now }: AgentActivityProps) {
  const entries = collapse(runs, now);

  return (
    <Card>
      <CardHeader
        title={`Agent activity, last ${WINDOW_HOURS} hours`}
        subtitle="Every action written to the same audit trail as a human decision"
        actions={
          entries.length > 0 ? (
            <span className="rounded-pill bg-cream px-[12px] py-[5px] text-[11.5px] font-semibold text-body">
              {formatCount(entries.length)}{" "}
              {plural(entries.length, "agent", "agents")}
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No agent has run in your scope in the last {WINDOW_HOURS} hours.
            The feed stays empty rather than replaying an older run as if it
            were overnight work.
          </p>
        ) : (
          <>
            {entries.map(({ key, run, runsInWindow }) => (
              <div
                key={key}
                className="grid grid-cols-[26px_1fr_auto] items-center gap-[11px] border-b border-rule py-[10px] last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-violetW text-[12px] font-extrabold text-violet"
                >
                  {agentBadge(run.agent_name)}
                </span>
                <div>
                  <div className="text-[12.5px] font-bold text-ink">
                    {humanise(run.agent_name)}
                    {run.brand_id ? (
                      <span className="font-semibold text-mute">
                        {" "}
                        &middot; {run.brand_id}
                      </span>
                    ) : null}{" "}
                    examined {formatCount(run.items_examined)}, acted on{" "}
                    {formatCount(run.items_acted)}, escalated{" "}
                    {formatCount(run.items_escalated)}
                  </div>
                  <div className="mt-[1px] text-[11.5px] font-semibold leading-[1.6] text-mute">
                    {run.summary ??
                      `Run ${run.run_id} finished with status ${run.status ?? "unknown"}.`}
                    {runsInWindow > 1 ? (
                      <>
                        {" "}
                        Most recent of {formatCount(runsInWindow)} runs in the
                        window; counts are that run, not a sum across runs.
                      </>
                    ) : null}
                  </div>
                </div>
                <Pill
                  variant={(run.items_escalated ?? 0) > 0 ? "orange" : "violet"}
                  tabular
                >
                  {formatClock(run.started_at) ?? "--"}
                </Pill>
              </div>
            ))}
            <p className="mt-[12px] text-[11.5px] font-semibold leading-[1.6] text-mute">
              Agent actions land in the same planner_decision ledger as human
              ones, with actor_type &quot;agent&quot; and the agent version,
              so a planner can reverse one and the original stays visible.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default AgentActivity;
