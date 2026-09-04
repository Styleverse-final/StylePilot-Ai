import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import { Finding } from "./Layout";
import {
  DASH,
  formatCount,
  formatCrore,
  formatShare,
  formatTimestamp,
  fractionOf,
  humanise,
  plural,
} from "./format";
import type { UndecidedGroup, UndecidedRow, UndecidedView } from "./types";

/**
 * EXCEPTIONS ABOVE THRESHOLD WITH NO DECISION LOGGED.
 *
 * THIS IS THE ONE PANEL ON THE SCREEN THAT COULD HAVE BECOME A TASK QUEUE,
 * AND IT MUST NOT.
 *
 * A planner's version of this list has an Approve button on every row and is
 * ordered so it can be worked top-down. A CMPO's version answers a different
 * question with the same rows: not "what should I do about this one" but
 * "what is the shape of the work nobody has done". So there is no control on
 * any row here, the ordering is by exposure rather than by urgency, and the
 * numbers that carry the panel are the SHARES -- undecided as a fraction of
 * everything raised in that group. A bare count of open cases in a severity
 * band means nothing; the same count against what was raised in that band is
 * the difference between a queue moving slowly and a band being ignored.
 *
 * WHY EVERY EXCEPTION IS READ, NOT ONLY THE OPEN ONES
 * ---------------------------------------------------
 * The denominator is the finding. A given number of open cases reads one way
 * against a couple of hundred raised and a completely different way against
 * a couple of thousand. The data layer reads both, and this panel never
 * shows a count without the total it came out of.
 *
 * WHAT A NULL STATUS MEANS HERE, EXACTLY
 * --------------------------------------
 * v_recommendation_state filters SCENARIO rows out before this page sees
 * them, so a null status is genuinely nobody having decided -- never
 * somebody exploring a what-if. That distinction is why the view exists.
 */

const VIOLET = "#5B4B8A";
const ORANGE = "#D04A02";

