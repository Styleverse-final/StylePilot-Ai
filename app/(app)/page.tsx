import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AccuracyStatement,
  Kpi,
  KpiRow,
  ModelStrip,
  PageHeader,
  Pill,
} from "@/components";
import type { ModelConfidence } from "@/components";
import { AccuracyCard } from "@/components/dashboard/AccuracyCard";
import { AgentActivity } from "@/components/dashboard/AgentActivity";
import { DecisionThreads } from "@/components/dashboard/DecisionThreads";
import { EmbargoNotice } from "@/components/dashboard/EmbargoNotice";
import { HeroBrief, type HeroHighlight } from "@/components/dashboard/HeroBrief";
import { ImpactTracker } from "@/components/dashboard/ImpactTracker";
import {
  MarkdownAttribution,
  type DriverCoverage,
} from "@/components/dashboard/MarkdownAttribution";
import {
  PrioritisedActions,
  destinationLabel,
  routeForRecType,
} from "@/components/dashboard/PrioritisedActions";
import {
  MIDDOT,
  formatCount,
  formatCrore,
  formatPct,
  formatStamp,
  humanise,
} from "@/components/dashboard/format";
import { accuracySentence, getAccuracyHeadline } from "@/lib/accuracy";
import type { AccuracyHeadline } from "@/lib/accuracy";
import {
  getAgentRuns,
  getEmbargoStatus,
  getModelRegistry,
  getRecommendations,
  getTouchlessRate,
  getValueSummary,
} from "@/lib/queries";
import type {
  AgentRun,
  EmbargoStatus,
  ModelRegistryEntry,
  RecommendationState,
  TouchlessRate,
  ValueSummary,
} from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

/**
 * The command centre -- the planner's landing screen.
 *
 * Landing by role: planner through commercial_lead land here. cmpo and
 * group_cmpo land on /portfolio instead, because they watch the business
 * rather than work a queue, and the redirect fires before any queue data is
 * fetched.
 *
 * SCOPE. Every read on this page goes through createServerAnonClient(),
 * which carries the session cookie, so row level security scopes it to the
 * signed-in planner's brand, categories and region. A planner sees far fewer
 * than the 605 recommendations that exist in the pilot. That is correct, and
 * nothing here widens the scope to make a number look bigger.
 *
 * PART H. Accuracy appears twice on this screen -- once in the header KPI
 * row, once in the accuracy card -- and both times through
 * <AccuracyStatement/>, which cannot render the headline without the
 * seasonal-naive margin beside it. No accuracy percentage is written as a
 * literal anywhere in this file, and the model strip deliberately does not
 * take its accuracyPct prop, because that prop renders the headline alone.
 */

const PORTFOLIO_ROLES = ["cmpo", "group_cmpo"];

export const metadata: Metadata = {
  title: "Command centre",
};

/** How many open rows the prioritised list shows before it asks for a click. */
const ACTION_ROWS = 8;

/** Confidence bands, worst first: the strip reports the weakest one present. */
const CONFIDENCE_ORDER: readonly ModelConfidence[] = ["Low", "Medium", "High"];

function weakestConfidence(
  rows: readonly RecommendationState[],
): ModelConfidence | undefined {
  for (const band of CONFIDENCE_ORDER) {
    if (rows.some((row) => row.confidence === band)) return band;
  }
  return undefined;
}

function sumValue(rows: readonly RecommendationState[]): number {
  return rows.reduce((total, row) => total + (row.value_at_stake_inr ?? 0), 0);
}

function valuedCount(rows: readonly RecommendationState[]): number {
  return rows.filter((row) => row.value_at_stake_inr !== null).length;
}

/** Coverage for one markdown driver, from the rows actually in scope. */
function coverageFor(rows: readonly RecommendationState[]): DriverCoverage {
  const priced = valuedCount(rows);
  return {
    openCount: rows.length,
    openValueInr: priced === 0 ? null : sumValue(rows),
  };
}

/** The eyebrow above the title: the date the displayed rows were generated. */
function eyebrowFor(generatedAt: string | null): string {
  const stamp = formatStamp(generatedAt);
  return stamp
    ? `Command centre ${MIDDOT} rows generated ${stamp} IST`
    : "Command centre";
}

