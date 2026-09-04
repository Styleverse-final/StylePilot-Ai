import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Banner, Card, CardBody, PageHeader } from "@/components";
import type { KpiItem } from "@/components";
import {
  AccuracyByBrand,
  IntervalQuality,
  NoCategoryAccuracy,
  type BrandAccuracy,
} from "@/components/portfolio/AccuracyByBrand";
import { AdoptionPanel } from "@/components/portfolio/Adoption";
import { BrandSwitcher } from "@/components/portfolio/BrandSwitcher";
import { CycleStages } from "@/components/portfolio/CycleStages";
import {
  adoptionFindings,
  benchmarkRows,
  categoryEvidence,
  readAdoption,
  readBrands,
  readCountsByType,
  readCoverage,
  readHorizon,
  readLabels,
  readMarkdown,
  readRegistry,
  readStageBands,
  readUndecided,
  readValue,
  resolveScope,
  type Labels,
} from "@/components/portfolio/data";
import {
  DASH,
  formatCount,
  formatCrore,
  formatSignedCrore,
  formatSignedPct,
  joinWords,
} from "@/components/portfolio/format";
import { Explain, SectionHeading } from "@/components/portfolio/Layout";
import { MarginBridge } from "@/components/portfolio/MarginBridge";
import { MarkdownConcentration } from "@/components/portfolio/MarkdownConcentration";
import { UndecidedPanel } from "@/components/portfolio/Undecided";
import { UnitsAndHolding } from "@/components/portfolio/UnitsAndHolding";
import type {
  AdoptionRow,
  CoverageRow,
  MarkdownView,
  PortfolioScope,
  UndecidedView,
  ValueView,
} from "@/components/portfolio/types";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Portfolio" };

/**
 * /portfolio -- where a CMPO lands.
 *
 * A PLANNER SEES DECISIONS. A CMPO SEES CONSEQUENCES.
 * ---------------------------------------------------
 * That is the entire design brief for this screen and it is expressed
 * structurally rather than by disabling things. There is no task queue here,
 * no Approve, no Modify, no row that can be committed. The nav a CMPO gets
 * does not even carry the decision loop. Where a figure on this page could
 * be mistaken for an action -- the undecided exceptions, the markdown
 * recommendations -- it is deliberately rendered without a control and the
 * panel says whose act it would be instead.
 *
 * The temptation this screen exists to resist is becoming the dashboard with
 * more rows. What separates it is that every block answers a question a
 * planner cannot answer from their own queue: what did the pilot protect,
 * what did protecting it cost, how good is the forecast underneath it
 * really, where is the exposure concentrated, is the function using any of
 * this, and what has nobody done.
 *
 * SCOPE IS POSTGRES'S DECISION, NOT THIS FILE'S
 * ---------------------------------------------
 * Every read goes through createServerAnonClient(), which carries the
 * signed-in CMPO's session cookie. dim_brand hands back one brand or two
 * depending on the role, and the brand switcher is built from whatever came
 * back rather than from an inspection of the role string. `?brand=` is a
 * REQUEST that is resolved against that set: a brand this session cannot
 * read resolves to the full scope and the screen says so out loud. There is
 * no service-role client anywhere in this tree.
 *
 * FIVE INDEPENDENT READS, FIVE INDEPENDENT FAILURES
 * -------------------------------------------------
 * The blocks below answer different questions from different tables under
 * different policies. Wrapping them in one try meant the adoption view
 * failing threw away a margin bridge that had already been read. Each block
 * degrades on its own and names which one failed, because a CMPO losing the
 * whole screen because a markdown join timed out is a worse product than a
 * CMPO losing one panel and being told which.
 *
 * PART H
 * ------
 * Accuracy reaches this screen only through <AccuracyStatement/> and through
 * <ModelStrip accuracy={AccuracyHeadline}/>, both inside AccuracyByBrand.
 * Nothing on this page renders a headline accuracy on its own, and the
 * header KPI row deliberately carries no accuracy figure at all -- a
 * standalone percentage in a KPI slot is exactly the shape Part H forbids.
 */

const PORTFOLIO_ROLES: readonly string[] = ["cmpo", "group_cmpo"];

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The four figures a CMPO reads first: what was protected, what it cost, and
 * what is outstanding. No accuracy here, by design.
 */