function GroupBars({
  title,
  subtitle,
  groups,
  color,
}: {
  title: string;
  subtitle: string;
  groups: readonly UndecidedGroup[];
  color: string;
}) {
  const widest = groups.reduce((most, group) => Math.max(most, group.count), 0);

  return (
    <div>
      <div className="text-micro font-extrabold tracking-[0.06em] text-mute">
        {title.toUpperCase()}
      </div>
      <div className="mt-[2px] text-label font-semibold text-mute">
        {subtitle}
      </div>

      {groups.length === 0 ? (
        <p className="mt-[10px] text-small font-semibold text-mute">
          Nothing undecided in this cut.
        </p>
      ) : (
        <ul className="mt-[8px] flex flex-col">
          {groups.map((group) => (
            <li
              key={group.key}
              className="border-b border-rule py-[9px] last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-[10px]">
                <span className="text-copy font-extrabold text-ink">
                  {group.label}
                </span>
                <span className="shrink-0 text-copy font-extrabold tabular text-ink">
                  {formatCount(group.count)}
                </span>
              </div>
              <div className="mt-[5px] h-[6px] overflow-hidden rounded-pill bg-cream">
                <div
                  className="h-full rounded-pill"
                  style={{
                    width: `${fractionOf(group.count, widest) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="mt-[4px] flex items-baseline justify-between gap-[10px] text-label font-semibold text-mute">
                <span className="tabular">
                  {group.shareOfGroup === null
                    ? "share not computable"
                    : `${(group.shareOfGroup * 100).toFixed(0)}% of those raised here`}
                </span>
                <span className="tabular">{formatCrore(group.valueInr)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The group with the highest undecided share, named from the rows. */
function mostIgnored(
  groups: readonly UndecidedGroup[],
): UndecidedGroup | null {
  const rated = groups.filter(
    (group): group is UndecidedGroup & { shareOfGroup: number } =>
      group.shareOfGroup !== null && group.count > 0,
  );
  if (rated.length === 0) return null;
  return rated.reduce((worst, group) =>
    group.shareOfGroup > worst.shareOfGroup ? group : worst,
  );
}

export type UndecidedPanelProps = {
  view: UndecidedView;
  /** How many rows of the ranked list to render. The rest are counted, not hidden. */
  limit?: number;
};

export function UndecidedPanel({ view, limit = 12 }: UndecidedPanelProps) {
  if (view.totalExceptions === 0) {
    return (
      <Card>
        <CardHeader
          title="Exceptions with no decision logged"
          subtitle="v_recommendation_state, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No exceptions are readable in your scope, so there is nothing
            outstanding and nothing to report as outstanding. What would appear
            here is every exception the agents raised above their threshold
            that carries no decision {DASH} grouped by severity, brand,
            category and region, each with the share of that group nobody has
            touched, and the total exposure sitting behind them.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (view.undecided === 0) {
    return (
      <Card>
        <CardHeader
          title="Exceptions with no decision logged"
          subtitle={`${formatCount(view.totalExceptions)} raised in your scope`}
          actions={<Pill variant="up">All decided</Pill>}
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            Every one of the {formatCount(view.totalExceptions)} exceptions in
            your scope carries a logged decision. There is no backlog to show,
            which is the one state this panel is glad to be empty in.
          </p>
        </CardBody>
      </Card>
    );
  }

  const worstSeverity = mostIgnored(view.bySeverity);
  const worstCategory = mostIgnored(view.byCategory);
  const shown = view.rows.slice(0, limit);
  const remaining = view.rows.length - shown.length;
  const remainingValue = view.rows
    .slice(limit)
    .reduce((total, row) => total + (row.valueAtStakeInr ?? 0), 0);

  const columns: Column<UndecidedRow>[] = [
    {
      key: "severity",
      header: "Severity",
      cell: (row) => (
        <Pill variant={row.severity === "HIGH" ? "down" : "amber"}>
          {humanise(row.severity)}
        </Pill>
      ),
    },
    {
      key: "where",
      header: "Where",
      cell: (row) => (
        <span className="text-ink">
          <b>{row.categoryLabel}</b>
          <span className="text-mute font-semibold"> {row.regionLabel}</span>
        </span>
      ),
    },
    {
      key: "brand",
      header: "Brand",
      cell: (row) => (
        <span className="text-mute font-semibold">{row.brandLabel}</span>
      ),
    },
    {
      key: "action",
      header: "What was flagged",
      cell: (row) => humanise(row.action),
    },
    {
      key: "wos",
      header: "Projected weeks of cover",
      numeric: true,
      cell: (row) =>
        row.projectedWos === null ? (
          <span className="text-mute">{DASH}</span>
        ) : (
          row.projectedWos.toFixed(1)
        ),
    },
    {
      key: "units",
      header: "Units at risk",
      numeric: true,
      cell: (row) =>
        row.unitsAtRisk === null ? (
          <span className="text-mute">{DASH}</span>
        ) : (
          formatCount(Math.round(row.unitsAtRisk))
        ),
    },
    {
      key: "value",
      header: "Value at stake",
      numeric: true,
      cell: (row) => <b>{formatCrore(row.valueAtStakeInr)}</b>,
    },
    {
      key: "raised",
      header: "Raised",
      cell: (row) => (
        <span className="text-mute font-semibold">
          {formatTimestamp(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <Card>
        <CardHeader
          title="What nobody has decided"
          subtitle={`${formatCount(view.undecided)} of ${formatCount(view.totalExceptions)} exceptions in your scope carry no decision`}
          actions={
            <Pill variant="down" tabular>
              {formatCrore(view.valueInr)} at stake
            </Pill>
          }
        />
        <CardBody>
          <div className="grid grid-cols-4 gap-[22px] max-[1140px]:grid-cols-2 max-[720px]:grid-cols-1">
            <GroupBars
              title="By severity"
              subtitle="The band the agents assigned when they raised it"
              groups={view.bySeverity}
              color={ORANGE}
            />
            <GroupBars
              title="By brand"
              subtitle="Whose planners have not got to them"
              groups={view.byBrand}
              color={VIOLET}
            />
            <GroupBars
              title="By category"
              subtitle="Where the untouched exposure sits"
              groups={view.byCategory}
              color={VIOLET}
            />
            <GroupBars
              title="By region"
              subtitle="Which market the stock is actually in"
              groups={view.byRegion}
              color={VIOLET}
            />
          </div>

          <Finding label="Read the shares, not the counts">
            {formatCount(view.undecided)} of{" "}
            {formatCount(view.totalExceptions)} exceptions are undecided {DASH}{" "}
            {formatShare(view.undecided, view.totalExceptions)} by count, but{" "}
            {formatShare(view.valueInr, view.totalValueInr)} of the exposure,
            because the untouched cases skew large.{" "}
            {worstSeverity ? (
              <>
                The band being left longest is{" "}
                <b className="text-ink">{worstSeverity.label}</b>, where{" "}
                {formatCount(worstSeverity.count)} of the exceptions raised in
                that band {DASH}{" "}
                {worstSeverity.shareOfGroup === null
                  ? "an unknown share"
                  : `${(worstSeverity.shareOfGroup * 100).toFixed(0)}%`}{" "}
                {DASH} carry no decision.{" "}
              </>
            ) : null}
            {worstCategory && worstCategory.shareOfGroup !== null ? (
              <>
                By category, {worstCategory.label} is the least worked:{" "}
                {(worstCategory.shareOfGroup * 100).toFixed(0)}% of what was
                raised there is still open.{" "}
              </>
            ) : null}
            A CMPO cannot clear this list and should not try. What the list is
            for is the question it raises about capacity: whether the people
            these fell to had the hours, and whether the threshold that raised
            them is set where a human can keep up.
          </Finding>

          <Finding label="What value at stake is, and is not">
            Each figure is what that one exception says is exposed if nothing
            changes {DASH} the pipeline computed it per series and week when it
            raised the case. Adding them treats every case as independent,
            which overstates the portfolio position wherever two exceptions
            describe overlapping stock, and none of it is netted against the
            protected margin at the top of this screen. It is an
            order-of-magnitude of attention owed, not a loss forecast, and it
            is the reason this panel ranks by exposure rather than by age.
          </Finding>

          {view.oldestRaisedAt ? (
            <Finding label="How long they have been sitting">
              The oldest undecided case was raised{" "}
              {formatTimestamp(view.oldestRaisedAt)}. There is no due date in
              this schema and none is invented here, so nothing on this screen
              is overdue {DASH} the timestamp is what there is, and how long is
              too long is a judgement this page leaves to the person making it.
            </Finding>
          ) : null}

          {view.truncated ? (
            <Finding label="This count is a floor">
              The read hit its row ceiling before the scope was exhausted, so
              the figures above understate the backlog. They are the rows
              actually read, not an estimate of the whole.
            </Finding>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="The largest of them"
          subtitle={`Ranked by exposure. ${plural(shown.length, "One row", `${formatCount(shown.length)} rows`)}, and no control on any of them.`}
        />
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(row, index) =>
            `${row.brandId}-${row.categoryId}-${row.regionId}-${index}`
          }
          caption="Undecided exceptions ranked by value at stake"
        />
        <CardBody>
          <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
            {remaining > 0 ? (
              <>
                {formatCount(remaining)} further undecided{" "}
                {plural(remaining, "exception", "exceptions")} worth{" "}
                {formatCrore(remainingValue)} sit below this cut. They are
                counted in every figure above; only the list is shortened.{" "}
              </>
            ) : null}
            There is no Approve here, and that is deliberate rather than
            unfinished. Deciding an exception is a planner&apos;s act, logged
            against a planner&apos;s name in the decision ledger, and a CMPO
            clearing them from a portfolio screen would put the wrong person on
            the audit trail. Weeks of cover and units at risk are read from the
            payload the agent wrote when it raised the case, so what is shown
            is what it saw {DASH} not a re-run against today.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default UndecidedPanel;