export default async function DashboardPage() {
  const planner = await getSessionPlanner();
  if (PORTFOLIO_ROLES.includes(planner?.appRole ?? "")) redirect("/portfolio");

  const brandId = planner?.brandId ?? null;
  const sb = await createServerAnonClient();

  const [
    accuracyRows,
    registry,
    touchless,
    agentRuns,
    recommendations,
    valueSummaries,
    embargo,
  ]: [
    AccuracyHeadline[],
    ModelRegistryEntry[],
    TouchlessRate | null,
    AgentRun[],
    RecommendationState[],
    ValueSummary[],
    EmbargoStatus[],
  ] = await Promise.all([
    getAccuracyHeadline(sb),
    getModelRegistry(sb),
    getTouchlessRate(sb),
    getAgentRuns(sb, 60),
    brandId
      ? getRecommendations(sb, brandId)
      : Promise.resolve<RecommendationState[]>([]),
    getValueSummary(sb),
    getEmbargoStatus(sb, brandId ?? undefined),
  ]);

  // ------------------------------------------------------------ accuracy
  // One headline per brand. A brand planner sees theirs; an account that can
  // read both falls back to the first, and the card names which model it is.
  const accuracy =
    accuracyRows.find((row) => row.brandId === brandId) ?? accuracyRows[0] ?? null;
  const registryEntry =
    accuracy === null
      ? null
      : (registry.find((row) => row.model_version === accuracy.modelVersion) ??
        null);

  // -------------------------------------------------------- the work queue
  // "Open" is the absence of a decision row, not a status value. A
  // recommendation nobody has decided is the only thing that can need you.
  const open = recommendations.filter((row) => row.status === null);
  const openByValue = [...open].sort(
    (a, b) => (b.value_at_stake_inr ?? -1) - (a.value_at_stake_inr ?? -1),
  );
  const openValueInr = sumValue(open);
  const openWithoutValue = open.length - valuedCount(open);

  const decided = recommendations.filter(
    (row) => row.status === "APPROVED" || row.status === "MODIFIED",
  );

  const topRow = openByValue.length > 0 ? openByValue[0] : null;
  const highlight: HeroHighlight | null =
    topRow === null
      ? null
      : {
          seriesKey: topRow.series_key,
          brandId: topRow.brand_id,
          headline: humanise(topRow.action),
          detail: topRow.rationale,
          valueInr: topRow.value_at_stake_inr,
          href: routeForRecType(topRow.rec_type),
          ctaLabel: `Review ${destinationLabel(topRow.rec_type).toLowerCase()}`,
        };

  // --------------------------------------------------------- markdown cover
  // The case's three markdown drivers, each matched to the open work this
  // product is raising against it in the planner's own scope.
  const coverage: Record<string, DriverCoverage> = {
    buy: coverageFor(open.filter((row) => row.rec_type === "BUY_QUANTITY")),
    allocation: coverageFor(open.filter((row) => row.rec_type === "ALLOCATION")),
    response: coverageFor(open.filter((row) => row.rec_type === "EXCEPTION")),
  };

  // ------------------------------------------------------------ value summary
  const summary =
    valueSummaries.find(
      (row) => row.scope === "BRAND" && row.brand_id === brandId,
    ) ??
    valueSummaries.find((row) => row.scope === "PORTFOLIO") ??
    valueSummaries[0] ??
    null;

  // ------------------------------------------------- provenance for the strip
  // Model version and generated-at come from the rows this screen displayed,
  // not from a constant and not from whatever trained most recently.
  const displayed = openByValue.slice(0, ACTION_ROWS);
  const stampSource = displayed.length > 0 ? displayed : recommendations;
  const generatedAt =
    stampSource
      .map((row) => row.generated_at)
      .filter((value): value is string => typeof value === "string")
      .sort()
      .pop() ?? accuracy?.generatedAt ?? null;
  const modelVersion =
    stampSource.find((row) => row.model_version !== null)?.model_version ??
    accuracy?.modelVersion ??
    "no model row in scope";

  const stamp = formatStamp(generatedAt);
  // The lock tag is a claim about the data, so it needs a row to stand on:
  // an unreadable embargo table is not evidence that anything is sealed.
  const embargoLocked =
    embargo.length > 0 &&
    embargo.every((row) => (row.weeks_revealed ?? 0) === 0);

  return (
    <>
      <PageHeader eyebrow={eyebrowFor(generatedAt)} title="Command centre">
        <KpiRow>
          {/* Part H: never the headline on its own. */}
          {accuracy === null ? (
            <Kpi label="Forecast accuracy" value="--" />
          ) : (
            <AccuracyStatement accuracy={accuracy} variant="inline" />
          )}

          <Kpi
            label="Margin protected"
            value={formatCrore(summary?.total_margin_inr ?? null)}
            pill={
              summary ? (
                <Pill variant="up">
                  {summary.scope === "PORTFOLIO" ? "portfolio" : "projected"}
                </Pill>
              ) : undefined
            }
          />

          <Kpi
            label="Touchless"
            value={formatPct(touchless?.in_scope_rate ?? null)}
            pill={
              touchless ? (
                <Pill variant="violet" tabular>
                  {formatCount(touchless.agent_acted)} of{" "}
                  {formatCount(touchless.in_scope_denominator)} in scope
                </Pill>
              ) : undefined
            }
          />

          {/*
            The queue that needs a human: rows with no decision row at all.
            Not labelled "escalated", because that word belongs to the
            agent_escalated count -- and these rows also include the buy
            recommendations the agents were never allowed to touch.
          */}
          <Kpi
            label="Awaiting your decision"
            value={formatCount(open.length)}
            pill={
              open.length > 0 ? (
                <Pill variant="orange" tabular>
                  {formatCrore(openValueInr)}
                </Pill>
              ) : (
                <Pill variant="grey">queue clear</Pill>
              )
            }
          />
        </KpiRow>
      </PageHeader>

      {/* 1 + 2 + 3 */}
      <div className="mb-[16px] grid grid-cols-[292px_1fr] gap-[16px] max-[1140px]:grid-cols-1">
        <HeroBrief
          openCount={open.length}
          openValueInr={openValueInr}
          openWithoutValue={openWithoutValue}
          agentActed={touchless?.agent_acted ?? null}
          agentEscalated={touchless?.agent_escalated ?? null}
          inScopeDenominator={touchless?.in_scope_denominator ?? null}
          highlight={highlight}
          queueHref="/exceptions"
        />

        <div className="flex flex-col gap-[16px]">
          <DecisionThreads
            touchless={touchless}
            headerTag={
              embargoLocked ? (
                <span className="rounded-pill bg-amberW px-[12px] py-[5px] text-[11.5px] font-bold text-amber">
                  Forward actuals locked
                </span>
              ) : undefined
            }
          />
          <AgentActivity runs={agentRuns} now={Date.now()} />
        </div>
      </div>

      {/* 4 */}
      <div className="mb-[16px]">
        <PrioritisedActions rows={displayed} openTotal={open.length} />
      </div>

      {/* 5 + 6 + 7 */}
      <div className="grid grid-cols-3 gap-[16px] max-[1140px]:grid-cols-1">
        <AccuracyCard
          accuracy={accuracy}
          metrics={registryEntry?.metrics ?? null}
        />
        <ImpactTracker
          summary={summary}
          realisedValueInr={sumValue(decided)}
          decidedCount={decided.length}
          totalCount={recommendations.length}
          totalValueInr={sumValue(recommendations)}
        />
        <MarkdownAttribution coverage={coverage} />
      </div>

      {/* 8 */}
      <div className="mt-[16px]">
        <EmbargoNotice rows={embargo} />
      </div>

      <ModelStrip
        className="mt-[16px]"
        modelVersion={modelVersion}
        generatedAt={stamp ? `${stamp} IST` : "not stated on these rows"}
        confidence={weakestConfidence(displayed)}
        why={
          <>
            {accuracy ? (
              <>
                {accuracySentence(accuracy)}{" "}
              </>
            ) : null}
            {stampSource.length === 0 ? (
              <>
                No recommendation row is readable in your scope, so the
                version and timestamp above fall back to the registry entry
                behind the accuracy figures rather than to rows this screen
                displayed.
              </>
            ) : (
              <>
                The version and timestamp above are read from the{" "}
                {formatCount(stampSource.length)} recommendation{" "}
                {stampSource.length === 1 ? "row" : "rows"} this screen drew
                on, not from the newest training run. The confidence band is
                the weakest one present among the rows listed, because a Low
                band caps any grade above it &mdash; a published rule in the
                data contract, so you can predict what the system will do
                before it does it.
              </>
            )}{" "}
            Everything on this page is scoped by row level security to your
            own brand, categories and region, so the counts are yours rather
            than the pilot&rsquo;s.
          </>
        }
      />
    </>
  );
}