function headerKpis(
  value: ValueView | null,
  undecided: UndecidedView | null,
): KpiItem[] {
  const kpis: KpiItem[] = [];
  const row = value?.headline ?? null;

  if (row) {
    kpis.push({
      label: "Margin protected",
      value: formatCrore(row.totalMarginInr),
      // The pill names the scope the figure covers, counted from the rows
      // rather than assuming the pilot has exactly two brands in it.
      pill:
        row.scope === "PORTFOLIO"
          ? `${value?.brands.length ?? 0} brands`
          : row.label,
      tone: "up",
    });
    // A portfolio unit change that nets a rise against a fall describes
    // neither brand, so the pill says so -- and it says so only when the
    // rows actually diverge, checked here rather than assumed.
    const brandsUp = (value?.brands ?? []).filter(
      (brand) => (brand.unitChangePct ?? 0) > 0,
    ).length;
    const brandsDown = (value?.brands ?? []).filter(
      (brand) => (brand.unitChangePct ?? 0) < 0,
    ).length;

    kpis.push({
      label: "Units vs manual plan",
      value: formatSignedPct(row.unitChangePct),
      pill:
        row.scope === "PORTFOLIO" && brandsUp > 0 && brandsDown > 0
          ? "net of opposite moves"
          : undefined,
      tone: (row.unitChangePct ?? 0) >= 0 ? "orange" : "grey",
    });
    kpis.push({
      label: "Holding cost",
      value: formatSignedCrore(row.holdingCostInr),
      tone: (row.holdingCostInr ?? 0) > 0 ? "amber" : "up",
    });
  }

  if (undecided && undecided.totalExceptions > 0) {
    kpis.push({
      label: "Exceptions with no decision",
      value: `${formatCount(undecided.undecided)} / ${formatCount(undecided.totalExceptions)}`,
      pill: `${formatCrore(undecided.valueInr)} exposed`,
      tone: "down",
    });
  }

  return kpis;
}

