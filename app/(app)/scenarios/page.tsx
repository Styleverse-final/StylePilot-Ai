import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  AccuracyStatement,
  Banner,
  Card,
  CardBody,
  CardHeader,
  ModelStrip,
  PageHeader,
  type KpiItem,
} from "@/components";
import { ElasticityCard } from "@/components/scenarios/ElasticityCard";
import { ScenarioWorkbench } from "@/components/scenarios/ScenarioWorkbench";
import type { SavedScenarioView } from "@/components/scenarios/ScenarioWorkbench";
import { ScopeFilters } from "@/components/scenarios/ScopeFilters";
import {
  readAnchor,
  readElasticity,
  readForecastBase,
  readLabels,
  readMarketingEvidence,
  readOwnedCategories,
  readPlanEconomics,
  readSavedScenarios,
  readScopeTriples,
  type ScopeTriple,
} from "@/components/scenarios/data";
import {
  DASH,
  formatFractionPct,
  formatInr,
  formatTimestamp,
  formatUnits,
} from "@/components/scenarios/format";
import { BASE_LEVERS, runScenario } from "@/components/scenarios/model";
import { sameScope, type ScenarioScope } from "@/components/scenarios/note";
import { getAccuracyHeadline, type BrandId } from "@/lib/accuracy";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Scenarios",
};

/**
 * SCENARIOS -- what-if planning against the stored forecast.
 *
 * THE ARCHITECTURE, STATED ON THE SCREEN THAT MOST LOOKS LIKE IT BREAKS IT
 * -----------------------------------------------------------------------
 * A scenario screen looks like the one place a product would have to call a
 * model. It does not, and it could not: the model is scored offline in
 * batch and the answer is already sitting in `forecast`. Moving a slider
 * multiplies those stored rows by a coefficient that was fitted offline too,
 * and both of those numbers were read at request time through
 * createServerAnonClient(), so row level security decides what book a
 * planner explores. There is no /predict endpoint anywhere in this
 * application and this page is the proof rather than the exception.
 *
 * ONE CURVE, TWO SCREENS
 * ----------------------
 * The price and promotion levers use the same fitted elasticity that Part E
 * inverts to time a markdown: log(uplift) = intercept + coefficient x
 * log(1 - depth), per category, from the `elasticity` table. Because the
 * sliders express a CHANGE against the plan's own price point, the answer is
 * a ratio of two points on that curve and the intercept cancels exactly --
 * the same cancellation sv/markdown.py relies on. A scenario depth and a
 * markdown depth therefore cannot drift apart, which is the reason neither
 * module owns its own copy of the arithmetic.
 *
 * Where a category ships the POOLED coefficient rather than its own fit,
 * every result that used it is marked. On this dataset exactly one row
 * carries the flag, and it is read from the table rather than remembered.
 *
 * THE UNIT COLUMN IS THE POINT
 * ----------------------------
 * The case constrains inventory holding cost, so a scenario that lifts gross
 * margin by buying more inventory is not a free win. Every row on this
 * screen carries plan units, the change against the base plan, and the
 * holding cost that change implies -- shaded, beside the margin and never
 * netted into it, exactly as sv/value.py reports the business case. The rate
 * behind it is not a constant in this file: it is read out of
 * policy_parameter, from the same sentence the exceptions screen already
 * prints under its threshold banner.
 *
 * PART H
 * ------
 * The headline accuracy never appears alone. It is rendered through
 * <AccuracyStatement/> in the header and handed to <ModelStrip/> as the
 * whole AccuracyHeadline, which structurally attaches the seasonal-naive
 * margin. The raw pre-calibration p10_p90_coverage in model_registry is not
 * read anywhere on this page; the calibrated coverage in policy_parameter is,
 * along with the fold count that row states in its own basis and the reason
 * that count is lower than the accuracy figure's.
 *
 * The headline belongs to one brand's model. Where this session's brand has
 * no readable planning-grain registry row, no percentage is rendered at all;
 * another brand's number is never borrowed to fill the gap.
 */

/** Saved scenarios shown beside the base plan. Three, as the case asks. */
const SAVED_SCENARIO_LIMIT = 3;

function isBrandId(value: string): value is BrandId {
  return value === "SPD" || value === "ECO";
}

/** First query-string value, or "" -- never a default that names a slice. */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Resolve a requested selection against what this session can read.
 *
 * A dimension the planner cannot see widens to "every one they can", never
 * to some other planner's slice: a hand-edited query string can narrow a
 * scope but it can never reach past RLS, and falling back to a specific
 * value nobody asked for would be its own small lie.
 */
