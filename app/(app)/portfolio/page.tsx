import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Banner, PageHeader, Why } from "@/components";
import type { KpiItem } from "@/components";
import { AdoptionPanel } from "@/components/portfolio/Adoption";
import { BrandSwitcher } from "@/components/portfolio/BrandSwitcher";
import {
  adoptionFindings,
  readAdoption,
  readBrands,
  readLabels,
  readUndecided,
  readValue,
  resolveScope,
  type Labels,
} from "@/components/portfolio/data";
import {
  formatCount,
  formatCrore,
  formatSignedCrore,
  formatSignedPct,
  joinWords,
} from "@/components/portfolio/format";
import { Explain } from "@/components/portfolio/Layout";
import { MarginBridge } from "@/components/portfolio/MarginBridge";
import { UndecidedPanel } from "@/components/portfolio/Undecided";
import { UnitsAndHolding } from "@/components/portfolio/UnitsAndHolding";
import type {
  AdoptionRow,
  PortfolioScope,
  UndecidedView,
  ValueView,
} from "@/components/portfolio/types";
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
  let adoption: AdoptionRow[] = [];
  let adoptionError: string | null = null;
  let undecided: UndecidedView | null = null;
  let undecidedError: string | null = null;

  // An empty scope is a real state, not an error: a signed-in CMPO whose
  // planner record names no brand reads nothing from dim_brand. Every block
  // below filters on that brand list, so running them would send an empty
  // IN clause to PostgREST for no benefit. They are skipped, and the screen
  // says why rather than rendering five panels of dashes.
  const hasScope = !scopeError && scope.brandIds.length > 0;

  if (hasScope) {
    // FOUR PANELS, FOUR READS. The registry, the interval coverage, the
    // forecast horizon and the markdown concentration are no longer read here
    // because they are no longer rendered here. A page that fetches what it
    // does not render is the over-fetching problem from the performance pass.
    //
    // Every block is independent: one failing costs its own panel and nothing
    // else.
    const [valueResult, adoptionResult, openResult] = await Promise.allSettled([
      readValue(sb, scope, labels),
      readAdoption(sb, scope, labels),
      readUndecided(sb, scope, labels),
    ]);

    if (valueResult.status === "fulfilled") value = valueResult.value;
    else valueError = message(valueResult.reason);

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
        {valueError ? (
          <Explain>
            The value summary could not be read: {valueError}. Nothing has been
            estimated to fill the gap.
          </Explain>
        ) : value ? (
          <div className="flex flex-col gap-[16px]">
            {/* 1 -- what the pilot protected, and by which lever. */}
            <MarginBridge value={value} singleBrand={scope.selected !== null} />
            {/* 2 -- and what it cost to hold. */}
            <UnitsAndHolding value={value} />
          </div>
        ) : null}

        {/* 3 -- work nobody has picked up. */}
        <div className="mt-[16px]">
          {undecidedError ? (
            <Explain>
              The exception backlog could not be read: {undecidedError}.
            </Explain>
          ) : undecided ? (
            <UndecidedPanel view={undecided} />
          ) : null}
        </div>

        {/* 4 -- whether planners accept what the model proposes. */}
        <div className="mt-[16px]">
          {adoptionError ? (
            <Explain>Adoption could not be read: {adoptionError}.</Explain>
          ) : (
            <AdoptionPanel rows={adoption} findings={findings} />
          )}
        </div>

        {/*
          WHERE THE CUT PANELS WENT.

          Four panels left this screen and none was deleted. A link is the
          honest form of "this exists, elsewhere": a CMPO who wants the cycle
          mapping or the markdown concentration reaches it in one click, and
          no number now lives on two screens to drift apart.
        */}
        <div className="mt-[20px] flex flex-wrap items-center gap-[8px]">
          <span className="text-label font-extrabold text-mute">ALSO ON</span>
          {[
            { href: "/model-ops", label: "Planning cycle and model accuracy" },
            { href: "/markdown", label: "Markdown concentration" },
            { href: "/exceptions", label: "The exception queue" },
            { href: "/governance", label: "The decision trail" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-pill bg-cream px-[11px] py-[4px] text-copy font-bold text-ink transition-colors duration-[120ms] hover:bg-peach"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="mt-[14px]">
          <Why
            lead={
              <>
                Every figure above is read from Postgres at request time under
                your own session, so row level security decided its scope
              </>
            }
            label="provenance"
          >
            value_summary supplies the bridge, the unit change and the holding
            cost; v_adoption_kpi the approval rates; v_recommendation_state the
            exception backlog. dim_brand, dim_category and dim_region supply
            names only, never figures. Two figures have no column of their own
            and are quoted rather than re-typed: the holding rate per unit-week
            and the absolute unit counts behind the percentage change live
            inside value_summary&apos;s stored basis sentence, shown verbatim
            behind the disclosure on that panel. Where a figure is authored, it
            is labelled where it appears.
          </Why>
        </div>
        </>
      )}
    </>
  );
}