/** The accuracy cards, one per brand in scope, assembled from the registry. */
function brandAccuracies(
  headlines: readonly AccuracyHeadline[],
  scope: PortfolioScope,
  labels: Labels,
): BrandAccuracy[] {
  return headlines
    .filter((headline) => scope.brandIds.includes(headline.brandId))
    .map((headline) => ({
      brandId: headline.brandId,
      label: labels.brand[headline.brandId] ?? headline.brandId,
      accuracy: headline,
      benchmarks: benchmarkRows(headline),
    }));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function PortfolioPage({ searchParams }: PageProps) {
  const [planner, params] = await Promise.all([
    getSessionPlanner(),
    searchParams,
  ]);
  if (!planner) redirect("/login");
  if (!PORTFOLIO_ROLES.includes(planner.appRole ?? "")) redirect("/");

  const sb = await createServerAnonClient();

  // Scope first: nothing else can be read until we know which brands row
  // level security returned, and the switcher is built from that set.
  let scope: PortfolioScope = {
    brands: [],
    requested: null,
    selected: null,
    requestedOutOfScope: false,
    brandIds: [],
  };
  let labels: Labels = { category: {}, region: {}, brand: {} };
  let scopeError: string | null = null;

  try {
    const brands = await readBrands(sb);
    scope = resolveScope(brands, params.brand);
    labels = await readLabels(sb, brands);
  } catch (error) {
    scopeError = message(error);
  }

  const brandLabels = scope.brands
    .filter((brand) => scope.brandIds.includes(brand.brandId))
    .map((brand) => brand.brandName);

  let value: ValueView | null = null;
  let valueError: string | null = null;
  let accuracies: BrandAccuracy[] = [];
  let coverage: CoverageRow[] = [];
  let accuracyFolds: number | null = null;
  let categoryProof = { categoryKeys: [] as string[], registryRows: 0 };
  let horizon = {
    horizonWeeks: null as number | null,
    forecastFirstWeek: null as string | null,
    forecastLastWeek: null as string | null,
    factLastWeek: null as string | null,
    overlapRows: null as number | null,
    noOverlap: false,
  };
  let accuracyError: string | null = null;
  let markdown: MarkdownView | null = null;
  let markdownError: string | null = null;
  let adoption: AdoptionRow[] = [];
  let adoptionError: string | null = null;
  let undecided: UndecidedView | null = null;
  let undecidedError: string | null = null;

  // An empty scope is a real state, not an error: a signed-in CMPO whose
  // planner record names no brand reads nothing from dim_brand. Every block
  // below filters on that brand list, so running them would send an empty
  // IN clause to PostgREST for no benefit. They are skipped, and the screen
  // says why rather than rendering five panels of dashes.
  // The cycle panel's two inputs. Both fail soft: with no bands readable
  // the classifier cannot promote any stage to AUTOMATED, which is the safe
  // direction -- it under-claims automation rather than over-claiming it.
  const [stageBands, countsByType] = await Promise.all([
    readStageBands(sb).catch(() => []),
    readCountsByType(sb, scope.brandIds).catch(() => ({})),
  ]);

  const hasScope = !scopeError && scope.brandIds.length > 0;

  if (hasScope) {
    // Two blocks need the horizon -- the accuracy section to say there is no
    // overlap to rescore, the markdown section to size its trailing window --
    // so it is read ONCE and awaited in both. Sharing the promise rather than
    // the result keeps the two blocks independent: if the read fails, each
    // fails on its own and reports it in its own panel.
    const horizonRead = readHorizon(sb);

    // Every block is independent. One failing costs its own panel and
    // nothing else; a single try around all of them meant one slow join
    // taking the whole screen down with it.
    const [valueResult, accuracyResult, markdownResult, adoptionResult, openResult] =
      await Promise.allSettled([
        readValue(sb, scope, labels),
        (async () => {
          const [entries, headlines, window] = await Promise.all([
            readRegistry(sb),
            getAccuracyHeadline(sb),
            horizonRead,
          ]);
          return {
            entries,
            headlines,
            window,
            coverage: await readCoverage(sb, scope, entries),
          };
        })(),
        (async () => readMarkdown(sb, scope, labels, await horizonRead))(),
        readAdoption(sb, scope, labels),
        readUndecided(sb, scope, labels),
      ]);

    if (valueResult.status === "fulfilled") value = valueResult.value;
    else valueError = message(valueResult.reason);

    if (accuracyResult.status === "fulfilled") {
      const { entries, headlines, window, coverage: rows } = accuracyResult.value;
      accuracies = brandAccuracies(headlines, scope, labels);
      coverage = rows;
      horizon = window;
      categoryProof = categoryEvidence(entries);
      // The fold count travels with the headline and nowhere else. Where two
      // brands disagree, no count is claimed rather than one being picked.
      const counts = new Set(accuracies.map((entry) => entry.accuracy.foldCount));
      accuracyFolds =
        counts.size === 1 ? (accuracies[0]?.accuracy.foldCount ?? null) : null;
    } else {
      accuracyError = message(accuracyResult.reason);
    }

    if (markdownResult.status === "fulfilled") markdown = markdownResult.value;
    else markdownError = message(markdownResult.reason);

    if (adoptionResult.status === "fulfilled") adoption = adoptionResult.value;
    else adoptionError = message(adoptionResult.reason);

    if (openResult.status === "fulfilled") undecided = openResult.value;
    else undecidedError = message(openResult.reason);
  }

  const findings = adoptionFindings(adoption);

  return (
    <>
      <PageHeader
        eyebrow={
          scope.selected
            ? `Brand portfolio - ${labels.brand[scope.selected] ?? scope.selected}`
            : brandLabels.length > 1
              ? `Group portfolio - ${joinWords(brandLabels)}`
              : brandLabels.length === 1
                ? `Brand portfolio - ${brandLabels[0]}`
                : "Portfolio"
        }
        title="Portfolio"
        kpis={headerKpis(value, undecided)}
      />

      {scopeError ? (
        <Explain>
          The brands in your scope could not be read: {scopeError}. Nothing
          below could be scoped without that, so nothing below is shown rather
          than being shown against a guess. Row level security decides which
          brands you see; this page does not, which is why it cannot fall back
          to a default.
        </Explain>
      ) : scope.brandIds.length === 0 ? (
        <Explain>
          You are signed in as a {planner.appRole ?? "portfolio"} user, but
          dim_brand returned no brand for your session, so there is no scope to
          report against. Every figure on this screen is filtered by that brand
          list and none of them is estimated in its absence. What would appear
          is the margin the pilot protected and what it cost to hold, forecast
          accuracy against four benchmarks, where the markdown exposure sits,
          how the function is using the recommendations, and what nobody has
          decided. Which brands you can read is decided by row level security
          against your planner record; ask whoever maintains it, because this
          page cannot widen your own scope.
        </Explain>
      ) : null}

      {scope.requestedOutOfScope ? (
        <Banner variant="amber" icon="!" title="That brand is not in your scope">
          The URL asked for brand{" "}
          <b>&quot;{scope.requested}&quot;</b>, which row level security did
          not return for your session. The screen is showing everything you
          can read instead of the brand you asked for, because silently
          rendering different figures under a requested brand&apos;s name is
          worse than saying so. If that brand should be yours, it is a
          question for whoever maintains your planner record, not something
          this page can grant.
        </Banner>
      ) : null}

      <BrandSwitcher scope={scope} />

      {!hasScope ? null : (
        <>
        <Banner
          variant="violet"
          icon="i"
          title="This screen has no decisions on it, and that is the point"
          measureCh={100}
        >
          A planner&apos;s screens are a queue: rows to approve, modify or
          reject, each one logged against their name. This one is the
          consequences of that queue. Nothing here can be committed, nothing is
          overdue, and where a figure describes work somebody has not done, the
          panel says whose act it would be rather than offering you a button to
          do it for them. Every number is read from Postgres at request time
          under your own session
          {brandLabels.length > 1 ? `, across ${joinWords(brandLabels)}` : ""}.
        </Banner>

        <SectionHeading
          eyebrow="What the pilot protected"
          title="Margin, and what it cost to hold"
        >
          value_summary records the CHANGE against the manual plan over the
          forward horizon, not the level, so the bridge opens at the plan as it
          stands rather than at a rupee figure {DASH} no
          table in this schema holds the absolute margin of the plan being
          changed. The two levers stay apart because they are bought with
          different things, and the holding cost sits beside the margin at the
          same size because the case constrains it.
        </SectionHeading>

        {valueError ? (
          <Explain>
            The value summary could not be read: {valueError}. Every other block
            on this screen was read separately and stands on its own. Nothing has
            been estimated to fill the gap, because a margin bridge assembled
            without its rows would be a drawing rather than a figure.
          </Explain>
        ) : value ? (
          <div className="flex flex-col gap-[16px]">
            <MarginBridge value={value} singleBrand={scope.selected !== null} />
            <UnitsAndHolding value={value} />
          </div>
        ) : null}

        <SectionHeading
          eyebrow="What changed about the way the work is done"
          title="The planning cycle, stage by stage"
        >
          Deliverable 1a asks which steps this removes, shortens or replaces,
          and 1b asks what ends up automated. Both are answered here, and
          neither is answered with a saved-weeks figure, because none has been
          measured.
        </SectionHeading>

        <CycleStages
          className="mb-[16px]"
          bands={stageBands}
          countsByType={countsByType}
        />

        <SectionHeading
          eyebrow="How good the forecast underneath it is"
          title="Accuracy by brand, against four benchmarks"
        >
          One benchmark proves nothing and the flattering one proves least.
          Seasonal naive is the comparison that counts: nobody constructed it,
          it carries the seasonality the business actually has, and the margin
          over it is small. The manual baseline was authored and calibrated to a
          target, so the large margin over it describes the fixture as much as
          the model. Both travel together, always, and the panel at the end of
          this section explains why there is no per-category cut.
        </SectionHeading>

        {accuracyError ? (
          <Explain>
            The model registry could not be read: {accuracyError}. No accuracy
            figure is shown rather than an approximate one, and no benchmark
            margin is inferred from anything else on this screen.
          </Explain>
        ) : (
          <div className="flex flex-col gap-[16px]">
            <AccuracyByBrand entries={accuracies} />
            <IntervalQuality
              rows={coverage}
              labels={labels.brand}
              accuracyFolds={accuracyFolds}
            />
            <NoCategoryAccuracy
              horizon={horizon}
              evidence={categoryProof}
              brandLabels={accuracies.map((entry) => entry.label)}
            />
          </div>
        )}

        <SectionHeading
          eyebrow="Where the exposure sits"
          title="Markdown concentration, by category and by region"
        >
          A single portfolio markdown figure is true and useless. What a CMPO
          needs is whether the loss is spread or piled, and the only way to tell
          is to put the rate beside the rupees: a big region always carries more
          markdown than a small one, which is arithmetic, not a finding.
        </SectionHeading>

        {markdownError ? (
          <Explain>
            The markdown concentration could not be read: {markdownError}. The
            realised-loss cut and the optimiser&apos;s recommendations come from
            two different tables and both are missing here; neither is
            substituted for the other.
          </Explain>
        ) : markdown ? (
          <MarkdownConcentration markdown={markdown} brandLabels={brandLabels} />
        ) : null}

        <SectionHeading
          eyebrow="Is the function using any of it"
          title="Adoption across the recommendation types"
        >
          Engagement and agreement are different failures and a single adoption
          percentage hides which one you have. They are kept apart here, and
          where nothing has been decided the rate is rendered as an absence
          rather than as a zero {DASH} a plan nobody has
          opened and a plan everybody rejected are opposite problems.
        </SectionHeading>

        {adoptionError ? (
          <Explain>
            The adoption view could not be read: {adoptionError}. No approval
            rate is estimated from the decision ledger directly, because the view
            applies the same definition across brands and a hand-rolled count
            here would quietly use a different one.
          </Explain>
        ) : (
          <AdoptionPanel rows={adoption} findings={findings} />
        )}

        <SectionHeading
          eyebrow="What nobody has done"
          title="Exceptions above threshold with no decision logged"
        >
          Not what to do about them {DASH} that is a
          planner&apos;s queue and it lives elsewhere. This is the shape of the
          backlog: which severity band, which brand, which category, and what
          share of each was raised and then left. The share is the finding; the
          count on its own is not.
        </SectionHeading>

        {undecidedError ? (
          <Explain>
            The exception state could not be read: {undecidedError}. No partial
            count is shown, because an undecided count without the total it came
            out of is the one form of this figure that always misleads.
          </Explain>
        ) : undecided ? (
          <UndecidedPanel view={undecided} />
        ) : null}

        <div className="mt-[26px]">
          <Card>
            <CardBody>
              <div className="text-micro font-extrabold tracking-[0.06em] text-mute">
                WHERE EVERY NUMBER ON THIS PAGE CAME FROM
              </div>
              <p className="mt-[6px] max-w-[100ch] text-copy leading-[1.6] text-body">
                Every figure above is read from Postgres at request time through
                your own session, so row level security decided the scope of all
                of it: value_summary for the bridge, the units and the holding
                cost; model_registry for the accuracy and the four benchmarks;
                policy_parameter for the calibrated interval coverage;
                fact_demand_weekly for realised markdown and
                markdown_recommendation for the recommended exposure;
                v_adoption_kpi for adoption; and v_recommendation_state for the
                exception backlog. The trailing markdown window is the published
                forecast horizon read from forecast.horizon_week rather than a
                chosen number of weeks, and the overlap count behind the
                per-category refusal is a live count against that same table.
                dim_brand, dim_category and dim_region supply names only, never
                figures. No figure on this screen is written into its code, and
                there is no constant file behind it.
              </p>
              <p className="mt-[9px] max-w-[100ch] text-copy leading-[1.6] text-body">
                Two figures genuinely have no column of their own and both are
                handled the same way, by quotation rather than by re-typing: the
                holding rate per unit-week and the absolute unit counts behind
                the percentage change live only inside value_summary&apos;s
                stored <span className="font-mono text-[11.5px]">basis</span>{" "}
                sentence, and the fold arithmetic behind the calibrated coverage
                lives only inside policy_parameter&apos;s. Both strings are shown
                verbatim behind the disclosures marked &quot;the derivation
                stored beside...&quot;, and neither is lifted out into a
                headline or a KPI.
              </p>
              <p className="mt-[9px] max-w-[100ch] text-copy leading-[1.6] text-body">
                Those two are the ones worth naming, because they carry figures
                a reader might otherwise go looking for a column behind. This
                paragraph used to end by calling that the complete list of
                everything on the page without a table. It was not, and the
                claim has been withdrawn rather than patched: an assurance that
                every number has been accounted for is the one statement here
                that stops you checking, so it should only be made by something
                that can actually enumerate the page. Where a figure is
                authored, it is labelled where it appears.
              </p>
            </CardBody>
          </Card>
        </div>
        </>
      )}
    </>
  );
}
