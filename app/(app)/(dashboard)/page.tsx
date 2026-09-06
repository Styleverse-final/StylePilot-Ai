import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AccuracyStatement,
  Bars,
  KpiCard,
  ModelStrip,
  PageHeader,
  Pill,
  Sparkline,
  SplitBar,
} from "@/components";
import type { ModelConfidence } from "@/components";
import { AccuracyCard } from "@/components/dashboard/AccuracyCard";
import { EvidenceSection } from "@/components/dashboard/EvidenceSection";
import { AgentsPanel } from "@/components/dashboard/AgentsPanel";
import { EmbargoNotice } from "@/components/dashboard/EmbargoNotice";
import {
  HeroBrief,
  type HeroHighlight,
} from "@/components/dashboard/HeroBrief";
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
  CalendarIcon,
  CoinsIcon,
  HourglassIcon,
  PointerIcon,
  TargetIcon,
} from "@/components/dashboard/icons";
import {
  MIDDOT,
  formatCount,
  formatCrore,
  formatDayShort,
  formatPct,
  formatStamp,
  humanise,
} from "@/components/dashboard/format";
import {
  clearedPerDay,
  touchlessRunSeries,
} from "@/components/dashboard/trends";
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
  RecType,
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

/** The separator in the strapline under the title. */
const ARROW = String.fromCharCode(0x2192);

export const metadata: Metadata = {
  title: "Command centre",
};

/**
 * How many open rows the prioritised list shows before it asks for a click.
 *
 * Twelve, not eight. The queue is the work and the evidence cards that used
 * to sit under it are now one tabbed card, so there is room for four more
 * rows without pushing anything below the fold that was above it.
 */
const ACTION_ROWS = 12;

/** The rec_type filter, read from ?type= and validated against the enum. */
const REC_TYPES: readonly RecType[] = [
  "EXCEPTION",
  "BUY_QUANTITY",
  "ALLOCATION",
];

/**
 * Which argument the evidence card is showing.
 *
 * The three are the product's case for itself: that the model beats its
 * benchmarks, that the money is real, that the case's drivers are covered.
 * The keys are the fragment names the KPI band has always linked to, so a
 * link written before this dropdown existed still lands on the right panel.
 */
const EVIDENCE = [
  { value: "accuracy", label: "Accuracy" },
  { value: "impact", label: "Value realised" },
  { value: "markdown-cover", label: "Markdown cover" },
] as const;

type EvidenceKey = (typeof EVIDENCE)[number]["value"];

function readEvidence(value: string | string[] | undefined): EvidenceKey {
  const first = Array.isArray(value) ? value[0] : value;
  return EVIDENCE.find((option) => option.value === first)?.value ?? "accuracy";
}

function readType(value: string | string[] | undefined): RecType | null {
  const first = Array.isArray(value) ? value[0] : value;
  return REC_TYPES.find((type) => type === first) ?? null;
}

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

/**
 * The generated-at stamp, as its own card at the top right.
 *
 * It used to be the tail of the eyebrow line, where it read as a subtitle to
 * the screen name. It is not a subtitle: it is the single fact that tells a
 * reader whether anything below is worth acting on this morning, and it is
 * stated even when it is missing, because "no stamp" is itself a warning.
 */
