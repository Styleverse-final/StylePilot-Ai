import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Banner, Card, CardBody, ModelStrip, PageHeader } from "@/components";
import type { KpiItem } from "@/components";
import {
  buildDecisionSample,
  buildReallocation,
  buildSegments,
  buildTrustCurve,
  getAdoptionRows,
  getHumanDecisionRows,
  getProgressRows,
  getTimeRows,
  getWavePeople,
  type DecisionSample,
  type Reallocation,
  type SegmentView,
  type TrustCurve as TrustCurveData,
} from "@/components/adoption/data";
import { count, fte, formatTimestamp, pct } from "@/components/adoption/format";
import { RedeploymentLedger } from "@/components/adoption/RedeploymentLedger";
import { SegmentCards } from "@/components/adoption/SegmentCards";
import { TimeReallocation } from "@/components/adoption/TimeReallocation";
import { TrustCurve } from "@/components/adoption/TrustCurve";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getTouchlessRate, type TouchlessRate } from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";
import { redirectCmpoToPortfolio } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Adoption",
};

/**
 * ADOPTION -- THE ZERO-LAYOFF COMMITMENT, WITH ITS ARITHMETIC SHOWN.
 *
 * A server component throughout. Every figure is read at request time
 * through createServerAnonClient(), which carries the signed-in planner's
 * session cookie, so row level security decides the scope: a brand planner
 * sees their brand's 320 people, a group CMPO the portfolio's 450, and
 * neither number is wrong. Nothing here reaches for the service role to make
 * a headcount look larger.
 *
 * THE ONE THING THIS SCREEN MUST NOT DO
 * -------------------------------------
 * Present a projection as a measurement. Two panels are projections and both
 * say so in their own header rather than in a footnote: the after-state of
 * the week, which is the published formula applied to a measured
 * before-state and a measured automation rate; and the forward half of the
 * trust curve, which is dashed, hatched, hollow-markered and labelled on the
 * plot itself. The redeployment ledger is neither -- it is a commitment the
 * case makes, printed as one, with the figure the tables actually support
 * set beside it and the gap named.
 *
 * WHAT IS NOT ON THIS SCREEN
 * --------------------------
 * The curriculum, the per-person journey and the completion-against-override
 * analysis. Those are Learning's, they are already built there against the
 * same rows, and a second copy would drift from the first the day either
 * changed. This screen links to them.
 *
 * PART H
 * ------
 * The single accuracy figure reaches the page through
 * <ModelStrip accuracy={AccuracyHeadline}/>, which prints the headline and
 * the margin over seasonal naive in one breath. It is the entry for the
 * viewer's OWN brand; a viewer reading across brands gets no accuracy figure
 * and a sentence saying why, because two models backtested on different
 * series do not have a mean and inventing one would be the exact failure the
 * accuracy module exists to prevent.
 */

/**
 * Roles that can read the cohort's completion rows. Deliberately identical
 * to the array in learning_completion's read policy. A planner who defeated
 * this check would still read only their own rows, so the check exists to
 * produce an honest empty state rather than a one-person "wave".
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
 * The header figures. Two are measured and two are derived, and the pill on
 * each says which -- a KPI row that mixed them silently would undo the rest
 * of the screen before the reader reached it.
 */
function headerKpis(
  segments: SegmentView | null,
  reallocation: Reallocation | null,
): KpiItem[] {
  const kpis: KpiItem[] = [
    {
      label: "Planners in scope",
      value: segments ? count(segments.people) : "--",
      pill: segments ? `${segments.segments.length} segments` : undefined,
      tone: "grey",
    },
  ];

  if (reallocation) {
    kpis.push({
      label: "Agent execution rate",
      value: pct(reallocation.realisedAutomation, 1),
      pill: "measured",
      tone: "up",
    });
    kpis.push({
      label: "FTE of automatable work",
      value: fte(reallocation.automatableFte),
      pill: "derived",
      tone: "amber",
    });
    kpis.push({
      label: "FTE freed at that rate",
      value: fte(reallocation.freedFte),
      pill: "derived",
      tone: "amber",
    });
  }

  return kpis;
}

