import { Card, CardBody, CardHeader, Why } from "@/components";
import type { AgentRun } from "@/lib/queries";

import {
  MIDDOT,
  agentBadge,
  formatCount,
  formatStamp,
  humanise,
  plural,
} from "./format";
import { AgentRunRow } from "./AgentRunRow";
import { OPEN_EXCEPTIONS_HREF } from "./DecisionThreads";
import { PanelSection } from "./PanelSection";

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
 * `summary` is written by the agent itself and names the band it acted inside
 * and the person accountable for it. It is rendered as written, with ONE
 * exception, described at trimCounts() below: the agents open their summaries
 * by restating the very counts this component already lays out, so the row was
 * printing "examined 0, acted on 0, escalated 0" twice, fourteen pixels apart.
 * That opening clause is dropped when it is recognisably present; everything
 * the summary uniquely carries is untouched.
 *
 * THE SHARE IS THE SIGNAL, NOT THE COUNTS
 * ---------------------------------------
 * Every row used to read "examined 79, acted 40, escalated 39" and leave the
 * reader to divide. The counts differ by an order of magnitude between agents
 * -- the forecast agent looks at 324 series a day, the allocation agent at 63
 * -- so the raw numbers cannot be compared down the column at all. What CAN be
 * compared, and what a planner would act on, is the share each agent hands
 * back: on this data the exception agent escalates half of what it examines
 * and the forecast agent seven per cent of what it examines. That is the fact
 * the panel exists to surface, and it now leads each row as a bar.
 *
 * The escalated count carries the link, because it is the number a planner
 * does something about -- the same destination the disposition bar above this
 * feed already points at.
 *
 * A RUN THAT EXAMINED NOTHING SORTS LAST. It is still shown -- dropping it
 * would misreport which agents ran -- but it reads "no work in scope this run"
 * rather than three zeroes, and it no longer leads the feed. An agent with an
 * empty in-tray did not perform badly, and it is not what a planner opened
 * this panel to read.
 *
 * THE WINDOW ENDS AT THE DATA, NOT AT THE CLOCK
 * ---------------------------------------------
 * It used to be the 24 hours before Date.now(). Two things were wrong with
 * that. It read the clock during render, which is impure and which the React
 * compiler refuses. And on any deployment whose newest run is older than a
 * day -- this one, where the runs are from 3 September -- it rendered a card
 * containing nothing but an explanation of why it was empty, in the first
 * screenful, every morning.
 *
 * The window now ends at the newest run the reader can see, and the card
 * names that instant in its subtitle. The original concern was that a stale
 * run must not be replayed as if it were overnight work; dating the window
 * answers that directly rather than by withholding the runs. A reader is told
 * these are the 24 hours to 3 September, which is a fact about the data, and
 * an empty card is not.
 */

const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export type AgentActivityProps = {
  runs: readonly AgentRun[];
  /** Render without card chrome, for a caller that is already a card. */
  bare?: boolean;
};

type FeedEntry = {
  key: string;
  run: AgentRun;
  runsInWindow: number;
  /** How many of those runs examined nothing. */
  idleRuns: number;
};

/**
 * What share of what a run examined it handed back to a human, 0..100.
 *
 * Null when it examined nothing: a run with an empty in-tray has no share, and
 * rendering 0% would say it handed nothing back, which is true but reads as a
 * performance figure rather than an absence of work.
 */
function handbackPct(run: AgentRun): number | null {
  const examined = run.items_examined ?? 0;
  if (examined <= 0) return null;
  return ((run.items_escalated ?? 0) / examined) * 100;
}

/**
 * Strip the agents' own restatement of the three counts from the head of a
 * summary, so the row does not print them twice.
 *
 * Anchored at the start and deliberately narrow: it matches only the shape the
 * agents write -- a version token, then "examined N, acted on N, escalated N;"
 * -- and returns the summary untouched when it does not match. What remains is
 * what the sentence uniquely carries: who is accountable, and which band was
 * enabled.
 */
function trimCounts(summary: string): string {
  return summary
    .replace(
      /^[^;]*?examined\s[\d,]+,\s*acted on\s[\d,]+,\s*escalated\s[\d,]+;\s*/i,
      "",
    )
    .trim();
}

/** Did this run have anything to look at? */
function didWork(run: AgentRun): boolean {
  return (run.items_examined ?? 0) > 0;
}

