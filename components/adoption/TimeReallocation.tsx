import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";
import type { TouchlessRate } from "@/lib/queries";

import {
  ACTIVITY_LABEL,
  ACTIVITY_ORDER,
  type ActivitySummary,
  type Reallocation,
  type RoleSummary,
} from "./data";
import { ARROW, DASH, count, fte, pct, signedPoints } from "./format";
import {
  AUTOMATABLE_SHARE,
  AUTOMATABLE_SHARE_SOURCE,
  type ActivityKey,
} from "./premise";

/**
 * WHERE THE WEEK GOES -- AND WHY THIS PANEL SAYS "DERIVED" IN THE HEADER.
 *
 * The before-state is measured: v_time_reallocation is a headcount-weighted
 * read of how the planners in your scope actually split their week today.
 * The after-state is NOT measured. Nobody has worked one of these weeks. It
 * is the published formula applied to that before-state:
 *
 *     time_after = time_before x (1 - automatable_share x realised_automation)
 *
 * realised_automation is the one thing in that expression that moves on its
 * own: it is the agent-execution rate from v_touchless_rate, agent_acted
 * over in_scope_denominator, and it is re-read on every request. When the
 * agents run again, this panel changes without anybody editing it. That is
 * the difference between a projection and a wish, and it is the reason the
 * rate is printed with its numerator and denominator rather than as a
 * rounded percentage the reader has to take on faith.
 *
 * automatable_share is the premise. It is printed in its own column beside
 * every activity, so the multiplication is legible on the screen instead of
 * buried in this file: a reader who disagrees with 0.80 for reporting can see
 * exactly which bar it moved and by how much.
 *
 * ON THE VIEW'S ROUNDING
 * ----------------------
 * v_time_reallocation rounds each activity mean to one decimal
 * independently, so a role's six shares can publish as 90% or 100% of a
 * week rather than always 100%. Nothing here renormalises them: the freed
 * share is taken against each role's OWN published total, and the total is
 * shown, so the rounding is visible rather than quietly absorbed.
 */

const BAR_MIN_PCT = 1.5;

function barWidth(share: number, scale: number): string {
  if (!(scale > 0)) return "0%";
  const width = (share / scale) * 100;
  return `${Math.max(share > 0 ? BAR_MIN_PCT : 0, Math.min(100, width))}%`;
}

function ActivityRow({
  activity,
  scale,
}: {
  activity: ActivitySummary;
  scale: number;
}) {
  return (
    <div className="grid grid-cols-[150px_64px_1fr_1fr_66px] items-center gap-[10px] border-b border-rule py-[9px] last:border-b-0 max-[900px]:grid-cols-[130px_56px_1fr_60px]">
      <span className="text-small font-bold text-ink">{activity.label}</span>

      <span
        className="text-[10.5px] font-extrabold text-amber tabular"
        title={`automatable_share = ${activity.automatable.toFixed(2)} (${AUTOMATABLE_SHARE_SOURCE})`}
      >
        {activity.automatable.toFixed(2)}
      </span>

      <span className="h-[18px] overflow-hidden rounded-pill bg-cream max-[900px]:hidden">
        <i
          className="block h-full rounded-pill bg-[#D8CCC2]"
          style={{ width: barWidth(activity.before, scale) }}
        />
      </span>

      <span className="h-[18px] overflow-hidden rounded-pill bg-cream">
        <i
          className="block h-full rounded-pill bg-orange"
          style={{ width: barWidth(activity.after, scale) }}
        />
      </span>

      <span
        className={`text-right text-small font-extrabold tabular ${
          activity.freed > 0 ? "text-red" : "text-mute"
        }`}
      >
        {signedPoints(-activity.freed)}
      </span>
    </div>
  );
}

/**
 * One colour per activity, every value lifted from the design-system palette
 * rather than invented. The mix bar in the by-role table is the only place
 * the six source columns of v_time_reallocation appear unaggregated, which
 * is what makes the spread between roles legible: two rows with the same
 * headcount and very different freed shares differ only in this bar.
 */
