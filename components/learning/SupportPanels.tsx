import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  Why,
  type Column,
} from "@/components";

import type { PersonProgress, Rollup } from "./data";
import { MIDDOT, formatFractionPct, formatHours, formatHoursBare, plural } from "./format";
import { median } from "./stats";

/**
 * Two lists that only make sense next to each other: the people a pairing
 * would help most, and the people who can do the pairing.
 *
 * THE FRAMING IS THE REQUIREMENT, NOT THE DECORATION
 * --------------------------------------------------
 * A named list of employees with low completion is one edit away from a
 * naughty step, and the edit is entirely in the words. So: nobody on this
 * list has failed anything, because there is nothing to fail -- no due date
 * exists in the schema and none is invented here. Everyone listed carries a
 * curriculum sized to their own segment, and the people with the most hours
 * still ahead of them are, by construction, the people the programme asked
 * the most of.
 *
 * The list is ordered by hours remaining rather than by percentage, because
 * the question a planning manager is actually answering is "where does one
 * Champion pairing buy the most", and that is an hours question.
 *
 * THE THRESHOLD IS DERIVED, AND IT IS ON SCREEN
 * ---------------------------------------------
 * A person appears when their completed share sits below the MEDIAN completed
 * share for their own segment. Comparing a "Needs most support" path of eight
 * modules against a Champion's four would put the whole segment on the list
 * and say nothing. The medians are computed from the cohort in scope on this
 * request, so they move with the data and are printed beside the list.
 */

export type SupportRow = PersonProgress & {
  segmentMedianShare: number;
  hoursRemaining: number;
  coachesInRegion: number;
};

/** Rows rendered before the list is truncated with a count of the rest. */
const SUPPORT_LIMIT = 12;

export type SupportSelection = {
  rows: SupportRow[];
  shown: number;
  total: number;
  /** Per segment: the threshold, the people in scope, and how many sit below. */
  medians: { segment: string; median: number; people: number; below: number }[];
};

/**
 * Everyone below their own segment's median completed share, ordered by the
 * hours still ahead of them.
 */
export function selectSupport(rollup: Rollup): SupportSelection {
  const bySegment = new Map<string, number[]>();
  for (const row of rollup.people) {
    const list = bySegment.get(row.segment);
    if (list) list.push(row.share);
    else bySegment.set(row.segment, [row.share]);
  }

  const medians = new Map<string, number>();
  for (const [segment, shares] of bySegment) {
    medians.set(segment, median(shares) ?? 0);
  }

  const coachesByRegion = new Map<string, number>();
  for (const coach of rollup.coaches) {
    const region = coach.person.regionId ?? "Unassigned";
    coachesByRegion.set(region, (coachesByRegion.get(region) ?? 0) + 1);
  }

  const belowBySegment = new Map<string, number>();
  const rows: SupportRow[] = [];
  for (const row of rollup.people) {
    const segmentMedianShare = medians.get(row.segment) ?? 0;
    if (row.share >= segmentMedianShare) continue;
    belowBySegment.set(row.segment, (belowBySegment.get(row.segment) ?? 0) + 1);
    rows.push({
      ...row,
      segmentMedianShare,
      hoursRemaining: Math.max(0, row.pathHours - row.completedHours),
      coachesInRegion: coachesByRegion.get(row.person.regionId ?? "Unassigned") ?? 0,
    });
  }

  rows.sort(
    (a, b) =>
      b.hoursRemaining - a.hoursRemaining ||
      a.share - b.share ||
      a.person.employeeId.localeCompare(b.person.employeeId),
  );

  return {
    rows: rows.slice(0, SUPPORT_LIMIT),
    shown: Math.min(rows.length, SUPPORT_LIMIT),
    total: rows.length,
    medians: [...bySegment.entries()]
      .map(([segment, shares]) => ({
        segment,
        median: medians.get(segment) ?? 0,
        people: shares.length,
        below: belowBySegment.get(segment) ?? 0,
      }))
      .sort((a, b) => a.segment.localeCompare(b.segment)),
  };
}

