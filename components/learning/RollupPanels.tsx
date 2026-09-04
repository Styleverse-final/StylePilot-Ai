import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  Stat,
  StatBlock,
  type Column,
} from "@/components";

import type { GroupStat, Rollup } from "./data";
import { DASH, MIDDOT, formatFractionPct, formatHours, formatHoursBare } from "./format";
import {
  CASE_ENTERPRISE_LEARNING_HOURS,
  CASE_ENTERPRISE_LEARNING_SOURCE,
} from "./premise";

/**
 * The roll-up a planning manager, CMPO or group CMPO sees IN ADDITION to
 * their own path -- never instead of it. A leader who is exempt from the
 * capability programme they are asking everyone else to complete is the
 * fastest way to make the programme read as something done to people rather
 * than with them, so the manager's own path stays at the top of this screen
 * and this section sits underneath it.
 *
 * WHY EVERY DENOMINATOR IS THE PERSON'S OWN CURRICULUM
 * ---------------------------------------------------
 * "Needs most support" carries eight modules and 28 hours; Champions carry
 * four and eight. Scoring both against the fifteen-module catalogue would
 * make the segment the programme invested most in look like the segment that
 * did least. Every percentage below is completed-over-assigned within the
 * person's own path, so the segments are comparable.
 *
 * Row level security decides what is in scope here, not this component. A
 * planning manager reads their brand; a group CMPO reads the portfolio; a
 * planner reading learning_completion gets their own rows and nothing else,
 * which is why the section is not rendered for them at all.
 */

function share(group: GroupStat): number | null {
  return group.modules > 0 ? group.completed / group.modules : null;
}

function perHead(group: GroupStat): number | null {
  return group.people > 0 ? group.completedHours / group.people : null;
}

function MiniBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex items-center justify-end gap-[8px]">
      <div className="h-[7px] w-[64px] overflow-hidden rounded-pill bg-cream">
        <div className="h-full rounded-pill bg-orange" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-[38px] text-right tabular-nums">
        {formatFractionPct(value)}
      </span>
    </div>
  );
}

// -------------------------------------------------------- segment breakdown

const SEGMENT_COLUMNS: ReadonlyArray<Column<GroupStat>> = [
  {
    key: "segment",
    header: "Segment",
    cell: (row) => <span className="font-extrabold">{row.label}</span>,
  },
  { key: "people", header: "People", numeric: true, cell: (row) => row.people },
  {
    key: "modules",
    header: "Modules on path",
    numeric: true,
    cell: (row) => row.modules,
  },
  {
    key: "done",
    header: "Finished",
    numeric: true,
    cell: (row) => row.completed,
  },
  {
    key: "share",
    header: "Completion",
    align: "right",
    headerClassName: "w-[150px]",
    cell: (row) => <MiniBar value={share(row)} />,
  },
  {
    key: "hours",
    header: "Hours delivered",
    numeric: true,
    cell: (row) => formatHoursBare(row.completedHours),
  },
  {
    key: "target",
    header: "Hours recommended",
    numeric: true,
    // A dash, not a nought, when nobody in the group carries a recommendation
    // -- an empty sum and a real zero are different statements.
    cell: (row) =>
      row.recommendedPeople > 0 ? formatHoursBare(row.recommendedHours) : DASH,
  },
  {
    key: "perHead",
    header: "Per head",
    numeric: true,
    cell: (row) => formatHoursBare(perHead(row)),
  },
];

