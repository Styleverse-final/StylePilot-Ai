import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  Banner,
  Card,
  CardBody,
  ModelStrip,
  PageHeader,
  type KpiItem,
} from "@/components";
import {
  buildJourney,
  buildOverrideAnalysis,
  buildRollup,
  getAdoptionFor,
  getAdoption,
  getAllCompletions,
  getCompletionsFor,
  getCurriculum,
  getHumanDecisions,
  getLearningCatalogue,
  getPeople,
  getPerson,
  getRegionLabels,
  segmentHoursRange,
  type Journey,
  type LearningModule,
  type OverrideAnalysis,
  type Rollup,
} from "@/components/learning/data";
import {
  formatHours,
  formatTimestamp,
  plural,
} from "@/components/learning/format";
import {
  HoursProgress,
  NextModule,
  SegmentWhy,
} from "@/components/learning/JourneyPanels";
import { ModuleSequence } from "@/components/learning/ModuleSequence";
import {
  OverrideScatter,
  overrideShare,
} from "@/components/learning/OverrideScatter";
import {
  GroupBreakdown,
  HoursDelivered,
  SegmentBreakdown,
} from "@/components/learning/RollupPanels";
import {
  CoachBench,
  SupportList,
  selectSupport,
} from "@/components/learning/SupportPanels";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Learning",
};

/**
 * THE LEARNING MODULE -- deliverable three, made functional.
 *
 * The case asks how employees are reskilled and how that strengthens the
 * transformation. That answer normally lives on a slide, where it cannot be
 * wrong. Here it reads its own rows: fifteen modules, 2,836 completion
 * records, a segment target per person and the curriculum inheritance rules
 * encoded in Postgres rather than restated in TypeScript.
 *
 * ONE ROUTE, TWO AUDIENCES
 * ------------------------
 * Everyone gets their own path -- that is the top of the screen and it is
 * the same screen for a planner and for a group CMPO, because a leader
 * exempt from the programme they are asking everyone else to complete is the
 * quickest way to make the programme read as theatre. Managers get the
 * cohort roll-up UNDERNEATH their own path, never instead of it.
 *
 * The split is enforced in Postgres, not here. learning_completion's read
 * policy hands you your own rows, or the brand roll-up if your app_role is
 * planning_manager, cmpo, group_cmpo or coe_admin. This page checks the same
 * role list so it can render an honest empty state rather than a section
 * that silently comes back with one row in it, but a planner who defeated
 * that check would still read nothing.
 *
 * THE TONE IS THE DELIVERABLE
 * ---------------------------
 * There are no due dates on this page, because the schema has none. Nothing
 * is mandatory, nothing is overdue, and nothing is red. Every module leads
 * with what it leaves the person able to DO. The identical rows would
 * support a compliance dashboard with overdue badges; that dashboard would
 * answer the webinar's question badly, and this one is trying to answer it
 * well.
 *
 * PART H
 * ------
 * The one accuracy figure on this page reaches the screen through
 * <ModelStrip accuracy={AccuracyHeadline}/>, which prints the headline and
 * the margin over seasonal naive in the same breath. It appears at all only
 * because the override chart is about planners departing from that model,
 * and "how good is the thing they are overriding" is the first question a
 * reader asks.
 */

/**
 * Roles that can read the cohort roll-up. Deliberately identical to the
 * array in learning_completion's read policy -- if that policy changes, this
 * changes with it, and until then a mismatch would only ever produce an
 * empty section rather than a leak.
 */