function supportColumns(
  regionLabels: Record<string, string>,
): ReadonlyArray<Column<SupportRow>> {
  return [
    {
      key: "person",
      header: "Person",
      cell: (row) => (
        <span className="text-[12.5px] font-extrabold text-ink">
          {row.person.fullName ?? row.person.employeeId}
          <span className="not-italic font-semibold text-mute">
            {" "}
            {row.person.role ?? row.person.employeeId}
          </span>
        </span>
      ),
    },
    {
      key: "segment",
      header: "Segment",
      cell: (row) => <span className="font-semibold text-body">{row.segment}</span>,
    },
    {
      key: "wave",
      header: "Wave",
      cell: (row) => (
        <span className="font-semibold text-body">
          {row.person.wave ?? "Not in a wave"}
        </span>
      ),
    },
    {
      key: "region",
      header: "Region",
      cell: (row) => (
        <span className="font-semibold text-body">
          {row.person.regionId
            ? (regionLabels[row.person.regionId] ?? row.person.regionId)
            : "Unassigned"}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Hours so far",
      numeric: true,
      cell: (row) =>
        `${formatHoursBare(row.completedHours)} / ${formatHoursBare(row.pathHours)}`,
    },
    {
      key: "ahead",
      header: "Hours ahead",
      numeric: true,
      cell: (row) => (
        <b className="text-orangeD">{formatHoursBare(row.hoursRemaining)}</b>
      ),
    },
    {
      key: "peers",
      header: "Segment median",
      numeric: true,
      cell: (row) => formatFractionPct(row.segmentMedianShare),
    },
    {
      key: "coaches",
      header: "Coaches in region",
      numeric: true,
      cell: (row) =>
        row.coachesInRegion > 0 ? (
          row.coachesInRegion
        ) : (
          <span className="text-mute">none yet</span>
        ),
    },
  ];
}

export function SupportList({
  selection,
  regionLabels,
}: {
  selection: SupportSelection;
  regionLabels: Record<string, string>;
}) {
  const { rows, total, shown, medians } = selection;

  return (
    <Card>
      <CardHeader
        title="Where a pairing would help most"
        subtitle="Below the median for their own segment, ordered by the hours still ahead of them"
        actions={
          <Pill variant="orange">
            {total === 0 ? "nobody" : plural(total, "person", "people")}
          </Pill>
        }
      />
      <DataTable
        columns={supportColumns(regionLabels)}
        rows={rows}
        rowKey={(row) => row.person.employeeId}
        caption="People whose completed share sits below their segment median"
        empty="Nobody in your scope sits below their segment median. That is a real state, not an empty panel: it means completion inside every segment is tight enough that no individual stands out from their peers, and a pairing would be picked on other grounds."
      />
      <CardBody>
        {total > shown ? (
          <p className="mb-[10px] text-small font-bold text-mute">
            Showing the {shown} with the most hours ahead of them, of {total}.
            The rest sit below their segment median by smaller margins.
          </p>
        ) : null}

        <Why
          lead="Nobody on this list is late, because nothing here has a date"
          label="what it is ranked by"
          className="block max-w-[88ch]"
        >
          The comparison is against the median for their own segment, so
          somebody on the longest curriculum in the programme is measured
          against other people carrying that curriculum rather than against a
          Champion on the shortest one. Ordering by hours remaining puts the
          people who were asked for most at the top, which is where an hour of
          a Champion&apos;s time goes furthest.
        </Why>

        {medians.length > 0 ? (
          <div className="mt-[12px] flex flex-wrap gap-x-[18px] gap-y-[6px] text-small font-semibold text-mute">
            {medians.map((row) => (
              <span key={row.segment}>
                {row.segment}: median {formatFractionPct(row.median)} of path{" "}
                {MIDDOT} {row.below} of {row.people} below it
              </span>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------ coach bench

type CoachGroup = {
  regionId: string;
  label: string;
  coaches: PersonProgress[];
};

/** Names printed per region before the row summarises the remainder. */
const NAMES_PER_REGION = 5;

export function CoachBench({
  rollup,
  regionLabels,
}: {
  rollup: Rollup;
  regionLabels: Record<string, string>;
}) {
  const groups = new Map<string, CoachGroup>();
  for (const coach of rollup.coaches) {
    const regionId = coach.person.regionId ?? "Unassigned";
    let group = groups.get(regionId);
    if (!group) {
      group = {
        regionId,
        label: regionLabels[regionId] ?? regionId,
        coaches: [],
      };
      groups.set(regionId, group);
    }
    group.coaches.push(coach);
  }

  const ordered = [...groups.values()].sort(
    (a, b) => b.coaches.length - a.coaches.length || a.label.localeCompare(b.label),
  );

  const coachModule = rollup.coachModule;

  return (
    <Card>
      <CardHeader
        title="Champions available to coach, by region"
        subtitle={
          coachModule
            ? `Champions who have finished ${coachModule.moduleId} ${MIDDOT} ${coachModule.title}`
            : "Champions who have finished the coaching module"
        }
        actions={<Pill variant="up">{rollup.coaches.length} available</Pill>}
      />
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
          {coachModule ? (
            <>
              Availability here is a completed module, not a job title. A
              Champion counts once they have finished{" "}
              <b>{coachModule.title}</b>, whose stated outcome is:{" "}
              <em className="not-italic font-bold">{coachModule.unlocksCapability}</em>{" "}
              That distinction matters -- coaching somebody to a defensible
              override is a different skill from being confident with the
              tool, and the curriculum treats it as one.
            </>
          ) : (
            <>
              The coaching module could not be resolved from the catalogue in
              your scope, so this panel cannot say who is qualified to pair.
              It names a module rather than a job title on purpose: coaching
              somebody to a defensible override is a taught skill, not a
              consequence of being confident with the tool.
            </>
          )}
        </p>

        {ordered.length === 0 ? (
          <p className="mt-[14px] max-w-[88ch] text-copy leading-[1.6] text-mute">
            No Champion in your scope has finished the coaching module yet.
            When one does, they appear here under their own region, because a
            pairing that needs a time zone negotiated is a pairing that does
            not happen.
          </p>
        ) : (
          <div className="mt-[14px]">
            {ordered.map((group) => (
              <div
                key={group.regionId}
                className="border-b border-rule py-[11px] last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-[10px]">
                  <span className="text-copy font-extrabold text-ink">
                    {group.label}
                  </span>
                  <span className="text-copy font-extrabold tabular text-orangeD">
                    {plural(group.coaches.length, "coach", "coaches")}
                  </span>
                </div>
                <div className="mt-[4px] text-small font-semibold leading-[1.55] text-mute">
                  {group.coaches
                    .slice(0, NAMES_PER_REGION)
                    .map((coach) => coach.person.fullName ?? coach.person.employeeId)
                    .join(", ")}
                  {group.coaches.length > NAMES_PER_REGION
                    ? `, and ${group.coaches.length - NAMES_PER_REGION} more`
                    : ""}
                </div>
                <div className="mt-[3px] text-small font-semibold text-mute tabular">
                  {formatHours(
                    group.coaches.reduce(
                      (total, coach) => total + coach.completedHours,
                      0,
                    ),
                  )}{" "}
                  of finished curriculum between them
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