const ACTIVITY_COLOUR: Record<ActivityKey, string> = {
  pct_demand_forecasting: "#D04A02",
  pct_reporting: "#A33A00",
  pct_allocation: "#9A6B08",
  pct_assortment: "#5B4B8A",
  pct_meetings: "#8D857D",
  pct_commercial_strategy: "#2FA45B",
};

/**
 * How one role's published week divides, straight from the view's six
 * columns. Widths are taken against the row's OWN published total for the
 * same reason the freed share is: a role publishing at 90% would otherwise
 * render a tenth of a week of empty track that reads as idle time.
 */
function MixBar({ role }: { role: RoleSummary }) {
  if (!(role.publishedTotal > 0)) {
    return <span className="text-mute">{DASH}</span>;
  }
  return (
    <span
      className="flex h-[14px] w-[190px] overflow-hidden rounded-pill bg-cream"
      title={ACTIVITY_ORDER.map(
        (key) =>
          `${ACTIVITY_LABEL[key]} ${pct(role.before[key], 0)}, automatable share ${AUTOMATABLE_SHARE[key].toFixed(2)}`,
      ).join(" · ")}
    >
      {ACTIVITY_ORDER.map((key) => (
        <i
          key={key}
          className="block h-full"
          style={{
            width: `${(role.before[key] / role.publishedTotal) * 100}%`,
            background: ACTIVITY_COLOUR[key],
          }}
        />
      ))}
    </span>
  );
}

/**
 * The activity a role spends most of its published week on, read off the
 * row rather than assumed. The paragraph above the by-role table used to
 * name the roles and their splits in words -- "nearly two fifths", "a third
 * of it" -- which is a figure typed into a component, and would have gone on
 * reading confidently after the underlying row changed. It now names
 * whichever rows the arithmetic actually puts at the two ends.
 */
function largestBlock(
  role: RoleSummary,
): { key: ActivityKey; share: number } | null {
  let best: { key: ActivityKey; share: number } | null = null;
  for (const key of ACTIVITY_ORDER) {
    const share = role.before[key];
    if (best === null || share > best.share) best = { key, share };
  }
  return best;
}

function roleColumns(): Column<RoleSummary>[] {
  return [
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <span className="font-bold text-ink">
          {row.role}
          <span className="ml-[6px] text-[10.5px] font-semibold text-mute">
            {row.brandId}
          </span>
        </span>
      ),
    },
    {
      key: "planners",
      header: "Planners",
      numeric: true,
      cell: (row) => count(row.planners),
    },
    {
      key: "mix",
      header: "Week today, by activity",
      cell: (row) => <MixBar role={row} />,
      headerClassName: "w-[206px]",
    },
    {
      key: "published",
      header: "Week as published",
      numeric: true,
      cell: (row) => (
        <span className={row.publishedTotal < 0.995 ? "text-amber" : undefined}>
          {pct(row.publishedTotal, 0)}
        </span>
      ),
    },
    {
      key: "freedShare",
      header: "Week freed",
      numeric: true,
      cell: (row) => pct(row.freedShare, 1),
    },
    {
      key: "automatableFte",
      header: "Automatable FTE",
      numeric: true,
      cell: (row) => fte(row.automatableFte),
    },
    {
      key: "freedFte",
      header: "FTE freed at the measured rate",
      numeric: true,
      cell: (row) => <b className="text-ink">{fte(row.freedFte)}</b>,
    },
  ];
}

