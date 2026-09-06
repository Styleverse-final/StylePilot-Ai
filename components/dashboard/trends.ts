import type { AgentRun, RecommendationState } from "@/lib/queries";

/**
 * The two series the command centre header can honestly draw.
 *
 * Both are computed from rows the dashboard already fetches for other
 * reasons, so neither costs a query. Both are pure functions of those rows,
 * with no clock read anywhere: a series that depended on Date.now() would
 * render differently on the server and the client, and would make the page
 * impure for no gain when the data itself carries every timestamp needed.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * A burn-down of the open queue. It looks derivable -- recommendation
 * carries generated_at and v_recommendation_state carries decided_at, so the
 * open count at any past instant is arithmetic. It is not: all 605
 * recommendations were generated in a single batch on 3 September while the
 * decision log runs from 21 August, so rows were decided days before they
 * existed. Reconstructing history from those two columns produces a queue
 * that goes negative. Throughput -- decisions closed per day -- is measured
 * by one column that is internally consistent, so that is what is drawn.
 */

/** The scale every date in this app is bucketed on. */
const IST = "Asia/Kolkata";

/** Calendar day in IST, as YYYY-MM-DD, or null if the stamp is unusable. */
function istDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // en-CA formats as YYYY-MM-DD, which sorts lexically.
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(at);
}

/** One day earlier, on the YYYY-MM-DD string itself. */
function previousDay(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- touchless

export type TouchlessSeries = {
  /** Acted as a share of examined, per run, oldest first. */
  points: number[];
  /** How many runs are plotted. */
  runCount: number;
};

/**
 * The agents' own hit rate, run by run.
 *
 * NOT THE HEADLINE'S HISTORY, and the card must not present it as such.
 * v_touchless_rate.in_scope_rate divides by everything the agents were
 * allowed to touch across the whole programme; this divides by what a single
 * run actually examined. The two move together and are not the same measure,
 * so the card labels this mark with its own denominator rather than letting
 * it sit unlabelled under the headline percentage.
 *
 * Runs that examined nothing are dropped rather than plotted as zero: a run
 * with an empty in-tray did not perform badly, it had no work.
 */
export function touchlessRunSeries(
  runs: readonly AgentRun[],
  take = 12,
): TouchlessSeries {
  const points = runs
    // getAgentRuns returns newest first; a series reads left to right.
    .filter((run) => (run.items_examined ?? 0) > 0)
    .slice(0, take)
    .reverse()
    .map(
      (run) => ((run.items_acted ?? 0) / (run.items_examined as number)) * 100,
    );

  return { points, runCount: points.length };
}

// ----------------------------------------------------------- decided flow

export type ClearedSeries = {
  /** Decisions closed on each day of the window, oldest first. */
  values: number[];
  /** Closed within the last seven days of the window. */
  lastSeven: number;
  /** The most recent day carrying a decision, YYYY-MM-DD, or null. */
  latestDay: string | null;
};

/**
 * Decisions closed per calendar day, over a window ending at the last day a
 * decision was actually recorded.
 *
 * The window ends at the data rather than at today on purpose. A planner
 * looking at this on a quiet Monday should see the fortnight that has
 * decisions in it, with the card naming the date it runs to, rather than a
 * row of empty columns that says nothing about throughput. Days inside the
 * window with no decisions are still plotted as zero -- those are real
 * quiet days, not absent data.
 */
export function clearedPerDay(
  rows: readonly RecommendationState[],
  days = 14,
): ClearedSeries {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (row.status === null) continue;
    const day = istDay(row.decided_at);
    if (day === null) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  if (byDay.size === 0) {
    return { values: [], lastSeven: 0, latestDay: null };
  }

  const latestDay = [...byDay.keys()].sort().pop() as string;

  // Walk backwards from the latest recorded day so the window is contiguous.
  const window: string[] = [latestDay];
  while (window.length < days) {
    window.unshift(previousDay(window[0]));
  }

  const values = window.map((day) => byDay.get(day) ?? 0);

  return {
    values,
    lastSeven: values.slice(-7).reduce((sum, count) => sum + count, 0),
    latestDay,
  };
}