export function SegmentBreakdown({ rollup }: { rollup: Rollup }) {
  const withoutRecommendation =
    rollup.totals.people - rollup.totals.recommendedPeople;

  return (
    <Card>
      <CardHeader
        title="Completion by segment"
        subtitle="Each segment scored against its own curriculum, not against the catalogue"
        actions={
          <Pill variant="grey">{rollup.totals.people} people in scope</Pill>
        }
      />
      <DataTable
        columns={SEGMENT_COLUMNS}
        rows={rollup.bySegment}
        rowKey={(row) => row.key}
        caption="Learning completion by adoption segment"
        empty="No completion rows are readable in your scope."
      />
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
          Hours recommended is the sum of the segment target of every person
          who has one, so the gap between it and hours delivered is the work still ahead
          rather than a shortfall anyone owes. The segments with the widest
          gap are the ones the programme deliberately asked most of:{" "}
          &quot;Needs most support&quot; carries the largest curriculum
          because its readiness scores were lowest, which means a low
          completion percentage there is the expected shape of a programme
          part-way through, not evidence that the investment is failing.
        </p>
        {withoutRecommendation > 0 ? (
          <p className="mt-[10px] max-w-[88ch] text-small font-semibold leading-[1.6] text-mute">
            {withoutRecommendation} of {rollup.totals.people} people in scope
            have no planner_adoption row, so they carry no segment
            recommendation. They are counted in every other column and left
            out of hours recommended entirely, rather than added in as a
            nought -- a fabricated nought-hour recommendation would drag the
            column down and read as though the programme had asked nothing of
            them.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------- compact tables

const COMPACT_COLUMNS: ReadonlyArray<Column<GroupStat>> = [
  {
    key: "label",
    header: "Group",
    cell: (row) => <span className="font-extrabold">{row.label}</span>,
  },
  { key: "people", header: "People", numeric: true, cell: (row) => row.people },
  {
    key: "share",
    header: "Completion",
    align: "right",
    headerClassName: "w-[140px]",
    cell: (row) => <MiniBar value={share(row)} />,
  },
  {
    key: "perHead",
    header: "Hrs / head",
    numeric: true,
    cell: (row) => formatHoursBare(perHead(row)),
  },
];

export function GroupBreakdown({
  title,
  subtitle,
  groups,
  caption,
}: {
  title: string;
  subtitle: string;
  groups: readonly GroupStat[];
  caption: string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <DataTable
        columns={COMPACT_COLUMNS}
        rows={groups}
        rowKey={(row) => row.key}
        caption={caption}
        empty="Nothing readable in your scope."
      />
    </Card>
  );
}

// ------------------------------------------------------------ hours vs base

/**
 * Hours delivered against two reference points, both stated for what they
 * are: the cohort's own prior-year average, which is measured on
 * dim_planner, and the enterprise figure from the case brief, which is not.
 */
export function HoursDelivered({ rollup }: { rollup: Rollup }) {
  const { totals, priorHoursMean, priorHoursPeople } = rollup;
  const delivered = totals.completedHours;
  const people = totals.people;
  const deliveredPerHead = people > 0 ? delivered / people : null;
  const committedPerHead = people > 0 ? totals.pathHours / people : null;
  // Averaged over the people who HAVE a segment recommendation, never over
  // everyone in scope. Someone with no planner_adoption row has no
  // recommendation; counting them in the denominator would divide a real
  // total by an invented zero and understate the figure for everyone.
  const withRecommendation = totals.recommendedPeople;
  const withoutRecommendation = people - withRecommendation;
  const recommendedPerHead =
    withRecommendation > 0 ? totals.recommendedHours / withRecommendation : null;

  const rows: { label: string; hours: number | null; note: string; tone: string }[] = [
    {
      label: "Delivered so far, per person",
      hours: deliveredPerHead,
      tone: "bg-orange",
      note: "Hours behind modules marked completed, divided by the people in scope.",
    },
    {
      label: "Committed by the curriculum, per person",
      hours: committedPerHead,
      tone: "bg-[#D8CCC2]",
      note: "Every module on every path, whether or not it is finished. This is what the programme has actually promised.",
    },
    {
      label: "Recommended by segment, per person",
      hours: recommendedPerHead,
      tone: "bg-violet",
      note:
        withoutRecommendation > 0
          ? `The mean of planner_adoption.recommended_learning_hours across the ${withRecommendation} people in scope who carry one. ${withoutRecommendation} of ${people} have no adoption row and are left out of this average rather than counted as nought hours.`
          : `The mean of planner_adoption.recommended_learning_hours across the ${withRecommendation} people in scope, every one of whom carries one.`,
    },
    {
      label: "Structured learning last year, per person",
      hours: priorHoursMean,
      tone: "bg-[#B4A99F]",
      note: `Measured on dim_planner across ${priorHoursPeople} people. The before picture.`,
    },
    {
      label: "Enterprise average quoted in the brief",
      hours: CASE_ENTERPRISE_LEARNING_HOURS,
      tone: "bg-cream",
      note: `A ${CASE_ENTERPRISE_LEARNING_SOURCE}. No table in this schema yields it; it is here so the cohort figure has something to sit against.`,
    },
  ];

  const scale = Math.max(
    1,
    ...rows.map((row) => (row.hours === null ? 0 : row.hours)),
  );

  return (
    <Card>
      <CardHeader
        title="Hours delivered against the baseline"
        subtitle={
          people > 0
            ? `Per person across the ${people} in your scope, so cohorts of different sizes compare`
            : "Per person, so cohorts of different sizes compare"
        }
      />
      <CardBody>
        {rows.map((row) => (
          <div key={row.label} className="border-b border-rule py-[11px] last:border-b-0">
            <div className="mb-[6px] flex items-baseline justify-between gap-[10px]">
              <span className="text-copy font-bold text-ink">{row.label}</span>
              <span className="text-copy font-extrabold tabular">
                {formatHours(row.hours)}
              </span>
            </div>
            <div className="h-[8px] overflow-hidden rounded-pill bg-cream">
              <div
                className={`h-full rounded-pill ${row.tone}`}
                style={{
                  width: `${row.hours === null ? 0 : Math.max(0, Math.min(100, (row.hours / scale) * 100))}%`,
                }}
              />
            </div>
            <div className="mt-[5px] text-small font-semibold leading-[1.5] text-mute">
              {row.note}
            </div>
          </div>
        ))}

        <StatBlock>
          <Stat label="Hours delivered" value={formatHoursBare(delivered)} />
          <Stat label="Hours committed" value={formatHoursBare(totals.pathHours)} />
          <Stat
            label="Modules finished"
            value={`${totals.completed} / ${totals.modules}`}
          />
          <Stat
            label="Against last year"
            value={
              priorHoursMean !== null && committedPerHead !== null && priorHoursMean > 0
                ? `${(committedPerHead / priorHoursMean).toFixed(2)}x`
                : DASH
            }
            tone="orange"
          />
        </StatBlock>

        <p className="mt-[14px] max-w-[88ch] text-copy leading-[1.6] text-body">
          The cohort averaged{" "}
          <b className="tabular">{formatHours(priorHoursMean)}</b> of
          structured learning across the whole of last year, measured on their
          own records. The curriculum now committed to them is{" "}
          <b className="tabular">{formatHours(committedPerHead)}</b> each. That
          multiple is the honest statement of what the programme is worth
          arguing about {MIDDOT} not the completion percentage, which is a
          progress reading part-way through, and not the{" "}
          {CASE_ENTERPRISE_LEARNING_HOURS}h enterprise figure, which is a
          premise carried in from the brief rather than anything this schema
          measured.
        </p>
      </CardBody>
    </Card>
  );
}