export function TimeReallocation({
  reallocation,
  touchless,
}: {
  reallocation: Reallocation;
  touchless: TouchlessRate | null;
}) {
  const scale = reallocation.activities.reduce(
    (max, activity) => Math.max(max, activity.before),
    0,
  );
  const freedShare =
    reallocation.publishedTotal > 0
      ? reallocation.activities.reduce((total, a) => total + a.freed, 0) /
        reallocation.publishedTotal
      : 0;

  const acted = touchless?.agent_acted ?? null;
  const denominator = touchless?.in_scope_denominator ?? null;

  // The two ends of the spread, taken from the rows on screen. Both ends are
  // sorted from the same array in opposite directions rather than read off
  // the head and tail of one, so that a tie at either end is broken the same
  // way: toward the row with the most people in it, which is the row a
  // reader is most likely to have in mind. The brand is printed alongside
  // because both brands carry rows with the same role name.
  const mostFirst = [...reallocation.roles].sort(
    (a, b) => b.freedShare - a.freedShare || b.planners - a.planners,
  );
  const leastFirst = [...reallocation.roles].sort(
    (a, b) => a.freedShare - b.freedShare || b.planners - a.planners,
  );
  const most = mostFirst[0] ?? null;
  const least = leastFirst[0] ?? null;
  // One role, or a scope where every role frees the same share: there is no
  // spread to describe, and describing one anyway would name two rows as
  // opposite ends of nothing.
  const spread =
    most !== null &&
    least !== null &&
    !(most.brandId === least.brandId && most.role === least.role);
  const mostBlock = spread && most ? largestBlock(most) : null;
  const leastBlock = spread && least ? largestBlock(least) : null;

  return (
    <Card>
      <CardHeader
        title="Where the week goes"
        subtitle="Before-state measured. After-state derived from it, by the formula below."
        actions={<Pill variant="amber">Derived, not observed</Pill>}
      />

      <CardBody>
        <div className="mb-[14px] rounded-quote bg-shell px-[14px] py-[11px]">
          <code className="block font-mono text-[11.5px] font-bold leading-[1.6] text-ink">
            time_after = time_before × (1 − automatable_share ×
            realised_automation)
          </code>
          <p className="mt-[7px] max-w-[92ch] text-small leading-[1.6] text-body">
            <b className="text-ink">time_before</b> is the headcount-weighted
            mean of v_time_reallocation across the{" "}
            {count(reallocation.planners)} planners readable in your scope.{" "}
            <b className="text-ink">realised_automation</b> is the measured
            agent-execution rate from v_touchless_rate
            {acted !== null && denominator !== null ? (
              <>
                {" "}
                &mdash; {count(acted)} of {count(denominator)} in-scope
                recommendations closed without a human, which is{" "}
                <b className="tabular text-ink">
                  {pct(reallocation.realisedAutomation, 1)}
                </b>
                . When the agents next run, that fraction moves and every bar
                below moves with it.
              </>
            ) : (
              <>
                {" "}
                &mdash; and that view returned nothing, so the rate reads{" "}
                {pct(reallocation.realisedAutomation, 1)} and every after-bar
                below is drawn against an automation rate of zero. The agents
                have not run in your scope.
              </>
            )}{" "}
            <b className="text-ink">automatable_share</b> is the column of
            amber figures below. It is the one input on this panel with no
            table behind it: {AUTOMATABLE_SHARE_SOURCE}.
          </p>
        </div>

        {reallocation.activities.length === 0 || reallocation.planners === 0 ? (
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            No time-split rows are readable in your scope, so there is no
            before-state to project from. What would appear here is one row per
            activity &mdash; forecast preparation, reporting, allocation,
            assortment, meetings, commercial strategy &mdash; each showing the
            share of the week it takes today, the share of it an agent could
            execute, and what the formula above leaves once the measured
            automation rate is applied.
          </p>
        ) : (
          <>
            <div className="mb-[8px] grid grid-cols-[150px_64px_1fr_1fr_66px] gap-[10px] text-[10.5px] font-extrabold tracking-[0.04em] text-mute max-[900px]:grid-cols-[130px_56px_1fr_60px]">
              <span>Activity</span>
              <span>Auto. share</span>
              <span className="max-[900px]:hidden">Week today</span>
              <span>After {ARROW}</span>
              <span className="text-right">Change</span>
            </div>

            {reallocation.activities.map((activity) => (
              <ActivityRow key={activity.key} activity={activity} scale={scale} />
            ))}

            <p className="mt-[12px] max-w-[92ch] text-small leading-[1.6] text-body">
              Across the whole scope the formula frees{" "}
              <b className="tabular text-ink">{pct(freedShare, 1)}</b> of the
              published week, which over {count(reallocation.planners)} planners
              is <b className="tabular text-ink">{fte(reallocation.freedFte)}</b>{" "}
              full-time equivalents. The six shares as the view publishes them
              sum to <b className="tabular text-ink">{pct(reallocation.publishedTotal, 0)}</b>{" "}
              of a week for this scope, and to between{" "}
              {pct(reallocation.publishedTotalMin, 0)} and{" "}
              {pct(reallocation.publishedTotalMax, 0)} for individual roles:
              v_time_reallocation rounds each activity mean to one decimal on
              its own, so the six need not add to a hundred. Nothing here
              rescales them. Every freed share is taken against the role&apos;s own
              published total, so a row that publishes short of a full week is
              not credited with hours it never reported.
            </p>

            <p className="mt-[10px] max-w-[92ch] text-small leading-[1.6] text-body">
              What this panel deliberately does NOT do is decide where the
              freed hours go. The formula only shrinks; it has nothing to say
              about what fills the gap, and a chart showing commercial strategy
              rising to meet it would be an assertion about management
              behaviour dressed as arithmetic. Where the case commits that
              capacity is the redeployment ledger further down, and that is
              labelled as the case&apos;s commitment rather than as a projection.
            </p>
          </>
        )}
      </CardBody>

      {reallocation.roles.length === 0 ? null : (
        <>
          <div className="border-t border-rule px-[20px] pb-[6px] pt-[14px]">
            <h4 className="text-[13px] font-extrabold text-ink">By role</h4>
            <p className="mt-[2px] max-w-[92ch] text-small leading-[1.55] text-mute">
              The same arithmetic, unaggregated.{" "}
              {most && least && mostBlock && leastBlock ? (
                <>
                  The formula takes most from {most.role} ({most.brandId}),
                  which frees{" "}
                  <b className="tabular text-ink">{pct(most.freedShare, 1)}</b>{" "}
                  of its published week because{" "}
                  {pct(mostBlock.share, 0)} of that week goes on{" "}
                  {ACTIVITY_LABEL[mostBlock.key].toLowerCase()}, whose
                  automatable share the audit puts at{" "}
                  {AUTOMATABLE_SHARE[mostBlock.key].toFixed(2)}. It takes least
                  from {least.role} ({least.brandId}) at{" "}
                  <b className="tabular text-ink">{pct(least.freedShare, 1)}</b>
                  , whose largest block is{" "}
                  {ACTIVITY_LABEL[leastBlock.key].toLowerCase()} at{" "}
                  {pct(leastBlock.share, 0)} against an automatable share of{" "}
                  {AUTOMATABLE_SHARE[leastBlock.key].toFixed(2)}. Neither role
                  is named in this sentence by hand; both are whichever rows
                  the arithmetic puts at the ends. That spread is why the
                  scope above is weighted by headcount rather than averaged
                  across roles.
                </>
              ) : (
                <>
                  Every role readable in your scope frees the same share of
                  its published week, so there is no spread to describe and
                  the headcount weighting above has nothing to change.
                </>
              )}
            </p>
            <div className="mt-[9px] flex flex-wrap gap-x-[13px] gap-y-[5px] text-[10.5px] font-bold text-mute">
              {ACTIVITY_ORDER.map((key) => (
                <span key={key}>
                  <i
                    aria-hidden="true"
                    className="mr-[5px] inline-block h-[8px] w-[8px] rounded-full"
                    style={{ background: ACTIVITY_COLOUR[key] }}
                  />
                  {ACTIVITY_LABEL[key]}{" "}
                  <b className="text-amber tabular">
                    {AUTOMATABLE_SHARE[key].toFixed(2)}
                  </b>
                </span>
              ))}
              <span className="text-mute">
                amber figure is the automatable share &mdash;{" "}
                {AUTOMATABLE_SHARE_SOURCE}
              </span>
            </div>
          </div>
          <DataTable
            rows={reallocation.roles}
            columns={roleColumns()}
            rowKey={(row) => `${row.brandId}:${row.role}`}
            caption="Time reallocation by brand and role"
          />
        </>
      )}
    </Card>
  );
}

export default TimeReallocation;