export default async function AdoptionPage() {
  await redirectCmpoToPortfolio();
  const planner = await getSessionPlanner();
  const appRole = planner?.appRole ?? null;
  const isManager = MANAGER_ROLES.includes(appRole ?? "");

  const sb = await createServerAnonClient();

  // FOUR INDEPENDENT READS, FOUR INDEPENDENT FAILURES.
  //
  // These are different questions answered from different tables under
  // different policies. Wrapping them in one try meant the accuracy
  // registry -- which nothing on this page depends on -- could throw away a
  // reallocation panel that had already been built. Each block degrades on
  // its own and names the one that failed.

  // ...AND FOUR INDEPENDENT ROUND TRIPS, WHICH IS A SEPARATE POINT.
  //
  // Independent FAILURES is why there are four try blocks, and that is right.
  // But independent failure did not require sequential EXECUTION, and that is
  // what it got: segments, then reallocation, then the manager panels, then
  // the registry -- four round-trip latencies end to end for reads that share
  // no data. Started together they cost the slowest one, and each still fails
  // into its own block.
  //
  // The manager reads are started only when isManager, so a planner does not
  // pay for panels they will not be shown.
  //
  // A no-op rejection handler is attached to each at creation: that marks the
  // promise handled so a rejection arriving before its await cannot escape as
  // an unhandled rejection. The await below still rejects into its own catch.
  const adoptionPromise = getAdoptionRows(sb);
  const reallocationGroup = Promise.all([getTimeRows(sb), getTouchlessRate(sb)]);
  const managerGroup = isManager
    ? Promise.all([getWavePeople(sb), getProgressRows(sb), getHumanDecisionRows(sb)])
    : null;
  const headlinePromise = getAccuracyHeadline(sb);
  for (const pending of [adoptionPromise, reallocationGroup, managerGroup, headlinePromise]) {
    pending?.catch(() => {});
  }

  let segments: SegmentView | null = null;
  let segmentsError: string | null = null;
  try {
    segments = buildSegments(await adoptionPromise);
  } catch (error) {
    segmentsError = error instanceof Error ? error.message : String(error);
  }

  let reallocation: Reallocation | null = null;
  let touchless: TouchlessRate | null = null;
  let reallocationError: string | null = null;
  try {
    const [timeRows, rate] = await reallocationGroup;
    touchless = rate;
    // The rate the formula turns on, computed from the view's own numerator
    // and denominator rather than from its rounded in_scope_rate column, so
    // the arithmetic on screen matches the arithmetic behind it.
    const acted = rate?.agent_acted ?? 0;
    const denominator = rate?.in_scope_denominator ?? 0;
    const realised = denominator > 0 ? acted / denominator : 0;
    reallocation = buildReallocation(timeRows, realised);
  } catch (error) {
    reallocationError = error instanceof Error ? error.message : String(error);
  }

  let curve: TrustCurveData | null = null;
  let sample: DecisionSample | null = null;
  let curveError: string | null = null;
  if (isManager) {
    try {
      const [people, progress, decisions] = await managerGroup!;
      curve = buildTrustCurve(people, progress);
      sample = buildDecisionSample(people, decisions);
    } catch (error) {
      curveError = error instanceof Error ? error.message : String(error);
    }
  }

  let headlines: AccuracyHeadline[] = [];
  try {
    headlines = await headlinePromise;
  } catch {
    headlines = [];
  }

  // PART H: ONE HEADLINE, OR NONE. NEVER A MEAN OF TWO.
  //
  // Resolved from SCOPE, not from the reader's home brand.
  //
  // This used to select the entry matching planner.brandId. That is wrong for
  // exactly the reader this screen is aimed at: dim_planner gives the group
  // CMPO a home brand of SPD, so a page covering both brands showed SPD's
  // accuracy alone and said nothing about it. The guard below, which exists
  // to refuse precisely that, could never fire -- model_registry was readable
  // in full by everyone, so there were always two entries and the "find" always
  // matched one.
  //
  // model_registry is now scoped by brand (phase6_scope_model_registry_by_brand),
  // so `headlines` IS the reader's scope: one entry for a brand account, two for
  // a group role. That makes the rule simple and the guard live. One readable
  // entry, show it. More than one, show none and say why -- the entries were
  // backtested on different series and their mean would describe neither.
  const accuracy = headlines.length === 1 ? headlines[0] : undefined;

  // The version travels with the figure. Naming both models beside one
  // brand's accuracy would invite the reader to attach that accuracy to
  // both, which is the same error as averaging them, made quietly.
  const stripVersion = accuracy
    ? accuracy.modelVersion
    : headlines.length > 0
      ? [...new Set(headlines.map((headline) => headline.modelVersion))]
          .sort()
          .join(" + ")
      : "no model on record";

  return (
    <>
      <PageHeader
        eyebrow="Zero-layoff commitment"
        title="Adoption"
        kpis={headerKpis(segments, reallocation)}
      />

      <Banner
        variant="violet"
        icon="i"
        title="Two premises on this screen have no table behind them. Both are named below."
        measureCh={100}
      >
        <b>One:</b> the automatable share of each activity &mdash; six values,
        printed in amber wherever they appear, beside the activity rows and
        again in the legend under the by-role table. FINAL_SPEC.md sources them
        to the Round 1 task audit, which is a workshop output; there is no task
        table, no activity dimension and nothing in policy_parameter about how
        a week is spent. <b>Two:</b> the redeployment ledger &mdash; its four named
        destinations, the FTE against each, therefore their total, and the
        zero printed beside them. No redeployment table exists in this schema,
        and nothing in it records a role ending or a destination for freed
        capacity, so the pledge that none ends is a commitment rather than a
        count. Everything else is read from
        Postgres at request time under your own row level security: the
        segments and both survey scores from planner_adoption, the before-state
        of the week from v_time_reallocation, the agent-execution rate from
        v_touchless_rate, the trust curve from learning_completion joined to
        dim_planner, the decision counts from planner_decision, the model
        identity and its accuracy from model_registry. Figures computed FROM
        those two premises &mdash; every after-bar, the freed share, the derived
        FTE totals &mdash; inherit the premise, and carry a derived mark
        wherever they appear.
      </Banner>

      <SectionHeading
        eyebrow="Who is being asked to change"
        title="Four readiness segments, from two survey answers"
      >
        {segments && segments.people > 0
          ? `${count(segments.people)} planners are readable in your scope across ${segments.segments.length} segments${
              segments.brands.length > 1
                ? `, spanning ${segments.brands.join(" and ")}`
                : ""
            }. `
          : ""}
        The segmentation is a rule on two answers, not a model output:
        planner_adoption carries no outcome label to train against, so the
        adoption index behind it is a transparent weighted composite whose
        derivation ships in every row. Readiness sets how much practice the
        curriculum has to supply; apprehension sets whether more practice is
        the answer at all. The two are independent, which is why there are
        four groups rather than a ranking.
      </SectionHeading>

      {segmentsError ? (
        <Explain>
          The readiness segments could not be read: {segmentsError}. Nothing
          has been hidden or approximated &mdash; the screen is showing you the
          failure rather than four empty tiles, which would look exactly like a
          workforce nobody surveyed.
        </Explain>
      ) : segments && !isManager ? (
        // THE CURRICULUM DETAIL IS NOT A MANAGER'S SCREEN.
        //
        // The readiness segments carry each group's recommended learning
        // hours, which is curriculum: it belongs to /learning, where the
        // individual sees their own path. Rendered here it becomes a summary
        // of who on the team is behind, which is a different artefact and one
        // nobody asked to be built. A manager reads the trust curve and the
        // override rate by wave -- whether the team is learning to disagree
        // well -- and that is what stays.
        <SegmentCards view={segments} />
      ) : null}

      <SectionHeading
        eyebrow="What changes about the work"
        title="The week, before and after"
      >
        This is the panel most easily overclaimed, so read the header on it:
        the before-state is measured and the after-state is not. Nobody has
        worked one of these weeks. What makes it a projection rather than a
        wish is that the only free variable in it &mdash; the share of in-scope
        recommendations the agents actually close without a human &mdash; is
        measured on every request from the decision log, so the bars move when
        the agents do and not when somebody wants a better slide.
      </SectionHeading>

      {reallocationError ? (
        <Explain>
          The time reallocation could not be read: {reallocationError}. Both
          halves of that panel come from views &mdash; v_time_reallocation for
          the before-state and v_touchless_rate for the automation rate &mdash;
          and neither is presented without the other, so the panel is withheld
          rather than shown with an automation rate of zero standing in for a
          failed read.
        </Explain>
      ) : reallocation ? (
        <TimeReallocation reallocation={reallocation} touchless={touchless} />
      ) : null}

      <SectionHeading
        eyebrow="Whether it is working"
        title="Trust, and the part of it that is a projection"
      >
        Adoption is not a switch that is thrown; it is three waves onboarded
        months apart, each further through the same curriculum. The chart
        below is the only wave-level time series this pilot really has, and its
        forward half is an assumption drawn as an assumption.
      </SectionHeading>

      {!isManager ? (
        <Explain>
          Completion across the cohort &mdash; by wave, with the trust curve
          drawn from it &mdash; is visible to planning managers and above. That
          is enforced by row level security on learning_completion rather than
          by this page: your session reads your own rows, a manager&apos;s reads
          their brand, and a curve traced from one person&apos;s modules would look
          like a wave without being one. Your own path, module by module, is on{" "}
          <Link
            href="/learning"
            className="font-bold text-orangeD underline decoration-peach underline-offset-2 hover:decoration-orange"
          >
            Learning
          </Link>
          , and it is not a subset of somebody else&apos;s view of you.
        </Explain>
      ) : curveError ? (
        <Explain>
          The trust curve could not be read: {curveError}. Everything above this
          line was read separately and stands on its own &mdash; one section
          failing is not a reason to withhold the others, and an empty curve
          would have looked exactly like a cohort that has done nothing.
        </Explain>
      ) : curve && sample ? (
        <TrustCurve curve={curve} sample={sample} />
      ) : null}

      <SectionHeading
        eyebrow="What happens to the people"
        title="Redeployment, and the gap between the pledge and the rows"
      >
        The commitment is that no role is removed and the freed capacity is
        named rather than banked. That commitment is the case&apos;s, not this
        database&apos;s, and the panel says so in its own header &mdash; then puts
        the figure the tables do support beside it, so the difference between
        what was promised and what today&apos;s automation rate delivers is
        something a reader can see and argue with.
      </SectionHeading>

      {reallocation ? (
        <RedeploymentLedger reallocation={reallocation} />
      ) : (
        <Explain>
          The redeployment ledger is a case premise and could be printed
          without reading anything, but the panel beside it &mdash; the FTE the
          tables actually support &mdash; needs v_time_reallocation and
          v_touchless_rate, and neither could be read. Showing the commitment
          on its own would leave the one figure on this screen that nobody can
          check standing without the one that checks it, so both are withheld.
        </Explain>
      )}

      <ModelStrip
        className="mt-[16px]"
        modelVersion={stripVersion}
        generatedAt={formatTimestamp(
          touchless?.run_at ?? accuracy?.generatedAt ?? null,
        )}
        accuracy={accuracy}
        why={
          <>
            The timestamp is the last AGENT RUN, not a training run. That is
            deliberate: the figure that moves this screen is the share of
            in-scope recommendations the agents closed without a human, and it
            changes when they run rather than when the model is retrained.
            {touchless
              ? ` At that run, ${count(touchless.agent_acted)} of ${count(
                  touchless.in_scope_denominator,
                )} in-scope recommendations closed touchless, and ${count(
                  touchless.buy_out_of_agent_scope,
                )} buy recommendations sat outside agent scope entirely because a planner must own every committed buy.`
              : " The touchless view returned nothing, so every derived figure on this screen is drawn against an automation rate of zero."}
            {accuracy
              ? ` The accuracy shown is the ${accuracy.brandId} planning-grain entry -- the only one readable in your scope, and the model whose recommendations those agents were executing -- quoted with the margin over seasonal naive attached, because the headline alone would overstate how much of this projection rests on the model being right.`
              : headlines.length > 1
                ? ` ${headlines.length} planning-grain entries are readable in your scope, one per brand, and they were backtested on different series: their mean would describe neither, and showing one would silently describe the other's planners too. So no accuracy is shown here. Each entry is on Model ops with its own benchmark margins.`
                : " No planning-grain registry entry is readable in your scope, so no accuracy is shown rather than one carried over from another model."}
          </>
        }
      />
    </>
  );
}