function resolveScope(
  triples: readonly ScopeTriple[],
  want: { category: string; channel: string; region: string },
): ScenarioScope {
  const category = triples.some((triple) => triple.category === want.category)
    ? want.category
    : null;

  const inCategory = triples.filter(
    (triple) => category === null || triple.category === category,
  );
  const channel = inCategory.some((triple) => triple.channel === want.channel)
    ? want.channel
    : null;

  const inChannel = inCategory.filter(
    (triple) => channel === null || triple.channel === channel,
  );
  const region = inChannel.some((triple) => triple.region === want.region)
    ? want.region
    : null;

  return { category, channel, region };
}

function countSeries(
  triples: readonly ScopeTriple[],
  scope: ScenarioScope,
): number {
  return triples.filter(
    (triple) =>
      (scope.category === null || triple.category === scope.category) &&
      (scope.channel === null || triple.channel === scope.channel) &&
      (scope.region === null || triple.region === scope.region),
  ).length;
}

function Explain({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      {title === undefined ? null : <CardHeader title={title} />}
      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const planner = await getSessionPlanner();
  const brandId = planner?.brandId ?? null;

  if (!brandId) {
    return (
      <>
        <PageHeader eyebrow="What-if planning" title="Scenarios" />
        <Explain title="No brand on your planner record">
          You are signed in, but your account is not linked to a planner record,
          so there is no book to run a scenario against. Every figure on this
          screen is built from the forecast rows your session can read, and
          without a planner record row level security has nothing to scope them
          by. Ask your workspace administrator to link your account.
        </Explain>
      </>
    );
  }

  const sb = await createServerAnonClient();
  const params = await searchParams;

  const [triples, labels, elasticity] = await Promise.all([
    readScopeTriples(sb, brandId),
    readLabels(sb),
    readElasticity(sb, brandId),
  ]);

  if (triples.length === 0) {
    return (
      <>
        <PageHeader eyebrow="What-if planning" title="Scenarios" />
        <Explain title="No forecast series in your scope">
          Row level security answered this page with your own session and
          returned no planning-grain forecast rows for {brandId}. That is a
          scope result rather than an error: a planner scoped to a single region
          and a short category list can legitimately see none here while the
          brand carries hundreds. There is nothing to run a scenario over until
          your planning manager widens the scope on your dim_planner row.
        </Explain>
      </>
    );
  }

  const scope = resolveScope(triples, {
    category: one(params.category),
    channel: one(params.channel),
    region: one(params.region),
  });

  const base = await readForecastBase(sb, brandId, scope, elasticity, labels.category);
  const { economics, missing, sources } = await readPlanEconomics(
    sb,
    brandId,
    base.horizonWeeks,
  );

  // PART H. An accuracy figure belongs to ONE brand's model. This used to
  // fall back to accuracies[0] when the find missed, which after the sort is
  // ECO -- so a session on any brand that is not SPD or ECO would have been
  // shown ECO's headline as though it described their own book. There is no
  // fallback now: where this brand has no readable planning-grain registry
  // row, the screen renders no percentage at all and says why.
  const accuracies = isBrandId(brandId)
    ? await getAccuracyHeadline(sb, brandId)
    : [];
  const accuracy = accuracies.find((a) => a.brandId === brandId);

  const scopeLabel =
    `${scope.category === null ? "All categories" : labels.category[scope.category] ?? scope.category}` +
    ` / ${scope.channel === null ? "all channels" : labels.channel[scope.channel] ?? scope.channel}` +
    ` / ${scope.region === null ? "all regions" : labels.region[scope.region] ?? scope.region}`;

  const filters = (
    <ScopeFilters
      triples={triples}
      labels={labels}
      selected={scope}
      seriesCount={countSeries(triples, scope)}
      readableSeries={triples.length}
    />
  );

  if (base.categories.length === 0) {
    return (
      <>
        <PageHeader eyebrow="What-if planning" title="Scenarios" />
        <div className="grid grid-cols-[300px_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
          <Card>
            <CardHeader title="Selection" subtitle="Only combinations your session can read" />
            <CardBody>{filters}</CardBody>
          </Card>
          <Explain title="No forecast rows in this selection">
            The selection resolves to no stored forecast rows for your session,
            so there is no base plan to move. Widen a filter above and the plan,
            the levers and the comparison table all return. Nothing is being
            hidden: the scenario engine reads rows rather than computing a
            forecast, and with no rows there is nothing to apply an elasticity to.
          </Explain>
        </div>
      </>
    );
  }

  if (economics === null) {
    return (
      <>
        <PageHeader eyebrow="What-if planning" title="Scenarios" />
        <Explain title="The thresholds this screen prices with are not readable">
          A scenario is priced with the safety factors the buy plan applies, the
          brand&apos;s own gross margin, and the inventory holding cost quoted in
          policy_parameter. {missing.join(", ")}{" "}
          {missing.length === 1 ? "is" : "are"} not readable in your session, and
          this screen will not substitute a number it cannot source -- a
          scenario built on a guessed rate is worse than no scenario, because it
          looks derived. Everything else on the page is fine; only the pricing
          inputs are missing.
        </Explain>
      </>
    );
  }

  // The base plan, computed on the server with the same pure function the
  // client re-runs on every slider move and the save action re-runs before it
  // writes. One implementation, three callers, no chance of three answers.
  const baseRun = runScenario(base.categories, economics, BASE_LEVERS, 0);

  const ownedCategories = await readOwnedCategories(sb, planner?.employeeId ?? null);
  const restrictToOwned =
    planner?.appRole === "planner" || planner?.appRole === "category_manager";
  const [anchor, savedRows, marketing] = await Promise.all([
    readAnchor(sb, brandId, scope, ownedCategories, restrictToOwned),
    readSavedScenarios(sb, brandId, SAVED_SCENARIO_LIMIT),
    // The marketing lever's caption is a claim about the model, so it is
    // checked against the model's own feature list rather than asserted.
    readMarketingEvidence(sb, base.modelVersions[0] ?? null),
  ]);

  const saved: SavedScenarioView[] = savedRows.map((row) => ({
    key: `saved-${row.decisionId}`,
    name: row.name,
    levers: row.levers,
    scopeLabel:
      `${row.scope.category === null ? "all categories" : labels.category[row.scope.category] ?? row.scope.category}` +
      ` / ${row.scope.channel === null ? "all channels" : labels.channel[row.scope.channel] ?? row.scope.channel}` +
      ` / ${row.scope.region === null ? "all regions" : labels.region[row.scope.region] ?? row.scope.region}`,
    scopeMatchesSelection: sameScope(row.scope, scope),
    accountablePlanner: row.accountablePlanner,
    decidedAtLabel: formatTimestamp(row.decidedAt),
    recommendationId: row.recommendationId,
    // The ledger sentence itself, so the levers re-run below can be checked
    // against the row they were parsed out of rather than taken on trust.
    note: row.note,
  }));

  const anchorNote =
    anchor === null
      ? null
      : anchor.match === "selection"
        ? `It is anchored to recommendation #${anchor.recommendationId}, the smallest buy recommendation inside this selection, because planner_decision.recommendation_id is not nullable and the insert policy resolves category ownership through it.`
        : anchor.match === "owned-category"
          ? `It is anchored to recommendation #${anchor.recommendationId} in ${labels.category[anchor.categoryId ?? ""] ?? anchor.categoryId}, the nearest buy recommendation you may write against; this selection has none of its own.`
          : `It is anchored to recommendation #${anchor.recommendationId}, the smallest buy recommendation in the categories you own. Reading and filing are different rights here: your session can explore any series row level security lets it read, but a scenario can only be FILED against a category you own, and the anchor is how the database checks that rather than this screen.`;

  const saveBlockedReason =
    anchor === null
      ? "No buy recommendation in a category you own is visible to your session, and planner_decision.recommendation_id is NOT NULL with a foreign key. That is not a gap to work around: the anchor is exactly what lets the insert policy check that a planner scenarios their own categories. Without one there is no row the database would accept from you."
      : null;

  // NEITHER fold count is derived from the other. The accuracy count comes
  // from getAccuracyHeadline, which counts the model registry row's own
  // metrics.by_fold; the coverage count is read out of
  // interval_coverage_calibrated's basis sentence, which states it in words
  // ("a mean over 3 folds, NOT four"). This page used to subtract one from
  // the accuracy count and describe the result as read from the registry --
  // an arithmetic guess wearing the clothes of a stored figure. Where a row
  // is unreadable its count is null and the comparison is simply not made.
  const accuracyFolds = accuracy?.foldCount ?? null;
  const coverageFolds = sources.coverageFolds;

  const kpis: KpiItem[] = [
    {
      label: "Series in selection",
      value: String(countSeries(triples, scope)),
      pill: "RLS-scoped",
      tone: "grey",
    },
    {
      label: "Base plan units",
      value: formatUnits(baseRun.planUnits),
      pill: `${base.horizonWeeks} wks`,
      tone: "grey",
    },
    {
      label: "Base gross margin",
      value: formatInr(baseRun.grossMarginInr),
    },
    {
      label: "Holding cost",
      value: `${formatInr(economics.holdingCostPerUnitWeekInr)}/unit-wk`,
      pill: "policy_parameter",
      tone: "amber",
    },
  ];

  const modelVersion =
    base.modelVersions.length > 0 ? base.modelVersions.join(" + ") : DASH;

  return (
    <>
      <PageHeader eyebrow="What-if planning" title="Scenarios" kpis={kpis}>
        {accuracy === undefined ? (
          // An honest absence, not a borrowed number. Part H's rule is that
          // the headline never travels without its seasonal-naive margin;
          // the rule behind that one is that it never travels away from the
          // brand whose model produced it.
          <p className="max-w-[92ch] text-[11.5px] font-semibold leading-[1.55] text-mute">
            No backtested accuracy is shown for {brandId}. The accuracy figures
            on this application come from planning-grain model registry rows,
            and none is readable for this brand in your session. Another
            brand&apos;s model was fitted on another brand&apos;s book, so
            quoting its number here would describe a plan it never saw.
          </p>
        ) : (
          // Part H: the headline never travels without the seasonal-naive
          // margin, and this component is the only thing that renders it.
          <AccuracyStatement accuracy={accuracy} variant="inline" />
        )}
      </PageHeader>

      <Banner
        variant="violet"
        icon="i"
        title="Nothing on this screen calls a model."
        measureCh={96}
      >
        The forecast was scored offline and written to the database; a lever
        multiplies those stored rows by an elasticity that was fitted offline
        too. This page read {formatUnits(base.rowCount)} forecast rows across{" "}
        {base.seriesCount} series stamped{" "}
        <span className="font-mono text-[11px]">{modelVersion}</span> and{" "}
        {elasticity.size}{" "}
        {elasticity.size === 1 ? "elasticity row" : "elasticity rows"} for{" "}
        {brandId}, both under your own session. That elasticity read is not
        narrowed by the selection -- it fetches every fitted row your session
        can see for the brand, and{" "}
        {base.categories.filter((category) => category.fit !== null).length} of
        them meet a category in this selection. Every figure below is arithmetic
        on those rows.
        {base.rowsWithoutInterval > 0 ? (
          <>
            {" "}
            {formatUnits(base.rowsWithoutInterval)} of them carry no published
            p90, so they contribute demand but no interval, and the lost-sales
            column understates by exactly that much.
          </>
        ) : null}
        {base.truncated ? (
          <>
            {" "}
            <b className="text-amber">
              The read hit its row ceiling, so these sums are partial.
            </b>
          </>
        ) : null}
      </Banner>

      {sources.coverageMeasured === null ? null : (
        <Banner
          variant="amber"
          icon="%"
          title={`The lost-sales column rests on the calibrated interval, whose coverage measures ${formatFractionPct(sources.coverageMeasured)} against a nominal ${formatFractionPct(sources.coverageNominal)}.`}
          measureCh={96}
        >
          {coverageFolds === null ? (
            <>
              Its own parameter row does not state how many folds that mean
              covers, so this page does not either -- a count inferred from the
              accuracy figure would be this screen&apos;s arithmetic quoted as
              though it were a stored one.
            </>
          ) : accuracyFolds === null ? (
            <>
              That coverage is a mean over {coverageFolds} folds, as its own
              parameter row states. No model registry row is readable in your
              scope, so the accuracy fold count it is fewer than is not named
              here.
            </>
          ) : (
            <>
              That coverage is a mean over {coverageFolds} folds, as its own
              parameter row states, not the {accuracyFolds} behind the accuracy
              figure above.
            </>
          )}{" "}
          Split-conformal calibration fits its widening offset on a prior fold,
          so the first fold has nothing to calibrate against and drops out; the
          two counts differ by design rather than by reporting choice. The raw
          pre-calibration coverage in the model registry is a much lower number,
          it describes a band that was never shipped, and it is not read
          anywhere on this page.
        </Banner>
      )}

      <ModelStrip
        className="mb-[16px]"
        modelVersion={modelVersion}
        generatedAt={formatTimestamp(base.generatedAt)}
        // The whole AccuracyHeadline, not a bare percentage: the strip
        // attaches the seasonal-naive margin itself, which is what makes the
        // flattering number impossible to quote on its own.
        accuracy={accuracy}
        why={
          <>
            <p>
              The base plan is {formatUnits(baseRun.planUnits)} units over{" "}
              {base.horizonWeeks} weeks: the stored p50 demand plus the safety
              stock the buy plan already applies, which is sum(p90 - p50) times{" "}
              {economics.spreadFactor} times {economics.aggregationFactor}, both
              read from policy_parameter. Run at the base setting it lands on
              the buy screen&apos;s own recommended quantity to within the
              per-row rounding in its stored payload, so the scenario is moving
              the plan a planner is actually committing to rather than a number
              invented for this page.
            </p>
            <p className="mt-[8px]">
              Price and promotion run through the fitted per-category
              elasticity. The marketing index does not -- nothing in this
              dataset measures a marketing response, so it is a stated
              assumption and is labelled as one beside the slider. The capacity
              cap runs no curve at all.
            </p>
            {accuracy === undefined ? null : (
              <p className="mt-[8px]">
                Forward actuals are under embargo, so none of the accuracy above
                is measured against the weeks this plan covers. It is a
                historical rolling-origin backtest and nothing else.
              </p>
            )}
          </>
        }
      />

      <ScenarioWorkbench
        bases={base.categories}
        economics={economics}
        saved={saved}
        scope={scope}
        scopeLabel={scopeLabel}
        role={planner?.appRole ?? null}
        anchorNote={anchorNote}
        saveBlockedReason={saveBlockedReason}
        clearanceSentence={sources.serviceLevelBasis}
        coverageMeasured={sources.coverageMeasured}
        coverageFolds={coverageFolds}
        accuracyFolds={accuracyFolds}
        marketing={marketing}
        filters={filters}
      />

      <div className="mt-[16px] grid grid-cols-[1fr_360px] items-start gap-[16px] max-[1140px]:grid-cols-1">
        <Card>
          <CardHeader
            title="The fitted curve"
            subtitle="Estimated from observed promotions, not assumed"
          />
          <ElasticityCard bases={base.categories} />
        </Card>

        <Card>
          <CardHeader
            title="Where the two rates come from"
            subtitle="Both read, neither typed in"
          />
          <CardBody>
            <div className="border-b border-rule pb-[12px]">
              <div className="text-[10.5px] font-bold text-mute">
                Inventory holding cost
              </div>
              <div className="mt-[2px] text-[14px] font-extrabold tabular-nums text-ink">
                {formatInr(economics.holdingCostPerUnitWeekInr)} per unit-week
              </div>
              <p className="mt-[5px] text-[11.5px] leading-[1.6] text-body">
                Read out of{" "}
                <span className="font-mono text-[11px]">
                  {sources.holdingCostParam ?? "policy_parameter"}
                </span>
                , whose override reason prices the cover ceiling against it. The
                exceptions screen prints that same sentence verbatim, so the two
                screens cannot drift:
              </p>
              {sources.holdingCostSentence === null ? null : (
                <p className="mt-[6px] rounded-quote bg-shell px-[12px] py-[9px] text-[11.5px] leading-[1.55] text-body">
                  {sources.holdingCostSentence}
                </p>
              )}
            </div>

            <div className="pt-[12px]">
              <div className="text-[10.5px] font-bold text-mute">
                Cost of a stranded unit
              </div>
              <div className="mt-[2px] text-[14px] font-extrabold tabular-nums text-ink">
                {formatInr(economics.clearanceCostPerUnitInr)} per unit
              </div>
              <p className="mt-[5px] text-[11.5px] leading-[1.6] text-body">
                The cover-ceiling row publishes{" "}
                <span className="tabular-nums">
                  {sources.breakevenWeeks?.toFixed(2) ?? DASH}
                </span>{" "}
                weeks as the point where carrying a unit costs what clearing it
                costs, which is average selling price times markdown depth
                divided by the holding cost. Multiplying it back returns average
                selling price times markdown depth -- the newsvendor&apos;s cost
                of being long one unit, and the number the markdown column is
                priced at. The service-level row states the same quantity in
                words:
              </p>
              {sources.serviceLevelBasis === null ? null : (
                <p className="mt-[6px] rounded-quote bg-shell px-[12px] py-[9px] text-[11.5px] leading-[1.55] text-body">
                  {sources.serviceLevelBasis}
                </p>
              )}
            </div>

            {sources.spreadFactorComputed === null ||
            sources.spreadFactorApplied === null ||
            sources.spreadFactorComputed === sources.spreadFactorApplied ? null : (
              <div className="mt-[12px] border-t border-rule pt-[12px] text-[11.5px] leading-[1.6] text-mute">
                <b className="text-ink">
                  The safety factor in force is not the one the arithmetic
                  derives.
                </b>{" "}
                The plan applies {sources.spreadFactorApplied} where the
                derivation gives {sources.spreadFactorComputed}, and that gap is
                what the lost-sales column is measuring the cost of.{" "}
                {sources.spreadFactorOverride ?? ""}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