const MANAGER_ROLES: readonly string[] = [
  "planning_manager",
  "cmpo",
  "group_cmpo",
  "coe_admin",
];

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-[8px] pb-[14px] pt-[26px]">
      <div className="text-small font-bold text-mute">{eyebrow}</div>
      <h2 className="mt-[2px] text-hero font-extrabold text-ink">{title}</h2>
      {children === undefined ? null : (
        <p className="mt-[7px] max-w-[92ch] text-copy leading-[1.6] text-body">
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * The header figures. Hours are counted against THE PATH -- the modules this
 * person actually has -- not against the segment recommendation, so somebody
 * who has finished everything asked of them reads as finished. Where the two
 * differ (one segment's curriculum totals 13 hours against a 14-hour
 * recommendation) the difference is a property of the curriculum and is shown
 * as such in the hours panel, not as a shortfall carried by the person.
 */
function headerKpis(journey: Journey): KpiItem[] {
  const complete = journey.totalCount > 0 && journey.completedCount === journey.totalCount;
  return [
    {
      label: "Hours so far",
      value: formatHours(journey.completedHours),
      pill: `of ${formatHours(journey.pathHours)} on your path`,
      tone: complete ? "up" : "orange",
    },
    {
      label: "Modules finished",
      value: `${journey.completedCount} / ${journey.totalCount}`,
    },
    {
      label: "Your segment",
      value: journey.adoption?.segment ?? "Unsegmented",
      pill: journey.person.learningTier,
      tone: "violet",
    },
  ];
}

/** The registry entry for the model the decisions on screen argued with. */
function accuracyForDecisions(
  headlines: readonly AccuracyHeadline[],
  analysis: OverrideAnalysis | null,
  brandId: string | null,
): AccuracyHeadline | null {
  const versions = new Set(analysis?.modelVersions ?? []);
  return (
    headlines.find((headline) => versions.has(headline.modelVersion)) ??
    headlines.find((headline) => headline.brandId === brandId) ??
    null
  );
}

export default async function LearningPage() {
  const planner = await getSessionPlanner();
  const employeeId = planner?.employeeId ?? null;
  const appRole = planner?.appRole ?? null;
  const isManager = MANAGER_ROLES.includes(appRole ?? "");

  if (!employeeId) {
    return (
      <>
        <PageHeader eyebrow="Capability building" title="Learning" />
        <Explain>
          You are signed in, but your account is not linked to a planner
          record, so there is no employee id to hang a learning path on. Every
          module on this screen is resolved from your adoption segment and
          your learning tier, both of which live on that record, and your
          progress rows are keyed to it. Ask your workspace administrator to
          link your account and the path appears; nothing is hidden from you
          in the meantime, there is simply nothing yet to show.
        </Explain>
      </>
    );
  }

  const sb = await createServerAnonClient();

  // TWO INDEPENDENT READS, TWO INDEPENDENT FAILURES.
  //
  // The employee's own path and the manager roll-up are different questions
  // answered from different tables under different policies. Wrapping both in
  // one try meant a roll-up panel failing -- or, worse, the accuracy registry
  // read, which nothing on this page depends on -- threw away a journey that
  // had already been built and replaced the whole screen with an error card. A
  // manager must not lose their own learning path because a cohort panel could
  // not be read, so each block degrades on its own and says which one failed.

  let journey: Journey | null = null;
  let catalogue: LearningModule[] = [];
  let journeyError: string | null = null;

  try {
    const [person, adoption, completions, modules] = await Promise.all([
      getPerson(sb, employeeId),
      getAdoptionFor(sb, employeeId),
      getCompletionsFor(sb, employeeId),
      getLearningCatalogue(sb),
    ]);

    catalogue = modules;

    if (person) {
      // modules_for() decides what this person's path contains. The two
      // inheritance rules -- "Needs most support" inherits the Willing
      // curriculum and adds two, a C3 leader gets C2 plus governance -- live
      // in that function and are not restated here.
      const curriculum = adoption?.segment
        ? await getCurriculum(sb, adoption.segment, person.learningTier)
        : [];
      journey = buildJourney(person, adoption, curriculum, completions);
    }
  } catch (error) {
    journeyError = error instanceof Error ? error.message : String(error);
  }

  let rollup: Rollup | null = null;
  let analysis: OverrideAnalysis | null = null;
  let regionLabels: Record<string, string> = {};
  let rollupError: string | null = null;
  let headlines: AccuracyHeadline[] = [];

  // The roll-up does not depend on the viewer having a path of their own. A
  // CMPO with no dim_planner row is still accountable for the cohort, and
  // short-circuiting on a missing journey would have handed them nothing.
  if (isManager) {
    try {
      const [people, adoptions, allCompletions, decisions, modules, labels] =
        await Promise.all([
          getPeople(sb),
          getAdoption(sb),
          getAllCompletions(sb),
          getHumanDecisions(sb),
          getLearningCatalogue(sb),
          getRegionLabels(sb),
        ]);
      regionLabels = labels;
      rollup = buildRollup(people, adoptions, allCompletions, modules, labels);
      analysis = buildOverrideAnalysis(rollup.people, decisions);
    } catch (error) {
      rollupError = error instanceof Error ? error.message : String(error);
    }

    // Nothing on this page needs the accuracy registry. It annotates the
    // override chart, so its failure costs that annotation and nothing else.
    try {
      headlines = await getAccuracyHeadline(sb);
    } catch {
      headlines = [];
    }
  }

  const support = rollup ? selectSupport(rollup) : null;
  const accuracy = accuracyForDecisions(headlines, analysis, planner?.brandId ?? null);
  const segmentHours = rollup ? segmentHoursRange(rollup) : null;

  return (
    <>
      <PageHeader
        eyebrow="Capability building"
        title={journey ? "Your learning path" : "Learning"}
        kpis={journey ? headerKpis(journey) : undefined}
      />

      {journeyError ? (
        <Explain>
          Your own learning path could not be read: {journeyError}. Nothing has
          been hidden or approximated -- the screen is showing you the failure
          rather than an empty path, which would look exactly like somebody
          who has not started.
        </Explain>
      ) : journey ? (
        <>
          <Banner
            variant="violet"
            icon="i"
            title="A path, not a checklist"
            measureCh={96}
          >
            There are no due dates on this screen because there are none in the
            data, and adding one would turn a curriculum into something to fail
            against. Your path was sized from two answers you gave in the
            adoption survey, and the modules on it are ordered so each one is
            usable before the next begins. Progress is recorded so somebody can
            pair you with a Champion who has already been through it -- which
            is the only thing anyone does with these rows.
          </Banner>

          <div className="mb-[16px] grid grid-cols-[1.25fr_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
            <NextModule journey={journey} />
            <HoursProgress journey={journey} />
          </div>

          <div className="grid grid-cols-[1.35fr_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
            <ModuleSequence journey={journey} />
            <SegmentWhy journey={journey} />
          </div>
        </>
      ) : (
        <Explain>
          Your session resolves to employee {employeeId}, but no planner row
          came back for it under row level security. That is what you would
          see if the record were moved to another brand after your session
          began. The catalogue holds{" "}
          {plural(catalogue.length, "module", "modules")}; which of them are
          yours is decided by your adoption segment and learning tier, and
          neither is readable right now.
        </Explain>
      )}

      {!isManager ? (
        <div className="mt-[16px]">
          <Explain>
            Completion across the cohort -- by segment, wave, region and role,
            with the people a Champion pairing would help most -- is visible to
            planning managers and above. That is enforced by row level security
            on the completion table rather than by this page: your session
            reads your own rows, and a manager&apos;s reads their brand. What
            this screen holds for you is your own path, and it is not a subset
            of somebody else&apos;s view of you.
          </Explain>
        </div>
      ) : rollupError ? (
        <div className="mt-[16px]">
          <Explain>
            The cohort roll-up could not be read: {rollupError}. Anything above
            this line was read separately and stands on its own -- one section
            failing is not a reason to withhold the other, and an empty
            roll-up would have looked exactly like a cohort that has done
            nothing.
          </Explain>
        </div>
      ) : rollup && support ? (
        <>
          <SectionHeading
            eyebrow="Cohort roll-up"
            title="Across the people you are accountable for"
          >
            {rollup.totals.people === 0
              ? "No completion rows are readable in your scope yet."
              : `${plural(rollup.totals.people, "person", "people")} with a path in scope, ${rollup.totals.completed} of ${rollup.totals.modules} modules finished, ${formatHours(rollup.totals.completedHours)} delivered.`}{" "}
            Row level security decides that scope, not this page: a planning
            manager reads their brand, a group CMPO reads the portfolio, and a
            planner reads nothing beyond their own rows. Everything below is
            scored against each person&apos;s own curriculum, so{" "}
            {segmentHours
              ? `a segment recommended ${formatHours(segmentHours.most)} is not made to look worse than one recommended ${formatHours(segmentHours.least)} -- both figures read from planner_adoption for the people in your scope, not written into this sentence.`
              : "a segment asked for more hours is not made to look worse than one asked for fewer."}
          </SectionHeading>

          <div className="mb-[16px]">
            <SegmentBreakdown rollup={rollup} />
          </div>

          <div className="mb-[16px] grid grid-cols-3 gap-[16px] max-[1140px]:grid-cols-1">
            <GroupBreakdown
              title="By wave"
              subtitle="Pilot cohorts, in the order they were onboarded"
              groups={rollup.byWave}
              caption="Learning completion by pilot wave"
            />
            <GroupBreakdown
              title="By region"
              subtitle="Where the pairing has to physically happen"
              groups={rollup.byRegion}
              caption="Learning completion by region"
            />
            <GroupBreakdown
              title="By role"
              subtitle="Job title from the planner record, not app role"
              groups={rollup.byRole}
              caption="Learning completion by role"
            />
          </div>

          <Card className="mb-[16px]">
            <CardBody>
              <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
                Read the wave column before reading the other two. Completion
                tracks how long somebody has been in the programme far more
                strongly than it tracks anything about them, and the waves were
                onboarded months apart -- so a later wave sitting well below an
                earlier one is the rollout schedule showing through, not a
                regional or role difference. The same caution applies to
                region and role, where wave membership is unevenly spread: a
                region that is mostly Wave 3 will read low for reasons that
                have nothing to do with the region.
              </p>
            </CardBody>
          </Card>

          <div className="mb-[16px] grid grid-cols-[1fr_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
            <HoursDelivered rollup={rollup} />
            <CoachBench rollup={rollup} regionLabels={regionLabels} />
          </div>

          <div className="mb-[16px]">
            <SupportList selection={support} regionLabels={regionLabels} />
          </div>

          <SectionHeading
            eyebrow="The question worth asking of this data"
            title="Does learning change how often people override the model?"
          >
            This is the part of the programme that would justify itself
            commercially if it held: planners further through their path
            trusting the recommendation more, and spending their attention on
            the cases that need it. The chart below tests it against the
            decisions actually committed in the pilot. It leans the right way
            and it does not hold, and both halves of that sentence are on the
            screen at the same size.
          </SectionHeading>

          {analysis ? <OverrideScatter analysis={analysis} /> : null}

          {analysis ? (
            <ModelStrip
              className="mt-[16px]"
              modelVersion={
                analysis.modelVersions.length > 0
                  ? analysis.modelVersions.join(" + ")
                  : (accuracy?.modelVersion ?? "no model on the decisions in scope")
              }
              generatedAt={formatTimestamp(
                analysis.latestDecisionAt ?? accuracy?.generatedAt ?? null,
              )}
              accuracy={accuracy ?? undefined}
              why={
                <>
                  The override rates above are measured against{" "}
                  {plural(analysis.decisionCount, "decision", "decisions")}{" "}
                  committed by people, of which {overrideShare(analysis)}{" "}
                  departed from the recommendation as issued. That share is
                  counted across decisions rather than averaged across
                  planners, which is why it differs from the mean of the
                  individual override rates in the panel above. The timestamp
                  is the most recent of those decisions, not a model training
                  run -- this chart is about human behaviour, and it moves
                  when somebody decides something rather than when the model
                  is retrained.
                  {accuracy
                    ? " The accuracy shown is for the model those decisions argued with, quoted with the margin over seasonal naive attached, because the headline on its own would overstate how much room a planner has to be right by disagreeing."
                    : ""}
                </>
              }
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