/** Latest run per agent (and brand, for an account that sees both). */
function collapse(runs: readonly AgentRun[], now: number): FeedEntry[] {
  const byAgent = new Map<string, FeedEntry>();

  for (const run of runs) {
    const startedAt = Date.parse(run.started_at);
    if (!Number.isFinite(startedAt) || now - startedAt > WINDOW_MS) continue;

    const key = `${run.agent_name}|${run.brand_id ?? ""}`;
    const existing = byAgent.get(key);
    const idle = didWork(run) ? 0 : 1;
    if (!existing) {
      byAgent.set(key, { key, run, runsInWindow: 1, idleRuns: idle });
      continue;
    }
    existing.runsInWindow += 1;
    existing.idleRuns += idle;
    if (startedAt > Date.parse(existing.run.started_at)) existing.run = run;
  }

  return [...byAgent.values()].sort((a, b) => {
    // Runs that did something come first; within each group, newest first.
    const worked = Number(didWork(b.run)) - Number(didWork(a.run));
    if (worked !== 0) return worked;
    return Date.parse(b.run.started_at) - Date.parse(a.run.started_at);
  });
}

/** The newest run the reader can see. The window is measured back from it. */
function newestRun(runs: readonly AgentRun[]): AgentRun | null {
  let newest: AgentRun | null = null;
  let at = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const started = Date.parse(run.started_at);
    if (Number.isFinite(started) && started > at) {
      at = started;
      newest = run;
    }
  }
  return newest;
}

export function AgentActivity({ runs, bare = false }: AgentActivityProps) {
  const anchor = newestRun(runs);
  const entries =
    anchor === null ? [] : collapse(runs, Date.parse(anchor.started_at));
  const windowEnd = formatStamp(anchor?.started_at);

  const title = "Agent activity";
  const subtitle =
    windowEnd === null
      ? "Every action written to the same audit trail as a human decision"
      : `The ${WINDOW_HOURS} hours to ${windowEnd} IST, the newest run in your scope`;
  const actions =
    entries.length > 0 ? (
      <span className="rounded-pill bg-cream px-[12px] py-[5px] text-[11.5px] font-semibold text-body">
        {formatCount(entries.length)}{" "}
        {plural(entries.length, "agent", "agents")}
      </span>
    ) : undefined;

  // Agents that found work, and agents that did not. The second group is
  // reported in one sentence at the foot rather than as a row each: an agent
  // with an empty in-tray is worth stating and is not worth a badge, a bar and
  // a provenance line.
  const worked = entries.filter((entry) => didWork(entry.run));
  const idle = entries.filter((entry) => !didWork(entry.run));

  const body = (
    <>
      {entries.length === 0 ? (
        <p className="text-[12.5px] leading-[1.6] text-body">
          No agent run is readable in your scope, so there is no activity to
          report. Nothing is replayed from another scope to fill the gap.
        </p>
      ) : (
        <>
          {worked.map(({ key, run, runsInWindow }) => (
            <AgentRunRow
              key={key}
              badge={agentBadge(run.agent_name)}
              name={humanise(run.agent_name)}
              brandId={run.brand_id}
              version={run.agent_version}
              examined={formatCount(run.items_examined)}
              acted={formatCount(run.items_acted)}
              escalated={formatCount(run.items_escalated)}
              sharePct={handbackPct(run) ?? 0}
              escalatedHref={OPEN_EXCEPTIONS_HREF}
              summary={
                run.summary
                  ? trimCounts(run.summary)
                  : `Run ${run.run_id} finished with status ${run.status ?? "unknown"}.`
              }
              runsInWindow={runsInWindow}
            />
          ))}

          {idle.length === 0 ? null : (
            <p className="mt-[9px] text-[11.5px] font-semibold leading-[1.5] text-mute">
              {idle.map(({ key, run, runsInWindow, idleRuns }, index) => (
                <span key={key}>
                  {index > 0 ? " " : null}
                  {humanise(run.agent_name)}
                  {run.brand_id ? ` ${MIDDOT} ${run.brand_id}` : ""} examined
                  nothing
                  {idleRuns >= runsInWindow && runsInWindow > 1
                    ? ` in any of its ${formatCount(runsInWindow)} runs`
                    : " in its most recent run"}
                  .
                </span>
              ))}{" "}
              An agent with an empty in-tray did not perform badly; it had no
              work in your scope.
            </p>
          )}

          {/* A constant, not data: the same sentence every render, on a panel
              that has to earn its height. The clause that matters stays
              visible and the mechanism moves behind the toggle. */}
          <Why
            lead="Agent actions land in the same ledger as human ones"
            label="what that means"
            className="mt-[10px] block"
          >
            They are written to planner_decision with actor_type
            &quot;agent&quot; and the agent version, so a planner can reverse
            one and the original stays visible.
          </Why>
        </>
      )}
    </>
  );

  if (bare) {
    return (
      <PanelSection title={title} subtitle={subtitle} actions={actions}>
        {body}
      </PanelSection>
    );
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={actions} />
      <CardBody>{body}</CardBody>
    </Card>
  );
}

export default AgentActivity;