function StampCard({ stamp }: { stamp: string | null }) {
  return (
    <div className="flex items-center gap-[9px] rounded-inner bg-white px-[12px] py-[7px] shadow-raised">
      <span aria-hidden="true" className="text-mute">
        <CalendarIcon />
      </span>
      <span className="block">
        <span className="block text-micro font-extrabold uppercase text-mute">
          Rows generated
        </span>
        <span className="block text-small font-extrabold tabular-nums text-ink">
          {stamp ? `${stamp} IST` : "not stated on these rows"}
        </span>
      </span>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [planner, params] = await Promise.all([
    getSessionPlanner(),
    searchParams,
  ]);
  if (PORTFOLIO_ROLES.includes(planner?.appRole ?? "")) redirect("/portfolio");

  const activeType = readType(params.type);
  const evidence = readEvidence(params.evidence);

  /**
   * A KPI card deep-links to the panel that argues its number. The link has to
   * carry the queue filter forward as well, or opening the accuracy panel
   * would quietly clear a planner's narrowing of the queue below it.
   */
  const evidenceHref = (key: EvidenceKey): string =>
    `/?${activeType === null ? "" : `type=${activeType}&`}evidence=${key}#${key}`;

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
    accuracyRows.find((row) => row.brandId === brandId) ??
    accuracyRows[0] ??
    null;
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

  // The exceptions THIS reader can act on. DecisionThreads counts the brand's
  // whole programme, because that is what v_touchless_rate measures; this is
  // the part of it that is actually theirs, and the panel labels the two
  // differently rather than letting a brand total read as a personal queue.
  const openExceptions = open.filter((row) => row.rec_type === "EXCEPTION");

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
    allocation: coverageFor(
      open.filter((row) => row.rec_type === "ALLOCATION"),
    ),
    response: coverageFor(open.filter((row) => row.rec_type === "EXCEPTION")),
  };

  // How many of the case's three markdown drivers currently carry open work in
  // this planner's scope. The same count MarkdownAttribution states at the
  // foot of its own panel, computed here so the summary line can show it while
  // that panel is closed.
  const DRIVER_COUNT = Object.keys(coverage).length;
  const coveredDrivers = Object.values(coverage).filter(
    (driver) => driver.openCount > 0,
  ).length;

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
  // The chips narrow WHAT IS LISTED, never what is counted. Every figure in
  // the header band, the hero and the agents panel stays the whole scope: a
  // filter is a way of working the queue, not a claim that the rest of it
  // stopped existing.
  const countsByType: Record<string, number> = {};
  for (const row of open) {
    if (row.rec_type === null) continue;
    countsByType[row.rec_type] = (countsByType[row.rec_type] ?? 0) + 1;
  }

  const filtered =
    activeType === null
      ? openByValue
      : openByValue.filter((row) => row.rec_type === activeType);

  const displayed = filtered.slice(0, ACTION_ROWS);
  const stampSource = displayed.length > 0 ? displayed : recommendations;
  const generatedAt =
    stampSource
      .map((row) => row.generated_at)
      .filter((value): value is string => typeof value === "string")
      .sort()
      .pop() ??
    accuracy?.generatedAt ??
    null;
  const modelVersion =
    stampSource.find((row) => row.model_version !== null)?.model_version ??
    accuracy?.modelVersion ??
    "no model row in scope";

  const stamp = formatStamp(generatedAt);

  // The two recorded series. Both come out of rows already fetched above --
  // the agent runs the activity feed draws, and the recommendations the queue
  // is built from -- so tracking these four measures costs no extra query.
  const runRate = touchlessRunSeries(agentRuns);
  const cleared = clearedPerDay(recommendations);
  const clearedTo = formatDayShort(cleared.latestDay);

  const markdownAvoided = summary?.markdown_avoided_margin_inr ?? null;
  const lostSales = summary?.lost_sales_recovered_margin_inr ?? null;

  return (
    <>
      <PageHeader
        title={
          <>
            Command <span className="text-orange">centre</span>
          </>
        }
        strapline={`Insights ${ARROW} Impact ${ARROW} Growth`}
        aside={<StampCard stamp={stamp} />}
        band={
          <div className="grid grid-cols-4 gap-[12px] max-[1140px]:grid-cols-2">
            {/* Part H: never the headline on its own. The card variant is the
                only thing on this screen allowed to render it, and it cannot
                render it without the seasonal-naive margin beside it. */}
            {accuracy === null ? (
              <KpiCard
                tone="green"
                icon={<TargetIcon />}
                label="Forecast accuracy"
                value="--"
                basis="no accuracy row is readable in your scope"
                href={evidenceHref("accuracy")}
                hrefLabel="Open the accuracy card"
              />
            ) : (
              <AccuracyStatement
                accuracy={accuracy}
                variant="card"
                icon={<TargetIcon />}
                href={evidenceHref("accuracy")}
                hrefLabel="Open the accuracy card"
              />
            )}

            <KpiCard
              tone="amber"
              icon={<CoinsIcon />}
              label="Margin protected"
              value={formatCrore(summary?.total_margin_inr ?? null)}
              pill={
                summary ? (
                  <Pill variant="amber">
                    {summary.scope === "PORTFOLIO" ? "portfolio" : "projected"}
                  </Pill>
                ) : undefined
              }
              /* A split, not a trend: value_summary carries generated_at NULL
                 on every row, so there is no history to plot. The two segments
                 do sum to the total legitimately, which is the one thing this
                 figure can honestly be drawn as. */
              mark={
                markdownAvoided === null || lostSales === null ? undefined : (
                  <SplitBar
                    label={`Markdown avoided ${formatCrore(markdownAvoided)}, lost sales recovered ${formatCrore(lostSales)}`}
                    segments={[
                      { value: markdownAvoided, label: "markdown avoided" },
                      { value: lostSales, label: "lost sales recovered" },
                    ]}
                  />
                )
              }
              basis={
                markdownAvoided === null || lostSales === null
                  ? "no value summary is readable in your scope"
                  : `markdown ${formatCrore(markdownAvoided)} ${MIDDOT} lost sales ${formatCrore(lostSales)}`
              }
              detail={
                <>
                  <span className="block">
                    Markdown avoided is already a margin figure; lost sales
                    recovered is revenue converted to margin at the brand gross
                    margin before the two were added. That conversion is what
                    makes the total a legitimate sum.
                  </span>
                  <span className="mt-[6px] block">
                    No movement is drawn because none is recorded: the value
                    summary holds one row per scope and carries no generated-at
                    stamp, so this figure has no history and not even a date.
                  </span>
                  {summary?.basis ? (
                    <span className="mt-[6px] block italic">
                      {summary.basis}
                    </span>
                  ) : null}
                </>
              }
              href={evidenceHref("impact")}
              hrefLabel="Open the impact tracker"
            />

            <KpiCard
              tone="violet"
              icon={<PointerIcon />}
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
              mark={
                <Sparkline
                  label={`Acted as a share of examined across the last ${formatCount(runRate.runCount)} agent runs`}
                  points={runRate.points}
                />
              }
              basis={
                runRate.runCount < 2
                  ? "of what the agents were allowed to touch"
                  : `acted of examined ${MIDDOT} last ${formatCount(runRate.runCount)} runs`
              }
              detail={
                <>
                  <span className="block">
                    The percentage is the share of everything the agents were
                    allowed to touch across the whole programme that they closed
                    without a human.
                  </span>
                  <span className="mt-[6px] block">
                    The line is a different measure and is labelled as one: what
                    each individual run acted on, out of what that run examined.
                    The two move together; they do not share a denominator, so
                    the line is not this percentage&rsquo;s own history.
                  </span>
                </>
              }
              href="#decision-threads"
              hrefLabel="Open decision threads"
            />

            {/*
              The queue that needs a human: rows with no decision row at all.
              Not labelled "escalated", because that word belongs to the
              agent_escalated count -- and these rows also include the buy
              recommendations the agents were never allowed to touch.
            */}
            <KpiCard
              tone="orange"
              icon={<HourglassIcon />}
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
              mark={
                <Bars
                  label={`Decisions closed per day over the fortnight to ${clearedTo ?? "the last recorded day"}`}
                  values={cleared.values}
                />
              }
              basis={
                cleared.latestDay === null
                  ? "no decision has been recorded in your scope"
                  : `${formatCount(cleared.lastSeven)} closed in the 7 days to ${clearedTo}`
              }
              detail={
                <>
                  <span className="block">
                    Open means no decision row exists against the recommendation
                    -- not a status value, and not only the exceptions: buy rows
                    the agents were never allowed to touch are counted here too.{" "}
                    {open.length > displayed.length
                      ? `The ${formatCount(displayed.length)} worth most are listed below.`
                      : "All of them are listed below."}
                  </span>
                  <span className="mt-[6px] block">
                    The bars are throughput, not a burn-down of this number: the
                    recommendations were all generated in one batch while the
                    decision log runs from weeks earlier, so the depth of the
                    queue on a past day cannot be reconstructed from those two
                    columns without inventing it.
                  </span>
                </>
              }
              href="#prioritised-actions"
              hrefLabel="Open the action list"
            />
          </div>
        }
      />

      {/* The work, and the agents that did the rest of it. */}
      <section
        aria-labelledby="queue-heading"
        /* items-start, not the grid default. Merging the two agent panels
           into one made the right column much taller, and a stretched hero
           answered that with 200px of empty peach. The hero is now as tall as
           what it has to say. */
        className="mb-[16px] grid grid-cols-[292px_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1"
      >
        <h2 id="queue-heading" className="sr-only">
          Your queue
        </h2>

        <HeroBrief
          openCount={open.length}
          openWithoutValue={openWithoutValue}
          highlight={highlight}
          queueHref="/exceptions"
        />

        <div id="decision-threads" className="scroll-mt-[76px]">
          <AgentsPanel
            touchless={touchless}
            runs={agentRuns}
            openExceptionCount={openExceptions.length}
            openExceptionValueInr={sumValue(openExceptions)}
          />
        </div>
      </section>

      <section
        aria-labelledby="actions-heading"
        id="prioritised-actions"
        className="mb-[16px] scroll-mt-[76px]"
      >
        <h2 id="actions-heading" className="sr-only">
          Prioritised actions
        </h2>
        <PrioritisedActions
          rows={displayed}
          openTotal={activeType === null ? open.length : filtered.length}
          activeType={activeType}
          countsByType={countsByType}
        />
      </section>

      {/*
        The three arguments the product makes for itself, each open or closed
        on its own. Titles, subtitles and headline figures stay on the page
        whatever is open, so nothing disappears merely because it is collapsed;
        ?evidence= decides which one arrives open, which is what the KPI cards
        above link to.
      */}
      <section
        aria-labelledby="evidence-heading"
        className="flex flex-col gap-[12px]"
      >
        <h2 id="evidence-heading" className="sr-only">
          Evidence
        </h2>

        <EvidenceSection
          id="accuracy"
          title="Accuracy against benchmarks"
          subtitle={
            accuracy && accuracy.foldCount !== null
              ? `${accuracy.foldCount} folds, rolling origin`
              : "Rolling origin backtest"
          }
          defaultOpen={evidence === "accuracy"}
          summary={
            /* Part H: the headline reaches this line only through
               AccuracyStatement, which cannot print it without the margin over
               seasonal naive beside it. */
            accuracy === null ? (
              <span>No accuracy row in scope</span>
            ) : (
              <AccuracyStatement accuracy={accuracy} variant="compact" />
            )
          }
        >
          <AccuracyCard
            bare
            accuracy={accuracy}
            metrics={registryEntry?.metrics ?? null}
          />
        </EvidenceSection>

        <EvidenceSection
          id="impact"
          title="Value realised against projected"
          subtitle="Projected margin from value_summary; realised from decided rows only"
          defaultOpen={evidence === "impact"}
          summary={
            <span>
              <b className="font-extrabold tabular-nums text-ink">
                {formatCrore(summary?.total_margin_inr ?? null)}
              </b>{" "}
              projected {MIDDOT}{" "}
              <b className="font-extrabold tabular-nums text-ink">
                {formatCrore(sumValue(decided))}
              </b>{" "}
              committed
            </span>
          }
        >
          <ImpactTracker
            bare
            summary={summary}
            realisedValueInr={sumValue(decided)}
            decidedCount={decided.length}
            totalCount={recommendations.length}
            totalValueInr={sumValue(recommendations)}
          />
        </EvidenceSection>

        <EvidenceSection
          id="markdown-cover"
          title="Where markdown comes from"
          subtitle="The case brief's attribution, against what the product now covers"
          defaultOpen={evidence === "markdown-cover"}
          summary={
            <span>
              <b className="font-extrabold tabular-nums text-ink">
                {formatCount(coveredDrivers)} of {formatCount(DRIVER_COUNT)}
              </b>{" "}
              drivers with open work
            </span>
          }
        >
          <MarkdownAttribution bare coverage={coverage} />
        </EvidenceSection>
      </section>

      {/*
        PROVENANCE, AS ONE FOOTER.
        What these rows are, which model made them, and what is still sealed
        are one subject: whether the screen above can be trusted this morning.
        They were two blocks with the same 16px gap as every unrelated pair on
        the page, so they read as two afterthoughts instead of one statement.
      */}
      <section aria-labelledby="provenance-heading" className="mt-[16px]">
        <h2 id="provenance-heading" className="sr-only">
          Where this screen comes from
        </h2>

        <EmbargoNotice rows={embargo} />

        <ModelStrip
          className="mt-[8px]"
          modelVersion={modelVersion}
          generatedAt={stamp ? `${stamp} IST` : "not stated on these rows"}
          confidence={weakestConfidence(displayed)}
          why={
            <>
              {accuracy ? <>{accuracySentence(accuracy)} </> : null}
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
      </section>
    </>
  );
}
